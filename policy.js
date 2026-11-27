import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'

export async function writeJSON(file,value){
  await fs.mkdir(path.dirname(file),{recursive:true})
  const tmp=file+'.'+randomUUID()+'.tmp'
  try{await fs.writeFile(tmp,JSON.stringify(value),{mode:0o600});await fs.rename(tmp,file)}
  finally{await fs.rm(tmp,{force:true})}
}
const session=/^session-[a-z0-9-]{1,100}$/i
export class LinkPolicy {
  constructor(cfg,other){
    this.cfg=cfg;this.other=other;this.file=path.join(cfg.exchange,'panel-settings.json')
    this.value={mode:cfg.visualPair?'some':'all',ids:[],selection:{v:0,by:''},conflicts:{},master:{role:'both',v:0,by:''}}
    this.catalog=new Map();this.hashes=new Map();this.queue=Promise.resolve()
  }
  async load(){try{this.value={...this.value,...JSON.parse(await fs.readFile(this.file,'utf8'))}}catch(e){if(e.code!=='ENOENT')throw e}}
  change(fn){
    const run=this.queue.then(async()=>{const v=structuredClone(this.value);if(fn(v)===false)return;await writeJSON(this.file,v);this.value=v})
    this.queue=run.catch(()=>{});return run
  }
  master(role){
    if(!['both',this.cfg.device,this.other].includes(role))throw Error('Invalid primary')
    return this.change(v=>{v.master={role,v:v.master.v+1,by:this.cfg.device}})
  }
  merge(m){
    if(!m||!['both',this.other,this.cfg.device].includes(m.role)||![this.other,this.cfg.device].includes(m.by)||!Number.isSafeInteger(m.v)||m.v<1||m.v>=Number.MAX_SAFE_INTEGER)return
    return this.change(v=>{if(m.v<v.master.v || (m.v===v.master.v&&m.by<=v.master.by))return false;v.master=m})
  }
  select(fn){return this.change(v=>{fn(v);v.selection={v:v.selection.v+1,by:this.cfg.device}})}
  preferences(){const {selection,ids,mode}=this.value;return {selection,ids,mode}}
  mergeSelection(x){
    const mark=x?.selection
    if(!mark||!Number.isSafeInteger(mark.v)||mark.v<=0||mark.v>=Number.MAX_SAFE_INTEGER||
       ![this.cfg.device,this.other].includes(mark.by)||!['all','some'].includes(x.mode)||
       !Array.isArray(x.ids)||x.ids.length>12000||!x.ids.every(id=>typeof id==='string'&&session.test(id)))return
    return this.change(v=>{const old=v.selection;if(mark.v<old.v||(mark.v===old.v&&mark.by<=old.by))return false
      v.mode=x.mode;v.ids=[...new Set(x.ids)];v.selection={v:mark.v,by:mark.by}})
  }
  conflict(original,branch){if(this.value.conflicts[branch]===original)return;return this.change(v=>{v.conflicts[branch]=original})}
  selected(id){return this.value.mode==='all'||this.value.ids.includes(id)||this.value.ids.includes(this.value.conflicts[id])}
  allowed(name,direction){
    const id=name.replace(/\.json$/,''),attachment=/^attachment-([0-9a-f]{64})\.bin$/.exec(name)
    if(session.test(id))return (direction==='receive'||this.catalog.has(id))&&this.selected(id)
    if(!attachment)return true
    if(direction==='receive'&&this.value.mode==='all')return true
    return [...this.hashes].some(([sid,hashes])=>this.selected(sid)&&hashes.has(attachment[1]))
  }
  record(id,title,refs){this.catalog.set(id,title||id);this.hashes.set(id,new Set(refs.values()))}
}
