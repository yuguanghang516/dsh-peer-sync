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
async function body(stream) {
  const chunks=[]; let size=0
  for await(const chunk of stream){
    size+=chunk.length
    if(size>limit) throw Error('Snapshot exceeds 64 MiB')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
async function manifest(dir, blobs=true){
  const result={}
  for(const name of await fs.readdir(dir)){
    if(allowed.test(name) && (blobs||!blob.test(name))){
      const file=path.join(dir,name)
      if((await fs.stat(file)).size>limit)throw Error('Snapshot exceeds 64 MiB: '+name)
      result[name]=digest(await fs.readFile(file))
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
      if(req.url==='/manifest'&&req.method==='GET'){
        res.end(JSON.stringify({attachments:true,local:await manifest(mine,req.headers['x-peer-attachments']==='1'),received:await manifest(peer)}));return
      }
      const name=req.url.slice(1)
      if(!allowed.test(name)){res.writeHead(404).end();return}
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
        servername:'dsh-peer.local',ca:readFileSync(cfg.certFile),headers:{'x-peer-attachments':'1',authorization:'Bearer '+cfg.key}},async res=>{
          try{if(res.statusCode>=300)throw Error('Sync HTTP '+res.statusCode);ok(await body(res))}catch(e){fail(e)}
        })
      req.setTimeout(30000,()=>req.destroy(Error('Peer timeout')))
      req.on('error',fail);req.end(data)
    })
  }
  const remote=JSON.parse((await request('GET','/manifest')).toString())
  const local=await manifest(mine),received=await manifest(peer)
  for(const [name,hash] of Object.entries(local)){
    if((remote.attachments||!blob.test(name)) && hash!==remote.received[name])await request('PUT','/'+name,await fs.readFile(path.join(mine,name)))
  }
  for(const [name,hash] of Object.entries(remote.local)){
    if(!allowed.test(name))throw Error('Unexpected manifest entry')
    if(hash===received[name])continue
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