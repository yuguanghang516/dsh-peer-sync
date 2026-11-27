import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {Pairing} from './pairing.js'
import {LinkPolicy} from './policy.js'
import {ManualSession} from './manual.js'
import {Trash} from './trash.js'
import {serve,exchange,manualRPC} from './lan.js'

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'peer-manual-'))
let A,B,server
const a=new Pairing(path.join(dir,'a'),()=>({}),c=>{A=c})
const b=new Pairing(path.join(dir,'b'),()=>({}),c=>{B=c})
try{
 await a.init();await b.init()
 const invite=await a.invite();await b.join('127.0.0.1:'+invite.port,invite.code)
 const pa=new LinkPolicy(A,'phone-b'),pb=new LinkPolicy(B,'phone-a')
 const dirs=await Promise.all(['ao','ai','bo','bi'].map(async n=>{const d=path.join(dir,n);await fs.mkdir(d);return d}))
 const [ao,ai,bo,bi]=dirs
 for(const [id,policy,folder] of [['session-a',pa,ao],['session-b',pb,bo]]){
  policy.record(id,id,new Map());await policy.select(v=>{v.mode='all'});await fs.writeFile(path.join(folder,id+'.json'),'{}')
 }
 const hooks=()=>({sent:0,received:0,deleted:[],async prepare(){this.sent++},async apply(){this.received++},async erase(j){this.deleted.push(j.chat)}})
 const ha=hooks(),hb=hooks(),sa=new ManualSession({policy:pa,cfg:A,other:B.device},ha),sb=new ManualSession({policy:pb,cfg:B,other:A.device},hb)
 server=await serve({...A.lan,bind:'127.0.0.1',manual:sa,policy:pa},ao,ai)
 const cfg={...B.lan,policy:pb};const poll=()=>sb.poll(msg=>manualRPC(cfg,msg),(token,send,receive)=>exchange({...cfg,token,send,receive},bo,bi))
 await poll();await poll();assert.equal(ha.sent+hb.sent,0);assert.deepEqual(await fs.readdir(bi),[])
 await assert.rejects(exchange(cfg,bo,bi),/403/)
 await pa.master(A.device);await poll();assert.throws(()=>sa.request('push'))
 await pa.change(v=>{v.pushEnabled=true});await poll();assert.equal(ha.sent,0)
 sa.request('push');await poll();assert.deepEqual(await fs.readdir(bi),['session-a.json']);assert.deepEqual(await fs.readdir(ai),[])
 assert.equal(hb.received,1);assert.equal(ha.received,0);assert.throws(()=>sb.request('push'))
 const details={chat:'session-a',hash:'a'.repeat(64)}
 sa.request('delete',details);await assert.rejects(poll());assert.deepEqual(hb.deleted,[])
 await pb.change(v=>{v.allowDelete=true});sa.request('delete',details);await poll();assert.deepEqual(hb.deleted,['session-a'])
 await pb.master(B.device);await poll();await pb.change(v=>{v.pushEnabled=true});sb.request('push');await poll()
 assert.deepEqual(await fs.readdir(ai),['session-b.json'])
 // A local JSONL session uses the DSH archive admission and a write lease before moving the artifact.
 const trash=new Trash(dir);const id='session-trash',folder=path.join(dir,'sessions','project',id),cwd=dir
 await fs.mkdir(folder,{recursive:true});const file=path.join(folder,'session.v4.jsonl');await fs.writeFile(file,'test history')
 let events=[{type:'session/title',data:{title:'Fixture'}}],detached=false
 const ctx={sessionPersistence:{open:async()=>({header:{cwd},inheritedEventCount:0,read:async()=>({events}),close:async()=>{}}),stat:async()=>({location:{path:file}})},workspaceRegistry:{pinnedSessionIds:[],archivedSessionIds:[],archiveSession:async()=>{},resolveByPath:async()=>({detachSession:async()=>{detached=true}})}}
 const job=await trash.describe(ctx,{workspace:cwd},id)
 events.push({type:'new'});await assert.rejects(trash.erase(ctx,{workspace:cwd},job,new Map()),/Different history/);await fs.access(file)
 events.pop();await trash.erase(ctx,{workspace:cwd},job,new Map());assert(detached);await assert.rejects(fs.access(file))
 const restart=new Trash(dir);await restart.ready;assert(restart.entries.has(id))
 console.log('PASS idle no payload, legacy blocked, manual push from both network roles, permission off, deletion grant, changed history protected, persisted removal')
}finally{server?.close();a.close();b.close();await fs.rm(dir,{recursive:true,force:true})}
