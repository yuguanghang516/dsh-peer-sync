import * as fs from 'node:fs/promises'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const run=promisify(execFile),sha=x=>createHash('sha256').update(x).digest('hex')
const maxBytes=16*1024*1024
const formats=/\.(md|txt|pdf|docx|xlsx|pptx|csv|json|ya?ml|png|jpe?g|webp|gif|svg|mp3|mp4)$/i
async function write(file,bytes){
  await fs.mkdir(path.dirname(file),{recursive:true})
  const tmp=file+'.'+randomUUID()+'.tmp'
  try{await fs.writeFile(tmp,bytes,{flag:'wx',mode:0o600});await fs.rename(tmp,file)}finally{await fs.rm(tmp,{force:true})}
}
async function get(file){try{return await fs.readFile(file)}catch(e){if(e.code==='ENOENT')return null;throw e}}
async function safePath(base,rel){
  const parts=rel.split('/')
  if(!parts.length||parts.some(s=>!s||s.startsWith('.')||s.toLowerCase()==='node_modules'||/[<>:"|?*\\\x00-\x1f]/.test(s)||/[. ]$/.test(s)||/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s)))throw Error('Invalid shared path')
  let file=base
  for(const s of parts){file=path.join(file,s);const st=await fs.lstat(file).catch(e=>{if(e.code!=='ENOENT')throw e});if(st?.isSymbolicLink())throw Error('Shared symlink skipped')}
  return file
}
async function* walk(base,rel=''){
  for(const ent of await fs.readdir(path.join(base,rel),{withFileTypes:true})){
    if(ent.name.startsWith('.')||ent.name==='node_modules'||ent.isSymbolicLink())continue
    const name=rel?rel+'/'+ent.name:ent.name
    if(ent.isDirectory())yield* walk(base,name)
    else if(ent.isFile()&&formats.test(name))yield name
  }
}
export async function syncFiles(cfg,mine,peer){
  if(!cfg.sharedDirectory)return
  await fs.mkdir(cfg.sharedDirectory,{recursive:true})
  const base=await fs.realpath(cfg.sharedDirectory)
  const stateFile=path.join(cfg.exchange,'file-state.json'),state=JSON.parse((await get(stateFile))||'{}')
  for await(const name of walk(base)){
    const file=await safePath(base,name)
    if((await fs.stat(file)).size>maxBytes)continue
    const data=await fs.readFile(file),hash=sha(data),id=sha(name),out=path.join(mine,'data-'+id+'.json')
    if(state[id]?.sent!==hash||!await fs.stat(out).catch(()=>null)){
      await write(out,JSON.stringify({name,hash,body:data.toString('base64')}))
      state[id]={...state[id],sent:hash}
    }
  }
  for(const name of await fs.readdir(peer).catch(e=>{if(e.code==='ENOENT')return [];throw e})){
    if(!/^data-[a-f0-9]{64}\.json$/.test(name))continue
    const v=JSON.parse(await fs.readFile(path.join(peer,name))),id=sha(v.name)
    if(name!=='data-'+id+'.json'||!formats.test(v.name))throw Error('Shared filename mismatch')
    const data=Buffer.from(v.body,'base64')
    if(data.length>maxBytes||sha(data)!==v.hash)throw Error('Shared file checksum mismatch')
    const dest=await safePath(base,v.name),current=await get(dest),hash=current&&sha(current),last=state[id]||{}
    if(hash===v.hash){state[id]={...last,common:hash};continue}
    if(last.common===v.hash)continue
    if(current&&hash!==last.common){
      await write(path.join(cfg.exchange,'file-conflicts',id,v.hash+path.extname(v.name)),data)
      continue
    }
    await write(dest,data);state[id]={...last,common:v.hash}
  }
  await write(stateFile,JSON.stringify(state))
}
export async function packAddons(cfg,mine){
  for(const name of cfg.portablePlugins||[]){
    if(!/^(@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(name))throw Error('Invalid plugin name')
    const root=path.join(cfg.profileDirectory,'node_modules',name)
    const contents=await get(path.join(root,'package.json'));if(!contents)continue
    const manifest=JSON.parse(contents)
    if(manifest.name!==name||!Array.isArray(manifest.files))continue
    const id=sha(name),out=path.join(mine,'addon-'+id+'.json'),marker=path.join(cfg.exchange,'packed-'+id)
    if((await get(marker))?.toString()===manifest.version && await fs.stat(out).catch(()=>null))continue
    const stage=await fs.mkdtemp(path.join(cfg.exchange,'pack-'))
    try{
      // Use the platform's tar only for explicitly published files; never run package scripts.
      const list=['package.json']
      for(const it of manifest.files){
        const rel=it.replace(/\/$/,'')
        if(!/^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/.test(rel)||rel.split('/').includes('..'))throw Error('Unsupported package files list')
        const item=await safePath(root,rel)
        if(await fs.stat(item).catch(()=>null))list.push(rel)
      }
      const dir=path.join(stage,'package');await fs.mkdir(dir)
      for(const rel of [...new Set([...list,'LICENSE','README.md'])]){
        const src=path.join(root,rel);if(!await fs.stat(src).catch(()=>null))continue
        await fs.cp(src,path.join(dir,rel),{recursive:true,filter:async p=>!(await fs.lstat(p)).isSymbolicLink()})
      }
      const tar=path.join(stage,'addon.tgz')
      await run('tar',['-czf',tar,'-C',stage,'package'])
      const b=await fs.readFile(tar)
      if(b.length>maxBytes)throw Error('Plugin package exceeds limit')
      await write(out,JSON.stringify({name,version:manifest.version,hash:sha(b),body:b.toString('base64')}));await write(marker,manifest.version)
    }finally{await fs.rm(stage,{recursive:true,force:true})}
  }
}
export async function receiveAddons(cfg,peer){
  for(const pkg of cfg.portablePlugins||[]){
    const raw=await get(path.join(peer,'addon-'+sha(pkg)+'.json'))
    if(!raw)continue
    const v=JSON.parse(raw),b=Buffer.from(v.body,'base64')
    if(v.name!==pkg||!/^\d+[.a-z0-9+-]*$/i.test(v.version)||sha(b)!==v.hash||b.length>maxBytes)throw Error('Invalid portable package')
    const file=path.join(cfg.exchange,'received-plugins',pkg.replace(/^@/,'').replace('/','-')+'-'+v.version+'.tgz')
    const exists=await get(file)
    if(!exists||sha(exists)!==v.hash)await write(file,b)
    if(!cfg.autoInstallPlugins?.includes(pkg))continue
    try{await alignPlugin(cfg,pkg,v,file)}catch(e){
      await write(path.join(cfg.exchange,'plugin-install-status-'+sha(pkg)+'.json'),JSON.stringify({plugin:pkg,version:v.version,error:e.message.split('\n')[0]}))
    }
  }
}

const retryAfter=new Map()
export function newer(candidate,installed){
  const stable=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
  if(!stable.test(candidate))return false
  if(installed===undefined)return true
  if(!stable.test(installed))return false
  const a=candidate.split('.').map(BigInt),b=installed.split('.').map(BigInt)
  for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i]
  return false
}
async function alignPlugin(cfg,name,remote,file){
  if(!/^(@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(name)||name==='dsh-peer-sync')return
  const installed=await get(path.join(cfg.profileDirectory,'node_modules',name,'package.json'))
  if(!newer(remote.version,installed?JSON.parse(installed).version:undefined))return
  const key=name+':'+remote.hash
  if((retryAfter.get(key)||0)>Date.now())return
  retryAfter.set(key,Date.now()+600000)
  const meta=JSON.parse((await run('tar',['-xzOf',file,'package/package.json'])).stdout)
  if(meta.name!==name||meta.version!==remote.version||meta.os||meta.cpu||meta.scripts?.install||meta.scripts?.postinstall||meta.scripts?.preinstall)throw Error('Plugin requires manual installation')
  const profile=path.basename(cfg.profileDirectory)
  const args=['plugin','--profile',profile,'add','file:'+file]
  const env={...process.env,npm_config_fetch_retries:'0'}
  if(process.platform==='win32'){
    const entry=path.join(path.dirname(process.execPath),'resources','app','dsh','node_modules','@deepseek-ai','dsh-desktop-host','lib','cli.js')
    await fs.access(entry)
    await run(process.execPath,['--expose-internals',entry,...args],{env:{...env,ELECTRON_RUN_AS_NODE:'1'},cwd:cfg.profileDirectory,timeout:180000,windowsHide:true})
  }else{
    await run('dsh',args,{env,cwd:cfg.profileDirectory,timeout:180000})
  }
  const after=JSON.parse(await fs.readFile(path.join(cfg.profileDirectory,'node_modules',name,'package.json')))
  if(after.version!==remote.version)throw Error('Installed version mismatch')
  await write(path.join(cfg.exchange,'plugin-install-status-'+sha(name)+'.json'),JSON.stringify({plugin:name,installed:after.version,restartRequired:true}))
}