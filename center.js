import {organizerFor} from './organizer.js'
import path from 'node:path'
import net from 'node:net'
import {createHash,randomUUID} from 'node:crypto'
import {Pairing} from './pairing.js'
export const links=new Map()
let currentPairing
export function presenceFor(link){
 const self=currentPairing?.device
 if(!self)return undefined
 const peers=[...links.values()].filter(l=>l!==link&&l.remoteId&&Date.now()-l.contact<24000)
 return {id:self.id,name:self.name,platform:self.platform,
  peers:peers.slice(0,16).map(l=>({id:l.remoteId,name:l.remoteName||l.cfg.remoteName,host:l.lastAddress,platform:l.remotePlatform,age:Math.max(0,Date.now()-l.contact)}))}
}
export function rememberPresence(link,data){
 const valid=id=>typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id)
 const label=s=>String(s||'DSH').replace(/[\x00-\x1f]/g,'').slice(0,50)
 const platform=s=>s==='Windows DSH'||s==='DSH Go'?s:'DSH'
 if(!valid(data?.id))return
 link.remoteId=data.id;link.remoteName=label(data.name);link.remotePlatform=platform(data.platform)
 link.reported=(Array.isArray(data.peers)?data.peers:[]).slice(0,16).filter(x=>valid(x?.id)&&x.id!==currentPairing?.device?.id&&net.isIPv4(x.host||'')&&Number.isFinite(x.age)&&x.age>=0&&x.age<24000)
  .map(x=>({id:x.id,name:label(x.name),platform:platform(x.platform),host:x.host,seen:Date.now()-x.age}))
}
const bind=k=>({$: 'data.'+k})
const text=k=>({type:'text',text:bind(k)})
const list=k=>({type:'list',items:bind(k)})
const buttons=(...pairs)=>({type:'actions',items:pairs.map(([label,action])=>({label,action}))})
const row=(title,subtitle,act,args={})=>({title,subtitle,...(act?{action:{id:act,args}}:{})})
export const linkKey=c=>createHash('sha256').update(path.resolve(c.exchange)).digest('hex').slice(0,16)
export function setupCenter(ctx,home,defaults,start){
 const organizer=organizerFor(home)
 const pairing=new Pairing(home,defaults,start)
 currentPairing=pairing
 const ready=pairing.init().catch(e=>{pairing.error=e.message})
 let deletion=null,deleteMode=false
 let active='',page=0,query='',address='',message=''
 const listeners=new Set(),en=c=>String(c?.locale||'').startsWith('en')
 let scanning=null,lastScan=0,scanError=''
 const pick=()=>links.get(active)||links.values().next().value
 function state(english=false){
  const tr=(a,b)=>english?b:a,link=pick(),policy=link?.policy,v=policy?.value
  const name=l=>l.cfg.remoteName||({android:'Android · DSH Go',windows:'Windows · DSH','phone-a':'Android A','phone-b':'Android B'}[l.other])
  const devices=[...links.values()].slice(0,30).map(l=>{
   const ago=l.contact?Math.floor((Date.now()-l.contact)/1000):Infinity
   return row((l===link?'● ':'')+name(l),ago<90?tr('在线','Online'):Number.isFinite(ago)?tr('上次连接 ','Last seen ')+Math.floor(ago/60)+' min':tr('等待连接','Waiting for peer'),'device',{key:linkKey(l.cfg)})
  })
  const peers=[...links.values()]
  const nearby=[...pairing.near.values()].filter(x=>Date.now()-x.seen<35000)
  const wifi=nearby.map(x=>{
   const l=peers.find(p=>p.remoteId===x.id||p.lastAddress===x.host||p.cfg.lan.host===x.host)
   return row(l?name(l):x.name,[x.platform,l?tr('已配对','Paired'):tr('未配对','Unpaired'),x.host].join(' · '),l?'device':x.port?'near':null,l?{key:linkKey(l.cfg)}:{address:x.host+':'+x.port})
  })
  for(const l of peers)if(Date.now()-l.contact<30000&&!nearby.some(x=>x.id===l.remoteId||x.host===l.lastAddress||x.host===l.cfg.lan.host)){
    wifi.push(row(name(l),[(l.other==='windows'?'Windows DSH':l.other==='android'?'DSH Go':l.remotePlatform||'DSH'),tr('已配对 · 在线','Paired · Online'),l.lastAddress].filter(Boolean).join(' · '),'device',{key:linkKey(l.cfg)}))
  }
  const known=new Set([...nearby.map(x=>x.id),...peers.filter(l=>Date.now()-l.contact<30000).map(l=>l.remoteId),pairing.device?.id])
  for(const l of peers.filter(l=>Date.now()-l.contact<30000))for(const x of l.reported||[]){
    if(known.has(x.id)||Date.now()-x.seen>30000)continue
    known.add(x.id);wifi.push(row(x.name,[x.platform,tr('由 ','Seen by ')+name(l)+tr(' 发现',''),tr('未直接连接','Indirect')].join(' · ')))
  }
  const allDevices=wifi.map(item=>{
   if(item.action?.id==='device')return {...item,title:(item.action.args.key===linkKey(link.cfg)?'✓ ':'')+item.title}
   return {...item,action:{id:'pairFromHome',args:item.action?.id==='near'?item.action.args:{}}}
  })
  for(const l of peers)if(!allDevices.some(row=>row.action?.id==='device'&&row.action.args.key===linkKey(l.cfg))){
   allDevices.push(row((l===link?'✓ ':'')+name(l),tr('已配对 · 离线','Paired · Offline'),'device',{key:linkKey(l.cfg)}))
  }
  const entries=[...(policy?.catalog||[])].filter(([id,t])=>(t+' '+id).toLowerCase().includes(query.toLowerCase()))
  const count=Math.max(1,Math.ceil(entries.length/12));page=Math.min(page,count-1)
  const preferred=new Set(Object.entries(v?.conflicts||{}).map(([branch,original])=>v.master.role===link.other?branch:v.master.role===link.cfg.device?original:''))
  const chats=entries.slice(page*12,page*12+12).map(([id,title])=>row((policy.selected(id)?'☑ ':'☐ ')+(preferred.has(id)?tr('主线 · ','Primary · '):'')+title.slice(0,90),id.slice(-8),'toggle',{key:linkKey(link.cfg),id}))
  const role=v?.master.role,master=!link?'—':role==='both'?tr('双向','Two-way'):role===link.cfg.device?tr('本机为主','This device primary'):tr('对端为主','Peer primary')
  const selectedCount=policy?[...policy.catalog.keys()].filter(id=>policy.selected(id)).length:0
  const preview=link?tr('本机已选 ','Selected locally: ')+selectedCount+tr(' 段聊天 · 对端 ',' chats · Peer: ')+name(link):''
  const deleteChats=chats.map(c=>({...c,title:c.title.replace(/^[☑☐] /,''),action:{id:'previewDelete',args:c.action.args}}))
  const controls=[]
  if(link){
    const roleLabel=v.master.role===link.cfg.device?tr('本机是主设备','This device is primary'):v.master.role===link.other?tr('对端是主设备','Peer is primary'):tr('双方均可发起','Either device can start')
    controls.push(row(tr('传输方向','Direction'),roleLabel,'openRoles'))
    if(v.master.role===link.cfg.device)controls.push(row(tr('允许本机发送','Allow sending'),v.pushEnabled?tr('已开 · 点击关闭','On · Tap to turn off'):tr('已关 · 点击开启','Off · Tap to turn on'),v.pushEnabled?'pushOff':'pushOn',{key:linkKey(link.cfg)}))
    if(v.master.role===link.other)controls.push(row(tr('允许主设备删除本机聊天','Allow primary to delete here'),v.allowDelete?tr('已开 · 点击关闭','On · Tap to turn off'):tr('已关 · 点击开启','Off · Tap to turn on'),v.allowDelete?'deleteAuthOff':'deleteAuthOn',{key:linkKey(link.cfg)}))
    if(v.master.role===link.cfg.device)controls.push(row(tr('删除聊天…','Delete a chat…'),tr('逐条选择并确认设备','Choose a chat and destination'),'openDelete'))
  }
  controls.push(row(tr('本机自动整理','Organize this device'),organizer.enabled?tr('已开 · 点击关闭','On · Tap to turn off'):tr('已关 · 点击开启','Off · Tap to turn on'),organizer.enabled?'organizeOff':'organizeOn'))
  const target=link?(v.master.role===link.other?tr('请到主设备 ','Start on ')+name(link):v.master.role===link.cfg.device?tr('本机 → ','This device → ')+name(link):tr('本机 ⇄ ','This device ⇄ ')+name(link)):tr('先配对一台设备','Pair a device first')
  const selectionText=link?(v.mode==='all'?tr('全部聊天','All chats'):tr('选中的聊天','Selected chats'))+' · '+tr('本机 ','Local ')+selectedCount+tr(' 段',''):''
  return {target,selectionText,allDevices,controls,deleteChats,preview,devices,wifi,wifiStatus:scanError|| (wifi.length?tr('同一局域网 · ','Local network · ')+wifi.length:tr('暂未发现在线设备','No devices found yet')),chats,master,
   transferMode:tr('手动同步','Manual sync')+' · '+(v?.pushEnabled?tr('主设备发送已开','Primary sending on'):tr('主设备发送已关','Primary sending off'))+' · '+(v?.allowDelete?tr('允许对端主设备删除','Peer deletion allowed'):tr('对端删除已关','Peer deletion off')),
   deleteInfo:deletion&&link&&deletion.key===linkKey(link.cfg)?tr('待确认删除：','Confirm removal: ')+deletion.title+' · '+tr('本机或 ','This device or ')+name(link):deleteMode?tr('点一条聊天预览删除','Tap one chat to review deletion'):'',
   deleteActions:deletion&&link&&deletion.key===linkKey(link.cfg)?[row(tr('确认删除本机这一条','Delete this local chat'),deletion.title,'deleteLocal',{key:deletion.key,nonce:deletion.nonce}),row(tr('确认只删除对端这一条','Delete only on peer'),name(link),'deletePeer',{key:deletion.key,nonce:deletion.nonce}),row(tr('取消','Cancel'),'','cancelDelete')]:[],
   organizer:tr('本机自动整理','Organize on this device')+' · '+(organizer.enabled?tr('已开启','On'):tr('已关闭','Off'))+' · '+tr('已归档 ','Archived ')+Object.keys(organizer.archives).length,summary:link?name(link)+' · '+master:tr('尚未配对','No paired devices'),
   scope:!v?'—':(v.mode==='all'?tr('同步全部聊天','Send all chats'):tr('只同步勾选的聊天','Send selected chats'))+' · '+(page+1)+'/'+count,
   last:link?.error||link?.note||pairing.error||message||'', 
   invitation:pairing.offer&&!pairing.offer.used?tr('五分钟内有效 · ','Valid for 5 minutes · ')+pairing.offer.code+' · '+(pairing.offer.addresses.map(a=>a+':'+pairing.offer.port).join(' / ')||tr('请用附近发现','Use nearby discovery')):tr('由一台设备创建邀请，另一台查找并输入邀请码。','Create an invitation here or find the inviting device.'),
   nearby:[...pairing.near.values()].slice(0,20).map(x=>row(x.name,x.host+(x.port?':'+x.port:'')+(x.port?'':tr(' · 尚未邀请',' · Not inviting')),x.port?'near':null,{address:x.host+':'+x.port})),
   form:{address,code:'',query},key:link?linkKey(link.cfg):''}
 }
 const notify=()=>{for(const f of listeners)f()}
 function scan(force=false){
  if(scanning)return scanning
  if(!force&&Date.now()-lastScan<12000)return Promise.resolve()
  lastScan=Date.now()
  scanning=ready.then(()=>pairing.scan([...links.values()].flatMap(l=>[l.lastAddress,l.cfg.lan.host,...(l.reported||[]).filter(x=>Date.now()-x.seen<30000).map(x=>x.host)].filter(Boolean)))).then(()=>{scanError=''}).catch(e=>{scanError=e.message}).finally(()=>{scanning=null;notify()})
  return scanning
 }
 async function action(a,args={}){
  const l=args.key?links.get(args.key):pick(),p=l?.policy
  if(a==='device'){if(!l)throw Error('Device unavailable');active=args.key;page=0;deleteMode=false;deletion=null}
  else if(a==='scan'){await scan(true)}
  else if(a==='near'){address=args.address}
  else if(a==='invite'){await ready;await pairing.invite()}
  else if(a==='join'){await ready;await pairing.join(args.address,args.code);message='已配对 / Paired'}
  else if(a==='search'){query=String(args.query||'').slice(0,100);page=0}
  else if(a==='next')page++
  else if(a==='prev')page=Math.max(0,page-1)
  else if(a==='organizeOn'||a==='organizeOff'){await organizer.set(a==='organizeOn');if(l)void l.tick()}
  else if(!l)throw Error('请先选择配对设备 / Select a device')
  else if(a==='sync'){l.request(p.value.master.role==='both'?'both':'push')}
  else if(['pushOn','pushOff','deleteAuthOn','deleteAuthOff'].includes(a)){
   if(a.startsWith('push')&&p.value.master.role!==l.cfg.device)throw Error('请先选本机为主 / Select this device as primary')
   if(a==='deleteAuthOn'&&p.value.master.role!==l.other)throw Error('请先选对端为主 / Select peer as primary')
   await p.change(v=>{if(a.startsWith('push'))v.pushEnabled=a==='pushOn';else v.allowDelete=a==='deleteAuthOn'})
  }
  else if(a==='cancelDelete'){deletion=null;deleteMode=false}
  else if(a==='deleteMode'||a==='previewDelete'||a==='deleteLocal'||a==='deletePeer'){
   if(p.value.master.role!==l.cfg.device)throw Error('仅主设备可删除 / Primary required')
   if(a==='deleteMode'){deleteMode=true;deletion=null}
   else if(a==='previewDelete'){
    if(!p.catalog.has(args.id))throw Error('请重新选择 / Select again')
    deletion={...await l.describe(args.id),key:linkKey(l.cfg),nonce:randomUUID(),until:Date.now()+120000}
   }else{
    const d=deletion
    if(!d||d.nonce!==args.nonce||d.key!==linkKey(l.cfg)||Date.now()>d.until)throw Error('请重新预览 / Preview expired')
    deletion=null;deleteMode=false
    if(a==='deletePeer')l.request('delete',{chat:d.chat,hash:d.hash})
    else{await l.erase(d);l.note='已从本机删除 / Removed locally'}
   }
  }
  else if(['both','local','peer'].includes(a)){await p.master(a==='local'?l.cfg.device:a==='peer'?l.other:'both');void l.tick()}
  else if(['some','all'].includes(a)){await p.select(v=>{v.mode=a});void l.tick()}
  else if(a==='toggle'){if(!p.catalog.has(args.id))throw Error('Unknown session');await p.select(v=>{
    if(v.mode==='all'){v.mode='some';v.ids=[...p.catalog.keys()].filter(id=>id!==args.id)}
    else v.ids=v.ids.includes(args.id)?v.ids.filter(x=>x!==args.id):[...v.ids,args.id]
   });void l.tick()}
  notify()
 }
 const act=['pushOn','pushOff','deleteAuthOn','deleteAuthOff','cancelDelete','deleteMode','previewDelete','deleteLocal','deletePeer','organizeOn','organizeOff','device','scan','near','invite','join','search','next','prev','sync','both','local','peer','all','some','toggle']
 ctx.inject?.(['dshGo'],c=>{
  for(const [id,kind] of [['peer-home','home'],['peer-pair','pair'],['peer-chats','chats'],['peer-settings','settings'],['peer-roles','roles'],['peer-delete','delete']]){
   c.dshGo.panel(id,{view:(_s,caps)=>{
    const tr=(a,b)=>en(caps)?b:a,btn=(a,b,k)=>[tr(a,b),k]
    const form=(submit,label,fields)=>({type:'form',submit,submitLabel:label,children:fields.map(([key,title])=>({type:'textField',label:title,bind:'data.form.'+key,maxLength:100}))})
    const primary=(label,action)=>({type:'actions',items:[{label,action,style:'primary'}]})
    const search=form('search',tr('搜索','Search'),[['query',tr('聊天标题','Chat title')]])
    const pages=buttons(btn('上一页','Previous','prev'),btn('下一页','Next','next'))
    const home=[text('wifiStatus'),list('allDevices'),text('target'),text('selectionText'),primary(tr('同步一次','Sync once'),'sync'),buttons(btn('选择聊天','Choose chats','openChats'),btn('设备设置','Device settings','openSettings')),buttons(btn('配对新设备','Pair a device','openPair'),btn('刷新设备','Refresh','scan'))]
    const chats=[text('target'),text('scope'),buttons(btn('全部聊天','All chats','all'),btn('只同步勾选项','Selected only','some')),search,list('chats'),pages]
    const settings=[text('target'),list('controls')]
    const roles=[text('target'),buttons(btn('双向手动同步','Manual two-way','both'),btn('本机为主','This device primary','local'),btn('对端为主','Peer primary','peer'))]
    const remove=[text('target'),text('deleteInfo'),list('deleteActions'),search,list('deleteChats'),pages]
    const pair=[buttons(btn('创建邀请','Create invite','invite'),btn('查找附近设备','Find nearby','scan')),text('invitation'),list('nearby'),form('join',tr('确认配对','Pair'),[['address',tr('对方地址和端口','Peer IP:port')],['code',tr('20 位邀请码','20-character invitation code')]])]
    const children={home,chats,settings,roles,delete:remove,pair}[kind]
    return {v:2,type:'stack',children:[...children,text('last')]}
   },data:(_s,emit,caps)=>{const f=()=>emit(state(en(caps)));listeners.add(f);const refresh=()=>{f();if(kind==='home'||kind==='pair')void scan()};refresh();const t=setInterval(refresh,15000);return ()=>{clearInterval(t);listeners.delete(f)}},
   actions:{openSettings:()=>({open:'panel:peer-settings'}),openRoles:()=>({open:'panel:peer-roles'}),
    pairFromHome:(_s,e)=>{address=e.value?.address||'';return {open:'panel:peer-pair'}},
    openDelete:()=>{deletion=null;deleteMode=true;page=0;query='';return {open:'panel:peer-delete'}},
    openChats:()=>{deletion=null;deleteMode=false;page=0;query='';return {open:'panel:peer-chats'}},
    openPair:()=>({open:'panel:peer-pair'}),...Object.fromEntries(act.map(a=>[a,async(_s,e)=>{const v=e.value||{},vals=v.values||{};await action(a,{...v,...Object.fromEntries(Object.entries(vals).map(([k,x])=>[k.split('.').pop(),x]))});return a==='near'?{patch:{form:{address,code:''}}}:{refresh:true}}]))}})
  }
 })
 ctx.effect(()=>()=>pairing.close())
 return {state,action,ready,scan}
}
