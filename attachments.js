import * as fs from 'node:fs/promises'
import path from 'node:path'
import {createHash, randomUUID} from 'node:crypto'

export function collectAttachments(value, refs) {
  if (!value || typeof value !== 'object') return
  const match = typeof value.attachmentId === 'string' && /^sha256:([a-f0-9]{64})$/.exec(value.attachmentId)
  if (match && Number.isSafeInteger(value.bytes) && value.bytes > 0) {
    const hash = match[1]
    const prefix = hash.slice(0, 2)
    if (typeof value.mediaType === 'string' && value.mediaType.startsWith('image/')) {
      refs.set('objects/'+prefix+'/'+hash, hash)
    } else if (typeof value.name === 'string' && !/[<>:"/\\|?*\x00-\x1f]/.test(value.name) &&
        value.name.length && !/[. ]$/.test(value.name) && !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(value.name)) {
      refs.set('file-objects/'+prefix+'/'+hash, hash)
      refs.set('files/'+prefix+'/'+hash+'/'+value.name, hash)
    }
  }
  for (const child of Object.values(value)) collectAttachments(child, refs)
}

async function exists(file) {
  try { await fs.access(file); return true } catch(e) { if(e.code==='ENOENT')return false;throw e }
}
async function copyVerified(src,dst,hash) {
  if(await exists(dst) || !await exists(src))return
  const st=await fs.stat(src)
  if(st.size>64*1024*1024)throw Error('Attachment exceeds transport limit: '+hash)
  const bytes=await fs.readFile(src)
  if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Attachment checksum mismatch: '+hash)
  await fs.mkdir(path.dirname(dst),{recursive:true})
  const tmp=dst+'.'+randomUUID()+'.tmp'
  try{await fs.writeFile(tmp,bytes,{flag:'wx',mode:0o600});await fs.rename(tmp,dst)}
  finally{await fs.rm(tmp,{force:true})}
}
export async function syncAttachments(root,mine,peer,refs) {
  const missing=[]
  for (const [rel,hash] of refs) {
    const object=path.join(root,...rel.split('/')), name='attachment-'+hash+'.bin'
    const outgoing=path.join(mine,name)
    await copyVerified(path.join(peer,name),object,hash)
    await copyVerified(outgoing,object,hash)
    if(await exists(object))await copyVerified(object,outgoing,hash)
    else missing.push(hash)
  }
  return [...new Set(missing)]
}
