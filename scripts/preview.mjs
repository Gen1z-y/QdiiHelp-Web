import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import './policy-version.mjs';
const root=path.resolve(fileURLToPath(new URL('../site',import.meta.url))),port=Number(process.env.QDII_PREVIEW_PORT??8790);
if(!Number.isInteger(port)||port<1024||port>65535||port===8787)throw Error('预览端口必须避开8787');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
export const server=http.createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://localhost'),relative=decodeURIComponent(url.pathname).replace(/^\/qdiihelp-web(?=\/)/,'');
  const target=path.resolve(root,'.'+(relative.endsWith('/')?relative+'index.html':relative));
  if(!target.startsWith(root+path.sep)||!['GET','HEAD'].includes(req.method)){res.writeHead(403);res.end();return;}
  const bytes=await fs.readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]??'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?null:bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log('网页版静态预览：http://127.0.0.1:'+port+'/qdiihelp-web/（默认空数据，行情需配置服务）'));
