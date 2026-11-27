import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import https from 'node:https'
import dgram from 'node:dgram'
import {randomBytes,randomUUID,createHmac,timingSafeEqual} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {writeJSON} from './policy.js'
const exec=promisify(execFile), discoveryPort=39681
const lan=ip=>net.isIPv4(ip)&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(ip)
const mac=(code,cert)=>createHmac('sha256',code).update(cert).digest('hex')
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&/^[a-f0-9]+$/.test(a)&&timingSafeEqual(Buffer.from(a),Buffer.from(b))
const deviceName=(s)=>String(s||'DSH').slice(0,40).replace(/[\x00-\x1f]/g,'')
function interfaces(){try{return Object.values(os.networkInterfaces()).flat().filter(x=>x.family==='IPv4'&&!x.internal&&lan(x.address))}catch{return []}}
async function body(stream){let text='';for await(const chunk of stream){text+=chunk;if(text.length>12000)throw Error('Message too large')}return JSON.parse(text)}
async function listen(server,port=0){await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'0.0.0.0',ok)});return server.address().port}
function get(host,port,url,cert,post){
 return new Promise((ok,no)=>{const req=https.request({host,port,path:url,method:post?'POST':'GET',agent:false,rejectUnauthorized:!!cert,...(cert?{ca:cert,servername:'dsh-peer.local'}:{}),timeout:5000},async res=>{
 try{if(res.statusCode!==200)throw Error('对端拒绝配对 / Pairing rejected');ok(await body(res))}catch(e){no(e)}
 });req.on('error',no);req.on('timeout',()=>req.destroy(Error('配对超时 / Timeout')));req.end(post?JSON.stringify(post):undefined)})
}
export class Pairing{
 constructor(home,defaults,start){this.home=home;this.defaults=defaults;this.start=start;this.near=new Map();this.dir=path.join(home,'peer-sync-devices')}
 async init(){
  await fs.mkdir(this.dir,{recursive:true,mode:0o700})
  const f=path.join(this.dir,'device.json')
  try{this.device=JSON.parse(await fs.readFile(f))}catch(e){if(e.code!=='ENOENT')throw e;this.device={id:randomUUID(),name:deviceName(process.env.ANDROID_ROOT?'Android · '+os.hostname():os.hostname())};await writeJSON(f,this.device)}
  this.device.platform=process.platform==='win32'?'Windows DSH':'DSH Go'
  for(const n of await fs.readdir(this.dir))if(/^[a-f0-9-]{36}$/.test(n)){
    try{const c=JSON.parse(await fs.readFile(path.join(this.dir,n,'config.json')));this.start(c)}catch(e){this.error=e.message}
  }
  this.udp=dgram.createSocket({type:'udp4',reuseAddr:true})
  this.udp.on('error',e=>{this.error=e.message})
  this.udp.on('message',(b,src)=>{if(b.length>160||!lan(src.address)||b.toString()!=='DSH-PEER-FIND-1')return
    const info=Buffer.from(JSON.stringify({...this.device,port:this.offer?.port||0,protocol:'dsh-peer-1'}))
    this.udp.send(info,src.port,src.address)
  })
  this.udp.bind(discoveryPort,'0.0.0.0')
 }
 async scan(extra=[]){
  const sock=dgram.createSocket('udp4');const found=new Map()
  try{await new Promise((ok,no)=>{sock.once('error',no);sock.bind(0,ok)});sock.setBroadcast(true)
    sock.on('message',(b,src)=>{if(b.length>550||!lan(src.address))return;try{const x=JSON.parse(b);if(x.protocol==='dsh-peer-1'&&/^[a-f0-9-]{36}$/.test(x.id)&&x.id!==this.device.id&&Number.isInteger(x.port)&&x.port>=0&&x.port<65536)found.set(x.id,{id:x.id,name:deviceName(x.name),platform:['Windows DSH','DSH Go'].includes(x.platform)?x.platform:'DSH',host:src.address,port:x.port,seen:Date.now()})}catch{}})
    const targets=new Set(['255.255.255.255',...extra.filter(lan),...interfaces().map(x=>x.address.split('.').map((n,i)=>Number(n)|(255-Number(x.netmask.split('.')[i]))).join('.'))])
    for(const ip of targets)sock.send('DSH-PEER-FIND-1',discoveryPort,ip)
    await new Promise(r=>setTimeout(r,850));this.near=found
  }finally{sock.close()}
 }
 async config(defaults,id,role,remote,port,secret,cert,priv,host){
  const base=path.join(this.dir,id);await fs.mkdir(base,{recursive:true,mode:0o700})
  const certFile=path.join(base,'peer.crt');await fs.writeFile(certFile,cert,{mode:0o600})
  const c={...defaults,device:role,remoteName:deviceName(remote),visualPair:true,exchange:path.join(base,'exchange'),autoCheckUpdates:false,lan:{key:secret,port,certFile}}
  if(priv){c.lan.bind='0.0.0.0';c.lan.privateKeyFile=path.join(base,'peer.key');await fs.writeFile(c.lan.privateKeyFile,priv,{mode:0o600})}else c.lan.host=host
  await writeJSON(path.join(base,'config.json'),c);this.start(c);return c
 }
 invite(){if(!this.pending)this.pending=this.makeOffer().finally(()=>{this.pending=null});return this.pending}
 async makeOffer(){
  if(this.offer&&!this.offer.used)return this.offer
  this.endOffer()
  const defaults=await this.defaults()
  const stage=await fs.mkdtemp(path.join(this.dir,'invite-')),code=randomBytes(10).toString('hex'),id=randomUUID()
  let cert,priv
  let openssl='openssl'
  if(process.platform==='win32'){
   const candidates=[path.join(os.homedir(),'scoop/apps/git/current/usr/bin/openssl.exe'),path.join(process.env.ProgramFiles||'C:/Program Files','Git/usr/bin/openssl.exe')]
   for(const f of candidates)if(await fs.stat(f).catch(()=>null)){openssl=f;break}
  }
  try{await exec(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','1825','-subj','/CN=dsh-peer.local','-addext','subjectAltName=DNS:dsh-peer.local','-keyout','key','-out','cert'],{cwd:stage,timeout:20000,windowsHide:true});cert=await fs.readFile(path.join(stage,'cert'),'utf8');priv=await fs.readFile(path.join(stage,'key'),'utf8')}catch(e){
   if(e.code==='ENOENT')throw Error('当前设备缺少 OpenSSL。可在安卓 DSH Go 上创建邀请 / OpenSSL is required on the inviting device')
   throw Error('无法生成配对证书 / Could not generate a pairing certificate',{cause:e})
  }finally{await fs.rm(stage,{recursive:true,force:true})}
  const o={code,used:false},srv=https.createServer({cert,key:priv},async(req,res)=>{
   try{if(!lan(req.socket.remoteAddress||''))throw Error()
    if(req.url==='/hello'&&req.method==='GET'){res.end(JSON.stringify({cert,proof:mac(code,cert)}));return}
    if(req.url!=='/join'||req.method!=='POST')throw Error()
    const x=await body(req)
    if(!equal(code,x.code)||!(/^[a-f0-9-]{36}$/.test(x.id))||x.id===this.device.id)throw Error()
    if(!o.used){o.used=x.id;o.result=(async()=>{const test=net.createServer(),port=await listen(test);await new Promise(r=>test.close(r));const secret=randomBytes(32).toString('hex');await this.config(defaults,id,'phone-a',x.name,port,secret,cert,priv);return {id,port,secret,name:this.device.name}})()}
    if(o.used!==x.id)throw Error()
    res.end(JSON.stringify(await o.result))
   }catch{res.writeHead(403).end()}
  });srv.requestTimeout=10000;o.server=srv;o.port=await listen(srv);o.addresses=interfaces().map(x=>x.address);this.offer=o;this.timer=setTimeout(()=>this.endOffer(),300000);return o
 }
 async join(address,code){
  const [host,p]=String(address).trim().split(':'),port=Number(p);code=String(code).trim().toLowerCase()
  if(!lan(host)||!Number.isInteger(port)||port<1||port>65535||!/^[a-f0-9]{20}$/.test(code))throw Error('请填写局域网地址:端口和 20 位邀请码 / Invalid address or code')
  const defaults=await this.defaults()
  const h=await get(host,port,'/hello');if(typeof h.cert!=='string'||!equal(h.proof,mac(code,h.cert)))throw Error('邀请码不匹配 / Invitation mismatch')
  const r=await get(host,port,'/join',h.cert,{...this.device,code})
  if(!/^[a-f0-9-]{36}$/.test(r.id)||!Number.isInteger(r.port)||r.port<1||r.port>65535||!/^[a-f0-9]{64}$/.test(r.secret))throw Error('Invalid pairing response')
  await this.config(defaults,r.id,'phone-b',r.name,r.port,r.secret,h.cert,null,host)
 }
 endOffer(){clearTimeout(this.timer);this.offer?.server.close();this.offer=null}
 close(){this.endOffer();if(this.udp)try{this.udp.close()}catch{}}
}
