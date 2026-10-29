// Browser integration checks; open /_verify/ using the isolated preview-smoke server.
import {BrowserStore,transaction} from '../site/browser-store.mjs';
const output=document.querySelector('#result'),results=[];
const assert=(v,message)=>{if(!v)throw Error(message);};
const pass=message=>{results.push('PASS '+message);output.textContent=results.join('\n');};
try{
 const namespace='qdiihelp-bond-verification-'+crypto.randomUUID();
 const seed=await BrowserStore.open(namespace);seed.data.watchlist=['007740','012414','000003'];seed.data.profiles={'007740':{profile:{name:'模拟信益债券A',bond:true}},'012414':{profile:{name:'模拟白酒指数股票C',bond:false}}};seed.data.records={'012414:2026-10-27':{actual:{value:1}}};await seed.save();await seed.close();
 globalThis.QDII_NAMESPACE=namespace;
 const nativeFetch=globalThis.fetch.bind(globalThis);
 globalThis.fetch=(url,options={})=>new URL(String(url),location.href).protocol==='https:'?nativeFetch('/quote?url='+encodeURIComponent(url),{signal:options.signal}):nativeFetch(url,options);
 const engine=await import('../site/engine.mjs');
 async function api(url,options={}){let status=0,body='';await engine.handleRequest({url,method:options.method??'GET',async *[Symbol.asyncIterator](){if(options.body)yield JSON.stringify(options.body);}},{writeHead(s){status=s;},write(s){body+=s;},end(s){if(s)body+=s;}});return {status,data:JSON.parse(body)};}
 assert((await api('/api/runtime')).data.inactiveFundCount===2,'old unsupported codes not deactivated');pass('旧非债基与未知类型停用');
 let result=await api('/api/funds',{method:'POST',body:{code:'012414',group:'watch'}});assert(result.status===400,'stock fund accepted');assert((await api('/api/fund-profile?code=012414')).status===400,'stock preview accepted');pass('添加与名称查询拒绝非债基');
 for(const code of ['007740','005677'])assert((await api('/api/funds',{method:'POST',body:{code,group:'watch'}})).status===200,'bond add failed');pass('普通债基和债券指数基金可添加');
 result=await api('/api/funds?date=auto');assert(result.status===200&&result.data.items.length===2&&result.data.items.every(x=>x.bond),'bond refresh failed');pass('债基刷新保留两只债基');
 result=await api('/api/holdings/sync',{method:'POST',body:{}});assert(result.status===200&&result.data.items.length===2&&result.data.items.every(x=>x.count===5&&x.status==='updated'),'bond holdings failed');pass('两只债基披露持仓同步');
 result=await api('/api/history?codes=007740&format=detail&days=0');assert(result.status===200&&result.data.rows.length===160&&result.data.historyComplete,'full history incomplete');pass('160条完整净值历史');
 result=await api('/api/history?codes=007740,005677&days=90');assert(result.status===200,'comparison failed');pass('基金对比数据正常');
 assert((await api('/api/history?codes=012414')).status===400,'inactive history fetched');
 for(const [url,method] of [['/api/global-markets','GET'],['/api/export-data','GET'],['/api/export-indices','POST'],['/api/browser/export','GET'],['/api/browser/import','POST']])assert((await api(url,{method,body:method==='POST'?{}:undefined})).status===404,'obsolete API remains: '+url);pass('非债历史受限；指数、图片、备份接口已删除');
 const persisted=await BrowserStore.open(namespace);assert(persisted.data.records['012414:2026-10-27'].actual.value===1,'legacy data deleted');assert(persisted.data.watchlist.join(',')==='007740,005677','stored active list invalid');assert((await persisted.readHistory('007740')).rows.length===160,'history not persisted');pass('重读保留债基列表、完整历史及旧非债原始记录');
 const independent=await BrowserStore.open(namespace+'-other');assert(independent.data.watchlist.length===0,'separate namespace leaked');await independent.close();pass('独立存储空间初始为空');
 const txStore=await BrowserStore.open(namespace+'-transaction'),real=txStore.db.transaction.bind(txStore.db);txStore.db.transaction=(...args)=>{const tx=real(...args);if(args[1]==='readwrite')queueMicrotask(()=>tx.abort());return tx;};let rejected=false;try{await txStore.save();}catch{rejected=true;}assert(rejected,'aborted transaction accepted');txStore.db.transaction=real;await txStore.save();await txStore.close();pass('存储事务失败可见且可重试');
 const app=await BrowserStore.open('qdiihelp-web:v1:/qdiihelp-web/');app.data=structuredClone(persisted.data);await app.save();for(const code of ['007740','005677'])await app.saveHistory(code,await persisted.readHistory(code));await app.close();await persisted.close();
 const calls=await(await nativeFetch('/_requests')).json();assert(!calls.some(u=>u.includes('frankfurter')||u.includes('naver')||u.includes('baidu')||u.includes('code=012414')||u.includes('fundCode=012414')),'unnecessary source requested');pass('无全球指数、汇率或非债基净值请求');
 output.textContent+='\n\n全部 '+results.length+' 组检查通过（模拟行情）；可打开 /qdiihelp-web/ 验证界面。';document.title='PASS 债基网页版验证';
}catch(e){output.textContent+='\nFAIL '+e.stack;document.title='FAIL 债基网页版验证';}
