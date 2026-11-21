import dgram from 'node:dgram'
import os from 'node:os'
import {createHmac,randomBytes} from 'node:crypto'
const tag=(key,msg)=>createHmac('sha256',Buffer.from(key,'hex')).update(msg).digest('hex')
export function lanIP(ip){return /^(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.)/.test(ip)}
export function advertise(server,cfg){
  const s=dgram.createSocket('udp4')
  s.on('error',()=>{try{s.close()}catch{}})
  s.on('message',(buf,src)=>{
    if(!lanIP(src.address)||buf.length>160)return
    const [nonce,proof]=buf.toString().split(' ')
    if(!/^[a-f0-9]{32}$/.test(nonce)||proof!==tag(cfg.key,'find:'+nonce))return
    s.send(tag(cfg.key,'here:'+nonce),src.port,src.address)
  })
  s.bind((cfg.port||39463)+1,cfg.bind)
  server.once('close',()=>{try{s.close()}catch{}})
}
export function discover(cfg){
  return new Promise((resolve,reject)=>{
    const s=dgram.createSocket('udp4'),nonce=randomBytes(16).toString('hex')
    const end=(err,ip)=>{clearTimeout(timer);try{s.close()}catch{};err?reject(err):resolve(ip)}
    const timer=setTimeout(()=>end(Error('Paired phone not found on this Wi-Fi')),2500)
    s.once('error',e=>end(e))
    s.on('message',(data,src)=>{if(lanIP(src.address)&&data.toString()===tag(cfg.key,'here:'+nonce))end(null,src.address)})
    s.bind(0,()=>{
      s.setBroadcast(true)
      const targets=new Set(['255.255.255.255'])
      for(const item of Object.values(os.networkInterfaces()).flat()){
        if(item.family!=='IPv4'||item.internal||!lanIP(item.address))continue
        const mask=item.netmask.split('.'),broadcast=item.address.split('.').map((x,i)=>Number(x)|(255-Number(mask[i]))).join('.')
        targets.add(broadcast)
      }
      for(const ip of targets)s.send(nonce+' '+tag(cfg.key,'find:'+nonce),(cfg.port||39463)+1,ip)
    })
  })
}
