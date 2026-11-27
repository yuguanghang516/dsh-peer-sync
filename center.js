import {organizerFor} from './organizer.js'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {Pairing} from './pairing.js'
export const links=new Map()
const bind=k=>({$: 'data.'+k})
const text=k=>({type:'text',text:bind(k)})
const list=k=>({type:'list',items:bind(k)})
const buttons=(...pairs)=>({type:'actions',items:pairs.map(([label,action])=>({label,action}))})
const row=(title,subtitle,act,args={})=>({title,subtitle,...(act?{action:{id:act,args}}:{})})
export const linkKey=c=>createHash('sha256').update(path.resolve(c.exchange)).digest('hex').slice(0,16)
export function setupCenter(ctx,home,defaults,start){
 const organizer=organizerFor(home)
 const pairing=new Pairing(home,defaults,start)
 const ready=pairing.init().catch(e=>{pairing.error=e.message})
 let active='',page=0,query='',address='',message=''
 const listeners=new Set(),en=c=>String(c?.locale||'').startsWith('en')
 const pick=()=>links.get(active)||links.values().next().value
 function state(english=false){
  const tr=(a,b)=>english?b:a,link=pick(),policy=link?.policy,v=policy?.value
  const name=l=>l.cfg.remoteName||({android:'Android · DSH Go',windows:'Windows · DSH','phone-a':'Android A','phone-b':'Android B'}[l.other])
  const devices=[...links.values()].slice(0,30).map(l=>{
   const ago=l.contact?Math.floor((Date.now()-l.contact)/1000):Infinity
   return row((l===link?'● ':'')+name(l),ago<90?tr('在线','Online'):Number.isFinite(ago)?tr('上次连接 ','Last seen ')+Math.floor(ago/60)+' min':tr('等待连接','Waiting for peer'),'device',{key:linkKey(l.cfg)})
  })
  const entries=[...(policy?.catalog||[])].filter(([id,t])=>(t+' '+id).toLowerCase().includes(query.toLowerCase()))
  const count=Math.max(1,Math.ceil(entries.length/12));page=Math.min(page,count-1)
  const preferred=new Set(Object.entries(v?.conflicts||{}).map(([branch,original])=>v.master.role===link.other?branch:v.master.role===link.cfg.device?original:''))
  const chats=entries.slice(page*12,page*12+12).map(([id,title])=>row((policy.selected(id)?'☑ ':'☐ ')+(preferred.has(id)?tr('主线 · ','Primary · '):'')+title.slice(0,90),id.slice(-8),'toggle',{key:linkKey(link.cfg),id}))
  const role=v?.master.role,master=!link?'—':role==='both'?tr('双向','Two-way'):role===link.cfg.device?tr('本机为主','This device primary'):tr('对端为主','Peer primary')
  return {devices,chats,master,organizer:tr('本机自动整理','Organize on this device')+' · '+(organizer.enabled?tr('已开启','On'):tr('已关闭','Off'))+' · '+tr('已归档 ','Archived ')+Object.keys(organizer.archives).length,summary:link?name(link)+' · '+master:tr('尚未配对','No paired devices'),
   scope:!v?'—':(v.mode==='all'?tr('同步全部聊天','Send all chats'):tr('只同步勾选的聊天','Send selected chats'))+' · '+(page+1)+'/'+count,
   last:link?.error||pairing.error||message||'', 
   invitation:pairing.offer&&!pairing.offer.used?tr('五分钟内有效 · ','Valid for 5 minutes · ')+pairing.offer.code+' · '+(pairing.offer.addresses.map(a=>a+':'+pairing.offer.port).join(' / ')||tr('请用附近发现','Use nearby discovery')):tr('由一台设备创建邀请，另一台查找并输入邀请码。','Create an invitation here or find the inviting device.'),
   nearby:[...pairing.near.values()].slice(0,20).map(x=>row(x.name,x.host+(x.port?':'+x.port:'')+(x.port?'':tr(' · 尚未邀请',' · Not inviting')),x.port?'near':null,{address:x.host+':'+x.port})),
   form:{address,code:'',query},key:link?linkKey(link.cfg):''}
 }
 const notify=()=>{for(const f of listeners)f()}
 async function action(a,args={}){
  const l=args.key?links.get(args.key):pick(),p=l?.policy
  if(a==='device'){if(!l)throw Error('Device unavailable');active=args.key;page=0}
  else if(a==='scan'){await ready;await pairing.scan()}
  else if(a==='near'){address=args.address}
  else if(a==='invite'){await ready;await pairing.invite()}
  else if(a==='join'){await ready;await pairing.join(args.address,args.code);message='已配对 / Paired'}
  else if(a==='search'){query=String(args.query||'').slice(0,100);page=0}
  else if(a==='next')page++
  else if(a==='prev')page=Math.max(0,page-1)
  else if(a==='organizeOn'||a==='organizeOff'){await organizer.set(a==='organizeOn');if(l)void l.tick()}
  else if(!l)throw Error('请先选择配对设备 / Select a device')
  else if(a==='sync'){void l.tick();message='已请求同步 / Sync requested'}
  else if(['both','local','peer'].includes(a)){await p.master(a==='local'?l.cfg.device:a==='peer'?l.other:'both');void l.tick()}
  else if(['some','all'].includes(a)){await p.select(v=>{v.mode=a});void l.tick()}
  else if(a==='toggle'){if(!p.catalog.has(args.id))throw Error('Unknown session');await p.select(v=>{
    if(v.mode==='all'){v.mode='some';v.ids=[...p.catalog.keys()].filter(id=>id!==args.id)}
    else v.ids=v.ids.includes(args.id)?v.ids.filter(x=>x!==args.id):[...v.ids,args.id]
   });void l.tick()}
  notify()
 }
 const act=['organizeOn','organizeOff','device','scan','near','invite','join','search','next','prev','sync','both','local','peer','all','some','toggle']
 ctx.inject?.(['dshGo'],c=>{
  for(const [id,kind] of [['peer-home','home'],['peer-pair','pair'],['peer-chats','chats']]){
   c.dshGo.panel(id,{view:(_s,caps)=>{
    const tr=(a,b)=>en(caps)?b:a,btn=(a,b,k)=>[tr(a,b),k]
    const form=(submit,label,fields)=>({type:'form',submit,submitLabel:label,children:fields.map(([key,title])=>({type:'textField',label:title,bind:'data.form.'+key,maxLength:100}))})
    const children=kind==='home'?[list('devices'),text('summary'),buttons(btn('双向','Two-way','both'),btn('本机为主','This device primary','local'),btn('对端为主','Peer primary','peer')), {type:'text',text:tr('日常双向合并。出现分歧时，在聊天清单标记主设备的版本，两份记录都保留。','Both devices sync. The preferred conflict branch is marked in the chat list.')},buttons(btn('立即同步','Sync now','sync'),btn('选择聊天','Choose chats','openChats'),btn('配对设备','Pair devices','openPair')),text('organizer'),buttons(btn('开启自动整理','Enable organizer','organizeOn'),btn('关闭自动整理','Disable organizer','organizeOff'))]:
    kind==='chats'?[text('summary'),text('scope'),buttons(btn('全部聊天','All chats','all'),btn('仅选中','Selected only','some')),form('search',tr('搜索','Search'),[['query',tr('聊天标题','Chat title')]]),list('chats'),buttons(btn('上一页','Previous','prev'),btn('下一页','Next','next'))]:
    [buttons(btn('创建邀请','Create invite','invite'),btn('查找附近设备','Find nearby','scan')),text('invitation'),list('nearby'),form('join',tr('确认配对','Pair'),[['address',tr('对方地址和端口','Peer IP:port')],['code',tr('20 位邀请码','20-character invitation code')]])]
    return {v:2,type:'stack',children:[...children,text('last')]}
   },data:(_s,emit,caps)=>{const f=()=>emit(state(en(caps)));listeners.add(f);f();const t=setInterval(f,12000);return ()=>{clearInterval(t);listeners.delete(f)}},
   actions:{openChats:()=>({open:'panel:peer-chats'}),openPair:()=>({open:'panel:peer-pair'}),...Object.fromEntries(act.map(a=>[a,async(_s,e)=>{const v=e.value||{},vals=v.values||{};await action(a,{...v,...Object.fromEntries(Object.entries(vals).map(([k,x])=>[k.split('.').pop(),x]))});return a==='near'?{patch:{form:{address,code:''}}}:{refresh:true}}]))}})
  }
 })
 ctx.effect(()=>()=>pairing.close())
 return {state,action,ready}
}
