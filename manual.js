import {presenceFor,rememberPresence} from './center.js'
import {randomUUID} from 'node:crypto'

const timeout=120000
const idPattern=/^session-[a-z0-9-]{1,100}$/i
export class ManualSession {
  constructor(link,hooks){
    this.link=link
    this.hooks=hooks
    this.pending=null
    this.active=null
    this.completed=new Map()
  }
  get local(){return this.link.cfg.device}
  get peer(){return this.link.other}
  expire(){
    const now=Date.now()
    if(this.active?.until<now)this.active=null
    if(this.pending?.until<now){this.pending=null;this.link.note='请求已过期，请重新操作 / Request expired'}
    for(const [id,result] of this.completed)if(result.until<now)this.completed.delete(id)
  }
  validate(job,initiator){
    const p=this.link.policy.value
    if(!job||!/^[-a-f0-9]{36}$/.test(job.id)||job.from!==initiator)throw Error('无效的操作 / Invalid request')
    if(job.kind==='delete'){
      if(p.master.role!==initiator||!idPattern.test(job.chat)||!/^[a-f0-9]{64}$/.test(job.hash))throw Error('仅主设备可删除 / Primary required')
      if(initiator!==this.local&&!p.allowDelete)throw Error('接收设备尚未允许主设备删除 / Deletion permission is off')
    }else if(job.kind==='push'){
      if(p.master.role!==initiator||(initiator===this.local&&!p.pushEnabled))throw Error('请先选择主设备并开启发送 / Enable primary sending')
    }else if(job.kind!=='both'||p.master.role!=='both')throw Error('请在主设备发起 / Start on primary device')
  }
  request(kind,details={}){
    this.expire()
    if(this.active||this.pending)throw Error('已有手动操作正在等待或执行 / Busy')
    const job={...details,kind,from:this.local,id:randomUUID(),until:Date.now()+timeout}
    this.validate(job,this.local)
    this.pending=job
    this.link.note='已排队，等待对端 / Waiting for peer'
    return job
  }
  direction(job,mode){
    return job.kind==='both'||(job.kind==='push'&&(mode==='send'?job.from===this.local:job.from!==this.local))
  }
  permits(token,mode){
    this.expire()
    const active=this.active
    if(!active||active.job.kind==='delete'||!token||token!==active.token)return false
    this.validate(active.job,active.job.from)
    active.until=Date.now()+timeout
    return !mode||this.direction(active.job,mode)
  }
  async control(msg){
    this.expire()
    const policy=this.link.policy
    if(msg.op==='poll'){
      rememberPresence(this.link,msg.presence)
      await policy.merge(msg.master)
      return {job:this.pending,master:policy.value.master,presence:presenceFor(this.link)}
    }
    if(msg.op==='open'){
      const job=msg.job
      if(this.active)throw Error('Busy')
      if(job?.from===this.local&&this.pending?.id!==job.id)throw Error('No local request')
      this.validate(job,job.from===this.local?this.local:this.peer)
      await policy.mergeSelection(msg.selection)
      if(this.completed.has(job.id))return {done:true}
      const a={job,token:randomUUID(),until:Date.now()+timeout}
      this.active=a
      try{
        if(job.kind==='delete'&&job.from!==this.local)await this.hooks.erase(job)
        if(this.direction(job,'send'))await this.hooks.prepare()
        return {token:a.token,selection:policy.preferences()}
      }catch(e){this.active=null;throw e}
    }
    if(msg.op==='finish'){
      const a=this.active
      if(!a||a.token!==msg.token)throw Error('Expired operation')
      try{
        if(msg.error)throw Error(String(msg.error).slice(0,180))
        this.validate(a.job,a.job.from)
        if(this.direction(a.job,'receive'))await this.hooks.apply(a.offered||[])
        this.completed.set(a.job.id,{until:Date.now()+timeout})
        this.link.note='手动操作已完成 / Completed'
        return {done:true}
      }finally{this.active=null;if(this.pending?.id===a.job.id)this.pending=null}
    }
    if(msg.op==='reject'&&this.pending?.id===msg.id){this.pending=null;this.link.note=String(msg.error).slice(0,200);return {}}
    throw Error('Unknown manual operation')
  }
  async poll(rpc,exchange){
    if(this.polling)return
    this.polling=true
    let job,token
    try{
      this.expire()
      const reply=await rpc({op:'poll',master:this.link.policy.value.master,presence:presenceFor(this.link)})
      rememberPresence(this.link,reply.presence)
      await this.link.policy.merge(reply.master)
      job=reply.job||this.pending
      if(!job)return
      if(job.from===this.local&&job.id!==this.pending?.id)throw Error('Unrequested operation')
      this.validate(job,reply.job?this.peer:this.local)
      const open=await rpc({op:'open',job,selection:this.link.policy.preferences()})
      if(!open.done){
        token=open.token
        await this.link.policy.mergeSelection(open.selection)
        if(job.kind==='delete'){
          if(job.from!==this.local)await this.hooks.erase(job)
        }else{
          if(this.direction(job,'send'))await this.hooks.prepare()
          const offered=await exchange(token,this.direction(job,'send'),this.direction(job,'receive'))
          if(this.direction(job,'receive'))await this.hooks.apply(offered||[])
        }
        await rpc({op:'finish',token});token=null
      }
      this.link.note='手动操作已完成 / Completed'
    }catch(e){
      if(job){
        this.link.note=e.message
        if(token)await rpc({op:'finish',token,error:e.message}).catch(()=>{})
        else if(job.from===this.peer)await rpc({op:'reject',id:job.id,error:e.message}).catch(()=>{})
      }
      throw e
    }finally{if(job&&job.id===this.pending?.id)this.pending=null;this.polling=false}
  }
}
