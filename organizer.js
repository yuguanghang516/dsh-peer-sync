import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {writeJSON} from './policy.js'

const instances=new Map()
export function organizerFor(home){
  if(!instances.has(home))instances.set(home,new Organizer(home))
  return instances.get(home)
}

function fingerprint(header,cut,events){
  if(!events.some(event=>event.type==='user/message'))return null
  const {id,cwd,...metadata}=header
  // An identical title or prompt alone can occur in unrelated conversations.
  return createHash('sha256').update(JSON.stringify([metadata,cut,events])).digest('hex')
}

export class Organizer{
  constructor(home){
    this.file=path.join(home,'peer-sync-organizer.json')
    this.enabled=false
    this.archives={}
    this.cache=new Map()
    this.links=new Set()
    this.last=new Map()
    this.pending=Promise.resolve()
    this.ready=fs.readFile(this.file,'utf8').then(JSON.parse).then(value=>{
      this.enabled=value.enabled===true
      this.archives=value.archives||{}
    }).catch(e=>{if(e.code!=='ENOENT')throw e})
  }
  enqueue(fn){const op=this.pending.then(()=>this.ready).then(fn);this.pending=op.catch(()=>{});return op}
  save(){return writeJSON(this.file,{enabled:this.enabled,archives:this.archives})}
  set(enabled){return this.enqueue(async()=>{this.enabled=enabled;this.last.clear();await this.save()})}
  register(link){this.links.add(link);return ()=>this.links.delete(link)}
  run(ctx,cwd,rows){
    if(!this.enabled||Date.now()-(this.last.get(cwd)||0)<90000)return
    this.last.set(cwd,Date.now())
    return this.enqueue(async()=>{if(this.enabled)await this.scan(ctx,cwd,rows)})
  }
  async read(store,id){
    const h=await store.open(id,'read')
    try{return fingerprint(h.header,h.inheritedEventCount,(await h.read()).events)}finally{await h.close()}
  }
  async scan(ctx,cwd,rows){
    const ws=ctx.workspaceRegistry,store=ctx.sessionPersistence
    if(typeof ws.archiveSession!=='function')throw Error('DSH engine lacks session archiving')
    const evidence=new Set(),branches=new Set()
    for(const link of this.links){
      for(const name of await fs.readdir(path.join(link.cfg.exchange,'receipts')).catch(e=>{if(e.code==='ENOENT')return [];throw e}))evidence.add(name.replace(/\.json$/,''))
      for(const id of Object.keys(link.policy.value.conflicts)){evidence.add(id);branches.add(id)}
    }
    const groups=new Map(),hashes=new Map(),unreadable=new Set()
    for(const {header,revision} of rows){
      if(!header?.cwd||path.resolve(header.cwd)!==cwd)continue
      const id=header.id,key=JSON.stringify(revision)
      let item=this.cache.get(id)
      if(!item||key==null||item.key!==key){
        try{
          const hash=await this.read(store,id);item={key,hash};this.cache.set(id,item)
        }catch{unreadable.add(id);continue}
      }
      hashes.set(id,item.hash)
      if(!item.hash)continue
      if(!groups.has(item.hash))groups.set(item.hash,[])
      groups.get(item.hash).push(id)
    }
    for(const [id,record] of Object.entries(this.archives)){
      if(record.cwd!==cwd||!hashes.has(id)||unreadable.has(record.keep))continue
      if(hashes.get(id)===record.hash && hashes.get(record.keep)===record.hash && !ws.archivedSessionIds.includes(record.keep))continue
      if(ws.archivedSessionIds.includes(id))await ws.unarchiveSession(id)
      delete this.archives[id];await this.save()
    }
    for(const [hash,ids] of groups){
      if(ids.length<2)continue
      const archived=new Set(ws.archivedSessionIds),pins=new Set(ws.pinnedSessionIds)
      const rank=id=>pins.has(id)?0:!evidence.has(id)?1:branches.has(id)?3:2
      const visible=ids.filter(id=>!archived.has(id)).sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b))
      if(visible.length<2)continue
      const [keep,...copies]=visible
      for(const id of copies){
        if(pins.has(id)||!evidence.has(id))continue
        try{if(await this.read(store,keep)!==hash||await this.read(store,id)!==hash)continue}catch{continue}
        // Persist intent first so a process restart can still recover a revised copy.
        this.archives[id]={keep,hash,cwd}
        await this.save()
        try{await ws.archiveSession(id)}catch(e){
          delete this.archives[id];await this.save()
          if(!/activ|busy|running/i.test(e.name+' '+e.message))throw e
        }
      }
    }
  }
}
