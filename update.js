import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash,randomUUID} from 'node:crypto'
import {newer} from './extras.js'
const author='yuguanghang516',repo='https://github.com/yuguanghang516/dsh-peer-sync'
export async function checkUpdate({download=false,home=process.env.DSH_HOME||path.join(os.homedir(),'.dsh'),request=fetch}={}){
  const current=JSON.parse(await fs.readFile(new URL('./package.json',import.meta.url))).version
  const get=async url=>{const r=await request(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'DSH-Peer-Sync/'+current}});if(!r.ok)throw Error('GitHub HTTP '+r.status);return r}
  const release=await (await get('https://api.github.com/repos/yuguanghang516/dsh-peer-sync/releases/latest')).json()
  if(release.draft||release.prerelease||!/^v\d+\.\d+\.\d+$/.test(release.tag_name))throw Error('Invalid stable release')
  const latest=release.tag_name.slice(1),available=newer(latest,current),result={author,repo,current,latest,available}
  if(!available||!download)return result
  const name='dsh-peer-sync-'+latest+'.tgz',asset=release.assets.find(a=>a.name===name)
  if(!asset||asset.browser_download_url!==repo+'/releases/download/v'+latest+'/'+name||!/^sha256:[a-f0-9]{64}$/.test(asset.digest)||!(asset.size>0&&asset.size<=16*1024*1024))throw Error('Invalid release asset')
  const dir=path.join(home,'peer-sync-updates');await fs.mkdir(dir,{recursive:true})
  const file=path.join(dir,name),valid=b=>b.length===asset.size&&'sha256:'+createHash('sha256').update(b).digest('hex')===asset.digest
  const cached=await fs.readFile(file).catch(e=>{if(e.code!=='ENOENT')throw e})
  if(!cached||!valid(cached)){
    const chunks=[];let size=0
    for await(const chunk of (await get(asset.browser_download_url)).body){size+=chunk.length;if(size>asset.size)throw Error('Unexpected download size');chunks.push(chunk)}
    const b=Buffer.concat(chunks);if(!valid(b))throw Error('SHA-256 mismatch')
    const tmp=file+'.'+randomUUID()+'.tmp'
    try{await fs.writeFile(tmp,b,{flag:'wx'});await fs.rename(tmp,file)}finally{await fs.rm(tmp,{force:true})}
  }
  return {...result,file}
}
export function scheduleUpdates(ctx,cfg){
  if(cfg.autoCheckUpdates===false)return
  const check=()=>checkUpdate({download:cfg.autoDownloadUpdates!==false}).then(r=>{if(r.available)ctx.logger.info('Peer Sync update '+r.latest+' '+(r.file||repo))}).catch(e=>ctx.logger.warn('Update check: '+e.message))
  ctx.effect(()=>{const first=setTimeout(check,15000),timer=setInterval(check,86400000);return ()=>{clearTimeout(first);clearInterval(timer)}})
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await checkUpdate({download:process.argv.includes('--download')}),null,2))}
  catch(e){console.error(e.message);process.exitCode=1}
}
