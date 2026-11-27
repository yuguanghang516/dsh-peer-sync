import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {pairingWorkspace} from './index.js'
import {Pairing} from './pairing.js'
import {LinkPolicy} from './policy.js'
import {serve,exchange} from './lan.js'
const root=await fs.mkdtemp(path.join(os.tmpdir(),'dsh-peer-visual-'))
const hosts=[],clients=[]
const hostWorkspace=await fs.mkdtemp(path.join(root,'host-custom-'))
const clientWorkspace=await fs.mkdtemp(path.join(root,'client-custom-'))
const configure=w=>async()=>({workspace:await pairingWorkspace({list:()=>[{path:path.join(root,'missing')},{path:w}]})})
const a=new Pairing(path.join(root,'a'),configure(hostWorkspace),c=>hosts.push(c))
const b=new Pairing(path.join(root,'b'),configure(clientWorkspace),c=>clients.push(c))
let srv
try{
 await assert.rejects(pairingWorkspace({list:()=>[]}),/Open or create a DSH workspace/)
 await a.init();await b.init();const invite=await a.invite(),address='127.0.0.1:'+invite.port
 await assert.rejects(b.join(address,'00000000000000000000'))
 await b.join(address,invite.code)
 assert.equal(hosts.length,1);assert.equal(clients.length,1);assert.equal(hosts[0].lan.key,clients[0].lan.key)
 assert.equal(hosts[0].workspace,await fs.realpath(hostWorkspace))
 assert.equal(clients[0].workspace,await fs.realpath(clientWorkspace))
 const pa=new LinkPolicy(hosts[0],'phone-b'),pb=new LinkPolicy(clients[0],'phone-a')
 const dirs=['ao','ai','bo','bi'].map(n=>path.join(root,n))
 for(const d of dirs)await fs.mkdir(d)
 const [ao,ai,bo,bi]=dirs,h='a'.repeat(64)
 for(const id of ['session-one','session-two']){pa.record(id,id,new Map());pb.record(id,id,new Map());await fs.writeFile(path.join(ao,id+'.json'),'{}');await fs.writeFile(path.join(bo,id+'.json'),'{}')}
 pa.hashes.set('session-two',new Set([h]));await fs.writeFile(path.join(ao,'attachment-'+h+'.bin'),'excluded')
 srv=await serve({...hosts[0].lan,bind:'127.0.0.1',policy:pa},ao,ai)
 const cfg={...clients[0].lan,policy:pb}
 await pb.select(v=>{v.mode='some';v.ids=['session-one']})
 await pb.master('phone-b');await exchange(cfg,bo,bi)
 assert.deepEqual(await fs.readdir(ai),['session-one.json']);assert.deepEqual(await fs.readdir(bi),['session-one.json']);assert.equal(pa.value.master.role,'phone-b')
 await pa.conflict('session-one','session-branch');assert(pa.selected('session-branch'))
 const restored=new LinkPolicy(hosts[0],'phone-b');await restored.load();assert.deepEqual(restored.value,pa.value)
 await pb.select(v=>{v.ids=[]});await fs.writeFile(path.join(bo,'session-one.json'),'{"new":true}');await exchange(cfg,bo,bi)
 assert.equal(await fs.readFile(path.join(ai,'session-one.json'),'utf8'),'{}')
 console.log('PASS invite, incorrect code rejection, mutual TLS peer transfer, primary agreement, selection in both directions, excluded attachment, deselection, persisted preferences')
}finally{srv?.close();a.close();b.close();await fs.rm(root,{recursive:true,force:true})}
