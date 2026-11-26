import {collectAttachments,syncAttachments} from './attachments.js'
import {scheduleUpdates} from './update.js'
import {syncFiles,packAddons,receiveAddons} from './extras.js'
import {serve,exchange} from './lan.js'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {readFileSync} from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

export const inject = ['workspaceRegistry', 'sessionPersistence']
const validId = /^session-[a-z0-9-]{1,100}$/i
const peers = new Map([['windows','android'],['android','windows'],['phone-a','phone-b'],['phone-b','phone-a']])
// dsh-go 状态条用的运行状态：配对、最近一次成功同步、最近一次错误
const status = {paired:false,side:null,peer:null,lastOkAt:0,lastError:null}
async function atomic(file, value) {
  const tmp = file + '.' + randomUUID() + '.tmp'
  try {
    await fs.writeFile(tmp, JSON.stringify(value), {mode:0o600})
    await fs.rename(tmp,file)
  } finally { await fs.rm(tmp,{force:true}) }
}

export function compare(local, incoming) {
  for (let i=0;i<Math.min(local.length,incoming.length);i++) {
    if (!isDeepStrictEqual(local[i],incoming[i])) return 'conflict'
  }
  return local.length < incoming.length ? 'append' : 'current'
}

const refreshed = new WeakMap()
async function refreshList(ctx,store,id){
  const cache=ctx.get?.('sessionProjectionCache')
  if(!cache?.coldSnapshot)return
  let revisions=refreshed.get(cache)
  if(!revisions){revisions=new Map();refreshed.set(cache,revisions)}
  const row=await store.stat(id)
  if(!row || (row.revision && revisions.get(id)===row.revision))return
  const h=await store.open(id,'read')
  try{cache.coldSnapshot(h.header,h.inheritedEventCount,(await h.read()).events);revisions.set(id,row.revision)}
  finally{await h.close()}
}
export async function transfer(ctx,workspace,cwd,snapshot) {
  const {header,events,cut}=snapshot
  if (snapshot.version!==1 || !validId.test(header.id) || !Array.isArray(events) ||
      !Number.isSafeInteger(cut) || cut<0 || cut>events.length) throw Error('Invalid session snapshot')
  const store=ctx.sessionPersistence
  const existing=await store.stat(header.id)
  if(existing && path.resolve(existing.header.cwd || '.')!==cwd) throw Error('Same ID belongs to another workspace')
  if(existing){
    const reader=await store.open(header.id,'read')
    let state
    try {state=compare((await reader.read()).events,events)} finally {await reader.close()}
    if(state==='conflict') throw Error('Offline edits diverged; both versions retained')
    if(state==='current'){await refreshList(ctx,store,header.id);await workspace.attachSession(header.id);return}
  }
  const h=existing ? await store.open(header.id,'write') :
    await store.create({...header,cwd},{inheritedEventCount:cut})
  try {
    const local=(await h.read()).events
    const state=compare(local,events)
    if(state==='conflict') throw Error('Offline edits diverged; both versions retained')
    if(state==='append') await h.append(events.slice(local.length))
    await h.flush()
  } finally {await h.close()}
  await refreshList(ctx,store,header.id)
  await workspace.attachSession(header.id)
}

export function apply(ctx,cfg={}) {
  ctx.inject?.(['dshGo'],(c)=>{
    c.dshGo?.strip?.('peer-sync-status',(scope,emit,caps)=>{
      const en=String(caps?.locale||'').startsWith('en')
      const paint=()=>{
        if(!status.paired)return emit({text:en?'Not paired yet':'未配对，先配对',tone:'warn'})
        if(status.lastError)return emit({text:en?'Sync error':'同步出错，点开看',tone:'bad'})
        if(!status.lastOkAt)return emit({text:en?'Waiting for sync':'等待首次同步',tone:'muted'})
        const min=Math.round((Date.now()-status.lastOkAt)/60000)
        const when=min<1?(en?'just now':'刚刚'):(en?`${min} min ago`:`${min} 分钟前`)
        emit({text:en?`Synced ${when}`:`已同步 ${when}`,tone:'good'})
      }
      paint()
      const timer=setInterval(paint,30000)
      return ()=>clearInterval(timer)
    })
  })
  if(!cfg.device){const home=process.env.DSH_HOME||path.join(os.homedir(),'.dsh');try{cfg=JSON.parse(readFileSync(path.join(home,'peer-sync-settings.json'),'utf8'))}catch(e){ctx.logger.warn('Peer sync settings unavailable: '+e.code);return}}
  scheduleUpdates(ctx,cfg)
  const side=cfg.device, directory=cfg.exchange, root=cfg.workspace
  if(peers.has(side)&&path.isAbsolute(directory||'')&&path.isAbsolute(root||'')){status.paired=true;status.side=side;status.peer=peers.get(side)}
  if(!peers.has(side)||!path.isAbsolute(directory||'')||!path.isAbsolute(root||'')){
    ctx.logger.warn('Configure device, exchange and workspace before starting sync')
    return
  }
  const mine=path.join(directory,side),peer=path.join(directory,peers.get(side))
  // A paired device can use a different login method for the same DeepSeek model.
  // Select through the live agent so the historical request headers stay intact.
  ctx.on?.('agent/created', async ({agent})=>{
    if(!validId.test(agent.id) || !agent.model?.current)return
    const route=agent.model.current()
    const defaults=ctx.get?.('agentDefaultModel')?.currentSelection()
    const authRoutes=['deepseek-official','deepseek-account']
    if(!authRoutes.includes(route?.provider) || !authRoutes.includes(defaults?.provider) ||
        route.provider===defaults.provider || route.model!==defaults.model)return
    const receipt=await fs.stat(path.join(directory,'receipts',agent.id+'.json')).catch(()=>null)
    if(receipt)agent.model.select({...route,provider:defaults.provider})
  })
  const seen=new Map()
  const refs=new Map()
  const attachmentRoot=path.join(cfg.profileDirectory ? path.dirname(path.dirname(cfg.profileDirectory)) : (process.env.DSH_HOME||path.join(os.homedir(),'.dsh')),'attachments','v1')
  let running=false,stopped=false,server
  async function tick(){
    if(running||stopped)return
    running=true
    try {
      const cwd=await fs.realpath(root)
      await fs.mkdir(mine,{recursive:true})
      if(cfg.profileDirectory){
        const manifest=JSON.parse(await fs.readFile(path.join(cfg.profileDirectory,'package.json'),'utf8'))
        const bundles=manifest.dsh?.profile?.bundles||[]
        const plugins=[]
        for(const name of bundles){
          if(typeof name!=='string'||!/^(@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(name))continue
          const info=await fs.readFile(path.join(cfg.profileDirectory,'node_modules',name,'package.json'),'utf8').then(JSON.parse).catch(()=>null)
          plugins.push({name,version:info?.version??null})
        }
        const inventory=JSON.stringify(plugins)
        if(seen.get('plugins')!==inventory){await atomic(path.join(mine,'plugins.json'),plugins);seen.set('plugins',inventory)}
      }
      const ws=await ctx.workspaceRegistry.resolveByPath(cwd) ?? await ctx.workspaceRegistry.create(cwd)
      const rows=await ctx.sessionPersistence.list();await atomic(path.join(directory,'source-status.json'),{paths:[...new Set(rows.map(r=>r.header?.cwd??r.cwd??null))],count:rows.length});
      for(const row of rows){
        if(stopped)return
        const {id}=row.header
        if(!validId.test(id)||!row.header.cwd||!([root,...(cfg.previousWorkspacePaths||[])].includes(row.header.cwd)||path.resolve(row.header.cwd)===cwd))continue
        try{
          const file=path.join(mine,id+'.json'), revision=JSON.stringify(row.revision)
          if(seen.get(id)===revision && await fs.stat(file).catch(()=>null))continue
          const h=await ctx.sessionPersistence.open(id,'read')
          try{const {events}=await h.read();collectAttachments(events,refs);await atomic(file,{version:1,header:h.header,cut:h.inheritedEventCount,events})}finally{await h.close()}
          seen.set(id,revision)
        }catch(e){await atomic(path.join(directory,'export-error.json'),{id,message:e.message});ctx.logger.warn(id+': '+e.message)}
      }
      const missing=await syncAttachments(attachmentRoot,mine,peer,refs)
      await atomic(path.join(directory,'attachment-status.json'),{missing})
      await syncFiles(cfg,mine,peer);await packAddons(cfg,mine);
      if(cfg.lan?.bind && !server)server=await serve(cfg.lan,mine,peer)
      if(cfg.lan?.host)await exchange(cfg.lan,mine,peer)
      await receiveAddons(cfg,peer);await fs.rm(path.join(directory,'last-error.json'),{force:true});
      status.lastOkAt=Date.now();status.lastError=null
      await atomic(path.join(directory,'network-status.json'),{device:side,checked:new Date().toISOString(),role:cfg.lan?.bind?'listener':'client'});
      const files=await fs.readdir(peer).catch(e=>{if(e.code==='ENOENT')return [];throw e})
      for(const name of files){
        if(stopped)return
        if(!name.endsWith('.json')||!validId.test(name.slice(0,-5)))continue
        try{
          const snap=JSON.parse(await fs.readFile(path.join(peer,name),'utf8'))
          if(name!==snap.header.id+'.json')throw Error('Session ID mismatch')
          const incomingRefs=new Map()
          collectAttachments(snap.events,incomingRefs)
          for(const [key,value] of incomingRefs)refs.set(key,value)
          await syncAttachments(attachmentRoot,mine,peer,incomingRefs)
          try{await transfer(ctx,ws,cwd,snap)}
          catch(e){
            if(!e.message.startsWith('Offline edits diverged'))throw e
            const h=await ctx.sessionPersistence.open(snap.header.id,'read')
            let local;try{local=(await h.read()).events}finally{await h.close()}
            const idx=local.findIndex((ev,i)=>i<snap.events.length&&!isDeepStrictEqual(ev,snap.events[i]))
            if(idx<0)throw e
            const hex=createHash('sha256').update(JSON.stringify([snap.header.id,idx,snap.events[idx]])).digest('hex')
            const branch='session-'+[hex.slice(0,8),hex.slice(8,12),'4'+hex.slice(13,16),'8'+hex.slice(17,20),hex.slice(20,32)].join('-')
            await transfer(ctx,ws,cwd,{...snap,header:{...snap.header,id:branch}})
          }
          await fs.mkdir(path.join(directory,'receipts'),{recursive:true});await atomic(path.join(directory,'receipts',name),{id:snap.header.id,events:snap.events.length})
        }catch(e){await atomic(path.join(directory,'import-error.json'),{name,message:e.message});ctx.logger.warn(name+': '+e.message)}
      }
    }catch(e){status.lastError=e.message;await atomic(path.join(directory,'last-error.json'),{message:e.message}).catch(()=>{});ctx.logger.warn('Peer sync: '+e.message)}finally{running=false}
  }
  ctx.effect(()=>{const timer=setInterval(tick,30000);void tick();return ()=>{stopped=true;clearInterval(timer);server?.close()}})
}
