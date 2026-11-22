import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import * as fs from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {collectAttachments,syncAttachments} from './attachments.js'

const base=await fs.mkdtemp(path.join(os.tmpdir(),'peer-attachments-'))
try {
 const [src,dst,send,receive]=['src','dst','send','receive'].map(n=>path.join(base,n))
 const bytes=Buffer.from('attachment fixture'),hash=createHash('sha256').update(bytes).digest('hex')
 const ref={attachmentId:'sha256:'+hash,bytes:bytes.length},refs=new Map()
 collectAttachments([{type:'tool/result',data:{message:{content:[{type:'image',attachment:{...ref,mediaType:'image/png'}}]}}},{type:'user/message',data:{content:[{type:'file',attachment:{...ref,name:'notes.txt'}}]}}],refs)
 assert.equal(refs.size,3)
 const file=path.join(src,[...refs.keys()][0])
 assert.deepEqual(await syncAttachments(dst,receive,send,refs),[hash])
 await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes)
 await syncAttachments(src,send,receive,refs)
 assert.deepEqual(await syncAttachments(dst,receive,send,refs),[])
 for(const rel of refs.keys())assert.deepEqual(await fs.readFile(path.join(dst,rel)),bytes)
 await fs.writeFile(path.join(send,'attachment-'+hash+'.bin'),'damaged')
 await assert.rejects(syncAttachments(path.join(base,'fresh'),receive,send,refs),/checksum/)
 console.log('PASS historical tool images, file alias, retry and corruption checks')
} finally {await fs.rm(base,{recursive:true,force:true})}
