import http from 'node:http'
import fs from 'node:fs/promises'
const port=39580,host='127.0.0.1:'+port
export function startDesktopPanel(ctx,center){
 ctx.effect(()=>{
  const server=http.createServer(async(req,res)=>{
   try{
    if(req.headers.host!==host){res.writeHead(403).end();return}
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff')
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
    if(req.url==='/'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await fs.readFile(new URL('./panel.html',import.meta.url)));return}
    if(req.url!=='/panel'){res.writeHead(404).end();return}
    res.setHeader('Content-Type','application/json')
    if(req.method==='POST'){
     if(req.headers.origin!=='http://'+host||req.headers['content-type']!=='application/json'){res.writeHead(403).end();return}
     let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('Request too large')}
     const {action,args}=JSON.parse(raw);await center.action(action,args||{})
    }else if(req.method!=='GET'){res.writeHead(405).end();return}
    res.end(JSON.stringify(center.state()))
   }catch(e){res.writeHead(400).end(JSON.stringify({error:e.message}))}
  })
  server.on('error',e=>ctx.logger.warn('Sync center: '+e.message));server.listen(port,'127.0.0.1')
  return ()=>server.close()
 })
}
