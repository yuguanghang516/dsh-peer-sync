import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {writeJSON} from './policy.js'

const valid=/^session-[a-z0-9-]{1,100}$/i
const stores=new Map()
export function trashFor(home){
  if(!stores.has(home))stores.set(home,new Trash(home))
  return stores.get(home)
}
const digest=(handle,events)=>createHash('sha256').update(JSON.stringify([handle.inheritedEventCount,events])).digest('hex')
const exists=f=>fs.stat(f).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e})

export class Trash{
  constructor(home){
    this.home=home
    this.dir=path.join(home,'peer-sync-trash')
    this.entries=new Map()
    this.queue=Promise.resolve()
    this.ready=this.load()
  }
  async load(){
    await fs.mkdir(this.dir,{recursive:true,mode:0o700})
    for(const name of await fs.readdir(this.dir)){
      if(!name.endsWith('.json')||!valid.test(name.slice(0,-5)))continue
      const record=JSON.parse(await fs.readFile(path.join(this.dir,name),'utf8'))
      if(record.id!==name.slice(0,-5))throw Error('Invalid trash record')
      if(await exists(this.saved(record))||record.committed)this.entries.set(record.id,record)
    }
  }
  saved(r){return path.join(this.dir,r.id+'.backup')}
  async describe(ctx,cfg,id){
    if(!valid.test(id))throw Error('Invalid session')
    const h=await ctx.sessionPersistence.open(id,'read')
    try{
      if(path.resolve(h.header.cwd)!==await fs.realpath(cfg.workspace))throw Error('工作区不匹配 / Wrong workspace')
      const {events}=await h.read()
      return {chat:id,hash:digest(h,events),title:events.findLast(e=>e.type==='session/title')?.data?.title||id}
    }finally{await h.close()}
  }
  erase(ctx,cfg,job,links){
    const task=this.queue.then(()=>this.remove(ctx,cfg,job,links))
    this.queue=task.catch(()=>{});return task
  }
  async remove(ctx,cfg,job,links){
    await this.ready
    const id=job.chat,ws=ctx.workspaceRegistry
    if(!valid.test(id))throw Error('Invalid session')
    const old=this.entries.get(id)
    if(old&&old.hash!==job.hash)throw Error('删除版本不一致 / Different version')
    if(!old){
      if(ws.pinnedSessionIds.includes(id))throw Error('请先取消置顶 / Unpin this chat first')
      const h=await ctx.sessionPersistence.open(id,'write')
      const archived=ws.archivedSessionIds.includes(id)
      let didArchive=false,moved=false
      try{
        const cwd=await fs.realpath(cfg.workspace)
        if(path.resolve(h.header.cwd)!==cwd)throw Error('工作区不匹配 / Wrong workspace')
        const {events}=await h.read()
        if(digest(h,events)!==job.hash)throw Error('这段聊天有不同续写，已保留 / Different history retained')
        const row=await ctx.sessionPersistence.stat(id)
        const file=row?.location?.path
        if(!file||!path.isAbsolute(file)||path.basename(path.dirname(file))!==id||!/^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/.test(path.basename(file)))throw Error('此引擎未提供可删除的聊天文件 / Unsupported storage')
        const root=await fs.realpath(path.join(this.home,'sessions')),real=await fs.realpath(path.dirname(file))
        if(!real.startsWith(root+path.sep)||(await fs.readdir(real)).filter(n=>/\.jsonl(?:\.zstd)?$/.test(n)).length!==1)throw Error('存在其他历史版本 / Multiple generations or unknown path')
        await ws.archiveSession(id);didArchive=true
        const record={id,cwd,file,hash:job.hash,date:Date.now(),archived,committed:false}
        const meta=path.join(this.dir,id+'.json')
        await writeJSON(meta,record)
        await fs.rename(file,this.saved(record));moved=true;this.entries.set(id,record)
        record.committed=true;await writeJSON(meta,record)
      }catch(e){
        if(didArchive&&!moved&&!archived)await ws.unarchiveSession(id)
        throw e
      }finally{await h.close()}
    }
    const workspace=await ws.resolveByPath(await fs.realpath(cfg.workspace))
    await workspace?.detachSession(id)
    if(ws.archivedSessionIds.includes(id))await ws.unarchiveSession(id)
    for(const l of links.values()){
      for(const side of [l.cfg.device,l.other,'receipts'])await fs.rm(path.join(l.cfg.exchange,side,id+'.json'),{force:true})
      l.policy.catalog.delete(id);l.policy.hashes.delete(id)
    }
  }
  async sweep(){
    await this.ready
    for(const r of this.entries.values())if(Date.now()-r.date>7*86400000){
      if(!r.committed){r.committed=true;await writeJSON(path.join(this.dir,r.id+'.json'),r)}
      await fs.rm(this.saved(r),{force:true})
    }
  }
}
