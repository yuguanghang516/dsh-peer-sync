import {Organizer} from './organizer.js'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'chat-organizer-'))
try{
 const events=[{type:'user/message',data:{content:'hello'}},{type:'session/title',data:{title:'Shared title'}}]
 const data=new Map(),archivedSessionIds=[],pinnedSessionIds=['session-a']
 for(const id of ['session-a','session-b','session-c','session-d','session-e','session-f']){
   data.set(id,{header:{id,cwd:tmp,createdAt:1},events:structuredClone(events),revision:1})
 }
 data.get('session-c').events.push({type:'user/message',data:{content:'A different reply'}})
 const elsewhere=data.get('session-d');elsewhere.header.cwd=path.join(tmp,'other')
 const store={open:async id=>({...data.get(id),inheritedEventCount:0,read:async()=>data.get(id),close:async()=>{}})}
 const ctx={sessionPersistence:store,workspaceRegistry:{archivedSessionIds,pinnedSessionIds,
   archiveSession:async id=>{if(id==='session-e')throw Error('Session active');archivedSessionIds.push(id)},
   unarchiveSession:async id=>archivedSessionIds.splice(archivedSessionIds.indexOf(id),1)}}
 const folder=path.join(tmp,'receipts');await fs.mkdir(folder)
 for(const s of ['b','c','d','e'])await fs.writeFile(path.join(folder,'session-'+s+'.json'),'{}')
 const o=new Organizer(tmp);o.register({cfg:{exchange:tmp},policy:{value:{conflicts:{}}}});await o.ready
 const rows=[{header:{id:"unreadable",cwd:tmp},revision:1},...data.values()];await o.run(ctx,tmp,rows);assert.deepEqual(archivedSessionIds,[])
 await o.set(true);await o.run(ctx,tmp,rows);assert.deepEqual(archivedSessionIds,['session-b'])
 const after=new Organizer(tmp);await after.ready;assert(after.enabled);assert.equal(after.archives['session-b'].keep,'session-a')
 data.get('session-b').revision++;data.get('session-b').events.push({type:'user/message',data:{content:'New'}})
 o.last.clear();await o.run(ctx,tmp,rows);assert.deepEqual(archivedSessionIds,[])
 console.log('PASS organizer default, persistence, full-history match, title collision, pinned/active protection, other workspace, sync provenance, divergent copy restored')
}finally{await fs.rm(tmp,{recursive:true,force:true})}
