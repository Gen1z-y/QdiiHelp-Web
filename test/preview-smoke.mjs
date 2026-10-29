import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),port=Number(process.env.QDII_PREVIEW_PORT??8790);
if(port===8787||port<1024)throw Error('Only isolated preview ports are allowed');
const requests=[];
const rows=Array.from({length:160},(_,i)=>({FSRQ:new Date(Date.UTC(2026,9,28-i)).toISOString().slice(0,10),DWJZ:String(1.1-i*.0001),LJJZ:String(1.1-i*.0001),JZZZL:'0.1'}));
const names={'007740':'模拟信益债券A','005677':'模拟国债指数债券A','012414':'模拟白酒指数股票C'};
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1:'+port);res.setHeader('Cache-Control','no-store');
 if(u.pathname==='/quote'){
  const q=new URL(u.searchParams.get('url'));requests.push(q.href);let body='',type='application/json';
  if(q.pathname.includes('pingzhongdata')){const code=q.pathname.match(/(\d{6})\.js/)[1];body='var fS_name = '+JSON.stringify(names[code]??'类型未知基金A')+';';type='text/javascript';}
  else if(q.pathname.endsWith('/lsjz')){const size=Number(q.searchParams.get('pageSize')),page=Number(q.searchParams.get('pageIndex'));body=JSON.stringify({TotalCount:rows.length,Data:{LSJZList:rows.slice((page-1)*size,page*size)}});}
  else if(q.pathname.includes('FundArchivesDatas')){if(q.searchParams.get('type')!=='zqcc')throw Error('Unexpected stock holdings request');const html="截止至：<font>2026-09-30</font><tbody>"+Array.from({length:5},(_,i)=>`<tr><td>${i+1}</td><td>12345${i}</td><td>模拟债券${i+1}</td><td>${10-i}%</td></tr>`).join('')+'</tbody>';body='var apidata={content:'+JSON.stringify(html)+'};';type='text/plain';}
  else if(q.hostname==='qt.gtimg.cn'){body='';type='text/plain';}
  else if(q.hostname==='web.ifzq.gtimg.cn'){const key=q.searchParams.get('param').split(',')[0];body=JSON.stringify({data:{[key]:{day:rows.map((r,i)=>[r.FSRQ,'100',String(100+i*.01),101,99,100]).reverse()}}});}
  else if(q.pathname.includes('JJGG')){body=JSON.stringify({Data:[],TotalCount:0});}
  else if(q.pathname.includes('jjgg_')){body='<html></html>';type='text/html';}
  else {res.writeHead(500);res.end('Unexpected mock source: '+q.href);return;}
  res.writeHead(200,{'Content-Type':type,'Access-Control-Allow-Origin':'*'});res.end(body);return;
 }
 if(u.pathname==='/_requests'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(requests));return;}
 if(u.pathname==='/_verify/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>债基网页版独立验证（模拟数据）</h1><pre id="result">运行中…</pre><script type="module" src="/test/browser-smoke.mjs"></script>');return;}
 if(u.pathname.endsWith('/deploy-config.json')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({proxyUrl:'http://127.0.0.1:'+port}));return;}
 const relative=(u.pathname.startsWith('/test/')||u.pathname.startsWith('/site/'))?u.pathname:'/site'+u.pathname.replace(/^\/qdiihelp-web(?=\/)/,'');
 const target=path.resolve(root,'.'+(relative.endsWith('/')?relative+'index.html':relative));if(!target.startsWith(root+path.sep)||!['GET','HEAD'].includes(req.method))throw Error('Invalid path');
 let body=await fs.readFile(target);const ext=path.extname(target);if(ext==='.html')body=Buffer.from(body.toString().replace('<head>','<head><script>localStorage.setItem("qdiihelp-web:v1:/qdiihelp-web/:proxy-url","https://obsolete.invalid");</script>'));
 res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'})[ext]??'application/octet-stream'});res.end(body);
}catch(e){res.writeHead(404);res.end(e.message);}});
server.listen(port,'127.0.0.1',()=>console.log('Mock-only verification: http://127.0.0.1:'+port+'/_verify/ and /qdiihelp-web/'));
