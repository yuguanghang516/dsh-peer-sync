import {advertise,discover,lanIP} from './discovery.js'
import https from 'node:https'
import {readFileSync} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'

const blob = /^attachment-([a-f0-9]{64})\.bin$/
const jsonName = /^(plugins|(?:data|addon)-[a-f0-9]{64}|session-[a-z0-9-]{1,100})\.json$/i
const allowed={test:name=>jsonName.test(name)||blob.test(name)}
const limit = 64 * 1024 * 1024
const digest = b => createHash('sha256').update(b).digest('hex')
async function body(stream,max=limit) {
  const chunks=[]; let size=0
  for await(const chunk of stream){
    size+=chunk.length
    if(size>max) throw Error('Snapshot exceeds 64 MiB')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
const digestCache=new Map()
async function manifest(dir, blobs=true, filter=()=>true){
  const result={}
  for(const name of await fs.readdir(dir)){
    if(filter(name) && allowed.test(name) && (blobs||!blob.test(name))){
      const file=path.join(dir,name)
      const st=await fs.stat(file,{bigint:true});if(st.size>limit)throw Error('Snapshot exceeds 64 MiB: '+name)
      const rev=[st.ino,st.size,st.ctimeNs,st.mtimeNs].join(':');let entry=digestCache.get(file)
      if(entry?.rev!==rev){entry={rev,hash:digest(await fs.readFile(file))};if(digestCache.size>8192)digestCache.clear();digestCache.set(file,entry)}
      result[name]=entry.hash
    }
  }
  return result
}
async function save(dir,name,bytes){
  if(!allowed.test(name))throw Error('Unexpected filename')
  const match=blob.exec(name)
  if(match){if(digest(bytes)!==match[1])throw Error('Bad attachment checksum')}else JSON.parse(bytes.toString())
  const tmp=path.join(dir,randomUUID()+'.tmp')
  try{await fs.writeFile(tmp,bytes,{flag:'wx',mode:0o600});await fs.rename(tmp,path.join(dir,name))}
  finally{await fs.rm(tmp,{force:true})}
}
function options(hex){
  if(!/^[0-9a-f]{64}$/i.test(hex||''))throw Error('Provide a 32-byte hex pairing key')
  return {minVersion:'TLSv1.2'}
}
export async function serve(cfg,mine,peer){
  const tls=options(cfg.key)
  if(!cfg.bind)throw Error('Set the Windows LAN address in bind')
  await Promise.all([mine,peer].map(d=>fs.mkdir(d,{recursive:true})))
  const server=https.createServer({...tls,cert:readFileSync(cfg.certFile),key:readFileSync(cfg.privateKeyFile)},async(req,res)=>{
    try{
      if(!lanIP(req.socket.remoteAddress||'')){res.writeHead(403).end();return}
      if(req.headers.authorization!=='Bearer '+cfg.key){res.writeHead(403).end();return}
      cfg.onContact?.(req.socket.remoteAddress)
      if(req.url==='/preferences'&&req.method==='POST'&&cfg.policy){
        const raw=await body(req,1024*1024);await cfg.policy.mergeSelection(JSON.parse(raw));res.end(JSON.stringify(cfg.policy.preferences()));return
      }
      if(req.url==='/manifest'&&req.method==='GET'){
        if(req.headers['x-peer-primary'])await cfg.policy?.merge(JSON.parse(req.headers['x-peer-primary']))
        res.end(JSON.stringify({attachments:true,selection:!!cfg.policy,selectionStamp:cfg.policy?.value.selection,master:cfg.policy?.value.master,local:await manifest(mine,req.headers['x-peer-attachments']==='1',n=>cfg.policy?.allowed(n,'send')!==false),received:await manifest(peer)}));return
      }
      const name=req.url.slice(1)
      if(!allowed.test(name)){res.writeHead(404).end();return}
      if(cfg.policy?.allowed(name,req.method==='GET'?'send':'receive')===false){res.writeHead(req.method==='PUT'?204:404).end();return}
      if(req.method==='GET'){const file=path.join(mine,name);if((await fs.stat(file)).size>limit)throw Error();res.end(await fs.readFile(file));return}
      if(req.method==='PUT'){await save(peer,name,await body(req));res.writeHead(204).end();return}
      res.writeHead(405).end()
    }catch{res.writeHead(400).end()}
  })
  server.requestTimeout=60000
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(cfg.port||39463,cfg.bind,ok)})
  advertise(server,cfg);return server
}
async function direct(cfg,mine,peer){
  const tls=options(cfg.key)
  await fs.mkdir(peer,{recursive:true})
  function request(method,uri,data){
    return new Promise((ok,fail)=>{
      const req=https.request({...tls,hostname:cfg.host,port:cfg.port||39463,method,path:uri,agent:false,
        // Pin the paired device certificate and require the matching DNS identity.
        servername:'dsh-peer.local',ca:readFileSync(cfg.certFile),headers:{...(cfg.policy?{'x-peer-primary':JSON.stringify(cfg.policy.value.master)}:{}),'x-peer-attachments':'1',authorization:'Bearer '+cfg.key}},async res=>{
          try{if(res.statusCode>=300)throw Error('Sync HTTP '+res.statusCode);ok(await body(res))}catch(e){fail(e)}
        })
      req.setTimeout(30000,()=>req.destroy(Error('Peer timeout')))
      req.on('error',fail);req.end(data)
    })
  }
  let remote=JSON.parse((await request('GET','/manifest')).toString())
  if(remote.selection&&cfg.policy){
    const before=JSON.stringify(cfg.policy.value.selection)
    const reply=await request('POST','/preferences',Buffer.from(JSON.stringify(cfg.policy.preferences())))
    await cfg.policy.mergeSelection(JSON.parse(reply))
    if(before!==JSON.stringify(cfg.policy.value.selection)||JSON.stringify(remote.selectionStamp)!==JSON.stringify(cfg.policy.value.selection))remote=JSON.parse(await request('GET','/manifest'))
  }
  await cfg.policy?.merge(remote.master);cfg.onContact?.(cfg.host)
  const local=await manifest(mine,true,n=>cfg.policy?.allowed(n,'send')!==false),received=await manifest(peer)
  for(const [name,hash] of Object.entries(local)){
    if((remote.attachments||!blob.test(name)) && hash!==remote.received[name])await request('PUT','/'+name,await fs.readFile(path.join(mine,name)))
  }
  for(const [name,hash] of Object.entries(remote.local)){
    if(!allowed.test(name))throw Error('Unexpected manifest entry')
    if(cfg.policy?.allowed(name,'receive')===false||hash===received[name])continue
    const bytes=await request('GET','/'+name)
    if(digest(bytes)===hash)await save(peer,name,bytes)
  }
}

export async function exchange(cfg,mine,peer){
  try{return await direct(cfg,mine,peer)}catch(e){
    if(!['EHOSTUNREACH','ENETUNREACH','ECONNREFUSED','ETIMEDOUT','ECONNRESET'].includes(e.code)&&e.message!=='Peer timeout')throw e
    const host=await discover(cfg);cfg.host=host
    return direct(cfg,mine,peer)
  }
}