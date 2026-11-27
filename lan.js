import {collectAttachments} from './attachments.js'
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
function rememberAttachments(cfg,name,bytes){
 if(!cfg.policy||!name.startsWith('session-')||!name.endsWith('.json'))return
 const snap=JSON.parse(bytes)
 if(snap.header?.id!==name.slice(0,-5)||!Array.isArray(snap.events))return
 const refs=new Map();collectAttachments(snap.events,refs)
 const hashes=cfg.policy.hashes.get(snap.header.id)||new Set()
 for(const h of refs.values())hashes.add(h)
 cfg.policy.hashes.set(snap.header.id,hashes)
}
function transferOrder(map){
 return Object.entries(map).sort(([a],[b])=>Number(blob.test(a))-Number(blob.test(b)))
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
      const token=req.headers['x-peer-manual']
      if(cfg.manual){
        if(req.method==='POST'&&req.url==='/manual'){
          try{const reply=await cfg.manual.control(JSON.parse(await body(req,1024*1024)));res.end(JSON.stringify(reply))}
          catch(e){res.writeHead(409).end(JSON.stringify({error:e.message}))}
          return
        }
        const mode=['/manifest','/preferences','/offered'].includes(req.url)?undefined:req.method==='PUT'?'receive':'send'
        if(!cfg.manual.permits(token,mode)){res.writeHead(403).end();return}
      }
      if(req.url==='/offered'&&req.method==='POST'&&cfg.manual?.permits(token,'receive')){
        const names=JSON.parse(await body(req,1024*1024))
        if(!Array.isArray(names)||!names.every(n=>typeof n==='string'&&allowed.test(n)))throw Error('Invalid inventory')
        cfg.manual.active.offered=names
        if(cfg.policy?.value.mode==='some')for(const n of names){
          if(n.startsWith('session-')&&cfg.policy.allowed(n,'receive')){
            const bytes=await fs.readFile(path.join(peer,n)).catch(e=>{if(e.code!=='ENOENT')throw e})
            if(bytes)rememberAttachments(cfg,n,bytes)
          }
        }
        res.writeHead(204).end();return
      }
      if(req.url==='/preferences'&&req.method==='POST'&&cfg.policy){
        const raw=await body(req,1024*1024);await cfg.policy.mergeSelection(JSON.parse(raw));res.end(JSON.stringify(cfg.policy.preferences()));return
      }
      if(req.url==='/manifest'&&req.method==='GET'){
        if(!cfg.manual&&req.headers['x-peer-primary'])await cfg.policy?.merge(JSON.parse(req.headers['x-peer-primary']))
        res.end(JSON.stringify({attachments:true,selection:!!cfg.policy,selectionStamp:cfg.policy?.value.selection,master:cfg.policy?.value.master,local:cfg.manual&&!cfg.manual.permits(token,'send')?{}:await manifest(mine,req.headers['x-peer-attachments']==='1',n=>cfg.policy?.allowed(n,'send')!==false),received:await manifest(peer)}));return
      }
      const name=req.url.slice(1)
      if(!allowed.test(name)){res.writeHead(404).end();return}
      if(cfg.policy?.allowed(name,req.method==='GET'?'send':'receive')===false){res.writeHead(req.method==='PUT'?204:404).end();return}
      if(req.method==='GET'){const file=path.join(mine,name);if((await fs.stat(file)).size>limit)throw Error();res.end(await fs.readFile(file));return}
      if(req.method==='PUT'){const bytes=await body(req);await save(peer,name,bytes);rememberAttachments(cfg,name,bytes);res.writeHead(204).end();return}
      res.writeHead(405).end()
    }catch{res.writeHead(400).end()}
  })
  server.requestTimeout=60000
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(cfg.port||39463,cfg.bind,ok)})
  advertise(server,cfg);return server
}
  function request(cfg,method,uri,data){
    return new Promise((ok,fail)=>{
      const req=https.request({...options(cfg.key),hostname:cfg.host,port:cfg.port||39463,method,path:uri,agent:false,
        // Pin the paired device certificate and require the matching DNS identity.
        servername:'dsh-peer.local',ca:readFileSync(cfg.certFile),headers:{...(cfg.token?{'x-peer-manual':cfg.token}:{}),...(cfg.policy?{'x-peer-primary':JSON.stringify(cfg.policy.value.master)}:{}),'x-peer-attachments':'1',authorization:'Bearer '+cfg.key}},async res=>{
          try{const bytes=await body(res);if(res.statusCode>=300){let msg;try{msg=JSON.parse(bytes).error}catch{}throw Error(msg||'Sync HTTP '+res.statusCode)}ok(bytes)}catch(e){fail(e)}
        })
      req.setTimeout(30000,()=>req.destroy(Error('Peer timeout')))
      req.on('error',fail);req.end(data)
    })
  }

export async function manualRPC(cfg,msg){
 const call=async()=>JSON.parse(await request(cfg,'POST','/manual',Buffer.from(JSON.stringify(msg))))
 try{const value=await call();cfg.onContact?.(cfg.host);return value}catch(e){
   if(!['EHOSTUNREACH','ENETUNREACH','ECONNREFUSED','ETIMEDOUT','ECONNRESET'].includes(e.code)&&e.message!=='Peer timeout')throw e
   cfg.host=await discover(cfg);const value=await call();cfg.onContact?.(cfg.host);return value
 }
}
async function direct(cfg,mine,peer){
  await fs.mkdir(peer,{recursive:true})
  let remote=JSON.parse((await request(cfg,'GET','/manifest')).toString())
  if(remote.selection&&cfg.policy){
    const before=JSON.stringify(cfg.policy.value.selection)
    const reply=await request(cfg,'POST','/preferences',Buffer.from(JSON.stringify(cfg.policy.preferences())))
    await cfg.policy.mergeSelection(JSON.parse(reply))
    if(before!==JSON.stringify(cfg.policy.value.selection)||JSON.stringify(remote.selectionStamp)!==JSON.stringify(cfg.policy.value.selection))remote=JSON.parse(await request(cfg,'GET','/manifest'))
  }
  await cfg.policy?.merge(remote.master);cfg.onContact?.(cfg.host)
  const local=cfg.send===false?{}:await manifest(mine,true,n=>cfg.policy?.allowed(n,'send')!==false),received=await manifest(peer)
  if(cfg.token&&cfg.send)await request(cfg,'POST','/offered',Buffer.from(JSON.stringify(Object.keys(local))))
  for(const [name,hash] of transferOrder(local)){
    if((remote.attachments||!blob.test(name)) && hash!==remote.received[name])await request(cfg,'PUT','/'+name,await fs.readFile(path.join(mine,name)))
  }
  for(const [name,hash] of transferOrder(cfg.receive===false?{}:remote.local)){
    if(!allowed.test(name))throw Error('Unexpected manifest entry')
    if(cfg.policy?.allowed(name,'receive')===false)continue
    if(hash===received[name]){
      if(name.startsWith('session-')&&cfg.policy?.value.mode==='some')rememberAttachments(cfg,name,await fs.readFile(path.join(peer,name)))
      continue
    }
    const bytes=await request(cfg,'GET','/'+name)
    if(digest(bytes)!==hash)throw Error('File changed during transfer; retry')
    await save(peer,name,bytes);rememberAttachments(cfg,name,bytes)
  }
  return Object.keys(remote.local)
}

export async function exchange(cfg,mine,peer){
  try{return await direct(cfg,mine,peer)}catch(e){
    if(!['EHOSTUNREACH','ENETUNREACH','ECONNREFUSED','ETIMEDOUT','ECONNRESET'].includes(e.code)&&e.message!=='Peer timeout')throw e
    const host=await discover(cfg);cfg.host=host
    return direct(cfg,mine,peer)
  }
}