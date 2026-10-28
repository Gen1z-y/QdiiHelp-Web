const nativeFetch=globalThis.fetch.bind(globalThis);
let engine,proxyUrl='',initializing=false,importing=false,requests=new Set();
function validateProxy(value){if(!value)return '';const u=new URL(value);if(u.protocol!=='https:'&&!(['127.0.0.1','localhost'].includes(u.hostname)&&u.protocol==='http:'))throw Error('行情服务必须使用 HTTPS');if(u.username||u.password||u.search||u.hash)throw Error('行情服务地址不能包含密码、查询参数或锚点');return u.href.replace(/\/$/,'');}
globalThis.fetch=(input,options={})=>{
 const target=new URL(String(input));
 if(target.protocol!=='https:')return Promise.reject(Error('数据源必须使用 HTTPS'));
 if(!proxyUrl)return Promise.reject(Error('尚未配置行情服务，请打开“浏览器数据”设置服务地址'));
 return nativeFetch(proxyUrl+'/quote?url='+encodeURIComponent(target.href),{method:'GET',signal:options.signal,credentials:'omit',redirect:'error'});
};
async function serve(message){
 const {id,url,options={}}=message;let ended=false;
 const send=data=>postMessage({id,...data});
 const req={url,method:options.method??'GET',headers:{},async *[Symbol.asyncIterator](){if(options.body)yield options.body;}};
 const res={destroyed:false,writeHead(status,headers){send({type:'headers',status,headers});},write(chunk){send({type:'chunk',chunk});},end(chunk){if(ended)return;if(chunk)this.write(chunk);ended=true;send({type:'end'});}};
 try{
  if(!url.startsWith('/api/'))throw Error('只支持本机浏览器业务接口');
  if(importing)throw Error('正在导入数据，请稍后重试');
  if(url.startsWith('/api/browser/import')){if(requests.size>1)throw Error('其他操作仍在进行，请稍后再导入');importing=true;}
  await engine.handleRequest(req,res);
 }catch(error){send({type:'error',error:error.message});}finally{if(url.startsWith('/api/browser/import'))importing=false;if(!ended)res.end();}
}
onmessage=async({data:message})=>{
 if(message.type==='init'){
  if(initializing)return;initializing=true;
  try{globalThis.QDII_NAMESPACE=message.namespace;proxyUrl=validateProxy(message.proxyUrl);engine=await import('./engine.mjs');postMessage({type:'ready'});}catch(error){postMessage({type:'fatal',error:error.message});}
  return;
 }
 if(message.type==='configure'){
  try{proxyUrl=validateProxy(message.proxyUrl);postMessage({type:'configured',id:message.id});}catch(error){postMessage({type:'error',id:message.id,error:error.message});}return;
 }
 if(!engine){postMessage({id:message.id,type:'error',error:'浏览器数据尚未准备好'});return;}
 const task=Promise.resolve().then(()=>serve(message));requests.add(task);try{await task;}finally{requests.delete(task);}
};
