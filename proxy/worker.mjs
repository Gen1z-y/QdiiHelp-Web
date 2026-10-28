// Public market data only. No business state, databases, cookies or user backups.
const routes={
 'api.fund.eastmoney.com':[/^\/f10\/(lsjz|JJGG)$/,['fundCode','fundcode','pageIndex','pageSize','type']],
 'fundf10.eastmoney.com':[/^\/(FundArchivesDatas\.aspx|jjgg_\d{6}_3\.html)$/,['type','code','topline','year','month']],
 'fund.eastmoney.com':[/^\/pingzhongdata\/\d{6}\.js$/,[]],
 'searchapi.eastmoney.com':[/^\/api\/suggest\/get$/,['input','type','count']],
 'push2his.eastmoney.com':[/^\/api\/qt\/stock\/kline\/get$/,['secid','klt','fqt','lmt','end','fields1','fields2']],
 'push2.eastmoney.com':[/^\/api\/qt\/stock\/get$/,['secid','fields']],
 'web.ifzq.gtimg.cn':[/^\/appstock\/app\/(usfqkline|hkfqkline|fqkline|kline)\/get$/,['param']],
 'qt.gtimg.cn':[/^\/q=[a-zA-Z0-9_,.]+$/,[]],
 'hq.sinajs.cn':[/^\/list=[a-zA-Z0-9_,.]+$/,[]],
 'quotes.sina.cn':[/^\/cn\/api\/json_v2.php\/CN_MarketDataService.getKLineData$/,['symbol','scale','ma','datalen']],
 'fchart.stock.naver.com':[/^\/sise.nhn$/,['symbol','timeframe','count','requestType']],
 'api.frankfurter.dev':[/^\/v1\/\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/,['base','symbols']],
 'finance.pae.baidu.com':[/^\/vapi\/index\/overview$/,[]]
};
export function validateTarget(raw){
 if(typeof raw!=='string'||raw.length>3500)throw Error('数据源地址无效');
 const url=new URL(raw),rule=routes[url.hostname];
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!rule||!rule[0].test(url.pathname))throw Error('不允许的数据源地址');
 const seen=new Set();
 for(const [key,value] of url.searchParams){
  if(seen.has(key)||!rule[1].includes(key)||value.length>1200||!/^[a-zA-Z0-9_.,:-]*$/.test(value))throw Error('不允许的查询参数');seen.add(key);
  if(['pageIndex','pageSize','topline','count','lmt','datalen'].includes(key)&&(!/^\d+$/.test(value)||Number(value)<1||Number(value)>(key==='pageIndex'?2000:key==='topline'?1000:key==='pageSize'?200:500)))throw Error('查询范围超限');
  if(['fundCode','fundcode','code'].includes(key)&&!/^\d{6}$/.test(value))throw Error('基金代码无效');
 }
 return url;
}
const MAX_BYTES=2*1024*1024;
async function readBounded(response){
 if(Number(response.headers.get('Content-Length'))>MAX_BYTES)throw Error('数据源响应过大');
 const reader=response.body?.getReader();if(!reader)return new Uint8Array();
 let size=0;const chunks=[];
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();throw Error('数据源响应过大');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export function createHandler({fetcher=fetch,cache=null}={}){return async(request,env,ctx)=>{
 const origin=request.headers.get('Origin'),allowed=String(env.ALLOWED_ORIGINS??'').split(',').map(s=>s.trim()).filter(Boolean);
 const headers={'Vary':'Origin','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
 const result=(data,status=200)=>Response.json(data,{status,headers});
 if(!origin||!allowed.includes(origin))return result({error:'不允许的页面来源'},403);
 headers['Access-Control-Allow-Origin']=origin;
 if(request.method==='OPTIONS'){
  if(request.headers.get('Access-Control-Request-Method')!=='GET'||request.headers.get('Access-Control-Request-Headers'))return result({error:'不允许的跨域请求'},403);
  return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET','Access-Control-Max-Age':'600'}});
 }
 if(request.method!=='GET')return result({error:'只允许读取公开行情'},405);
 const url=new URL(request.url);
 if(url.pathname==='/health')return result({ok:true,app:'qdiihelp-public-quotes'});
 if(url.pathname!=='/quote'||[...url.searchParams.keys()].some(k=>k!=='url')||url.searchParams.getAll('url').length!==1)return result({error:'接口不存在'},404);
 let target;try{target=validateTarget(url.searchParams.get('url'));}catch(error){return result({error:error.message},400);}
 if(!env.RATE_LIMITER)return result({error:'行情服务尚未配置请求限额'},503);
 const {success}=await env.RATE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')??'unknown'});
 if(!success)return new Response(JSON.stringify({error:'请求较多，请一分钟后重试'}),{status:429,headers:{...headers,'Content-Type':'application/json','Retry-After':'60'}});
 const cacheKey=new Request(new URL('/cached?url='+encodeURIComponent(target.href),url.origin));
 try{
  const hit=await cache?.match(cacheKey);
  if(hit)return new Response(hit.body,{status:200,headers:{...headers,'Content-Type':hit.headers.get('Content-Type')??'application/octet-stream'}});
  const referer=target.hostname==='hq.sinajs.cn'?'https://finance.sina.com.cn/':target.hostname.endsWith('gtimg.cn')?'https://gu.qq.com/':'https://fundf10.eastmoney.com/';
  const response=await fetcher(target.href,{method:'GET',headers:{'User-Agent':'Mozilla/5.0 QdiiHelp-Web/1.0','Referer':referer,'Accept':'*/*'},redirect:'manual',signal:AbortSignal.timeout(18000)});
  if(!response.ok){await response.body?.cancel();return result({error:'公开数据源返回 HTTP '+response.status},502);}
  const bytes=await readBounded(response),type=response.headers.get('Content-Type')??'application/octet-stream';
  if(cache)ctx.waitUntil(cache.put(cacheKey,new Response(bytes,{headers:{'Content-Type':type,'Cache-Control':'public,max-age=60'}})));
  return new Response(bytes,{headers:{...headers,'Content-Type':type}});
 }catch(error){return result({error:'公开数据源暂不可用：'+error.message},502);}
};}
export default {fetch(request,env,ctx){return createHandler({cache:caches.default})(request,env,ctx);}};
