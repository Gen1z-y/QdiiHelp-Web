export const baseUrl=new URL('./',import.meta.url);
export const namespace='qdiihelp-web:v1:'+baseUrl.pathname;
export const preferences={getItem:key=>localStorage.getItem(namespace+':'+key),setItem:(key,value)=>localStorage.setItem(namespace+':'+key,value)};
let worker,sequence=0,readyResolve,readyReject;
const pending=new Map();
let ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});ready.catch(()=>{});
function fail(error){readyReject(error);for(const entry of pending.values())entry.fail(error);pending.clear();}
export async function initialize(proxyUrl){
 if(!navigator.locks)throw Error('此浏览器不支持数据写入保护，请使用新版 Chrome、Edge、Firefox 或 Safari');
 await new Promise((resolve,reject)=>{
  navigator.locks.request(namespace,{ifAvailable:true},async lock=>{
   if(!lock){reject(Error('此浏览器已有本项目页面正在使用数据，请关闭另一个标签页后刷新'));return;}
   resolve();await new Promise(()=>{});
  }).catch(reject);
 });
 worker=new Worker(new URL('./browser-worker.mjs',import.meta.url),{type:'module'});
 worker.onerror=event=>fail(Error('浏览器计算线程异常：'+event.message));
 worker.onmessage=({data:m})=>{
  if(m.type==='ready'){readyResolve();return;}
  if(m.type==='fatal'){fail(Error(m.error));return;}
  const entry=pending.get(m.id);if(!entry)return;
  if(m.type==='error'){entry.fail(Error(m.error));entry.cleanup();return;}
  if(m.type==='configured'){entry.resolve();entry.cleanup();return;}
  if(m.type==='headers')entry.headers(m);
  else if(m.type==='chunk')entry.chunk(m.chunk);
  else if(m.type==='end'){entry.end();entry.cleanup();}
 };
 worker.postMessage({type:'init',namespace,proxyUrl});return ready;
}
export async function browserFetch(url,options={}){
 await ready;if(options.signal?.aborted)throw options.signal.reason;
 return new Promise((resolve,reject)=>{
  const id=++sequence;let controller,hasHeaders=false,closed=false;
  const cleanup=()=>{pending.delete(id);options.signal?.removeEventListener('abort',abort);};
  const abort=()=>{entry.fail(options.signal.reason??new DOMException('请求取消','AbortError'));cleanup();};
  const entry={resolve,cleanup,headers(m){hasHeaders=true;const stream=new ReadableStream({start(c){controller=c;},cancel(){closed=true;cleanup();}});resolve(new Response(stream,{status:m.status,headers:m.headers}));},chunk(value){if(!closed)controller?.enqueue(new TextEncoder().encode(value));},end(){if(!closed){closed=true;if(hasHeaders)controller?.close();else reject(Error('浏览器接口未返回响应'));}},fail(error){if(closed)return;closed=true;if(hasHeaders)controller?.error(error);else reject(error);}};
  pending.set(id,entry);options.signal?.addEventListener('abort',abort,{once:true});
  worker.postMessage({type:'request',id,url,options:{method:options.method,body:options.body}});
 });
}
