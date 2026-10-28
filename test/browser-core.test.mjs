import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash as nodeHash} from 'node:crypto';
import {sha256,createHash} from '../site/browser-crypto.mjs';
import {validateState,validateBackup} from '../site/browser-store.mjs';
import {isDeepStrictEqual} from '../site/browser-util.mjs';
import {createHandler,validateTarget} from '../proxy/worker.mjs';
const origin='https://gen1z-y.github.io',target='https://api.fund.eastmoney.com/f10/lsjz?fundCode=007740&pageIndex=1&pageSize=120';
const env={ALLOWED_ORIGINS:origin,RATE_LIMITER:{limit:async()=>({success:true})}};
const request=(url=target,options={})=>new Request('https://quotes.example/quote?url='+encodeURIComponent(url),{headers:{Origin:origin},...options});
const state=()=>({version:1,watchlist:['007740'],fundGroups:{'007740':'watch'},records:{},lastView:{}});
test('SHA-256 matches Node for empty, unicode, multi-block and long input',()=>{
 for(const value of ['', 'abc','净值观察台😀','a'.repeat(55),'b'.repeat(56),'c'.repeat(64),'d'.repeat(100000)])assert.equal(sha256(value),nodeHash('sha256').update(value).digest('hex'));
 assert.equal(createHash('sha256').update('a').update('bc').digest('hex'),sha256('abc'));
});
test('validates browser backups and rejects unsafe/unsupported state',()=>{
 assert.equal(validateState(state()).watchlist[0],'007740');
 assert.throws(()=>validateState({...state(),watchlist:['007740','007740']}));
 assert.throws(()=>validateState(JSON.parse('{"version":1,"watchlist":[],"fundGroups":{},"records":{"__proto__":{}},"lastView":{}}')));
 assert.throws(()=>validateState({...state(),archives:{x:{$archive:'abc'}}}));
 const backup={format:'qdiihelp-browser',schema:1,state:state(),histories:[]};assert.equal(validateBackup(backup),backup);
 assert.throws(()=>validateBackup({...backup,schema:2}));assert.throws(()=>validateBackup({...backup,histories:[{code:'007740',schema:2,rows:[{date:'bad',value:1}]}]}));
});
test('summary comparator preserves NaN, undefined and object semantics',()=>{assert.ok(isDeepStrictEqual({a:NaN,b:[undefined]},{b:[undefined],a:NaN}));assert.ok(!isDeepStrictEqual({a:undefined},{}));assert.ok(!isDeepStrictEqual([1],{0:1}));});
test('proxy validates every supported family and rejects arbitrary hosts and paths',()=>{
 assert.equal(validateTarget(target).hostname,'api.fund.eastmoney.com');
 for(const u of ['http://api.fund.eastmoney.com/f10/lsjz','https://localhost/f10/lsjz','https://127.0.0.1/','https://api.fund.eastmoney.com.evil/f10/lsjz','https://api.fund.eastmoney.com/secret','https://user:pass@api.fund.eastmoney.com/f10/lsjz',target+'&callback=evil',target+'&pageSize=1',target.replace('pageSize=120','pageSize=99999')])assert.throws(()=>validateTarget(u),u);
 for(const u of ['https://fund.eastmoney.com/pingzhongdata/007740.js','https://qt.gtimg.cn/q=jj007740','https://web.ifzq.gtimg.cn/appstock/app/usfqkline/get?param=usSPX,day,,,96,qfq','https://hq.sinajs.cn/list=int_dji,int_nasdaq','https://api.frankfurter.dev/v1/2026-10-01..2026-10-28?base=CNY&symbols=USD,HKD,JPY,KRW'])assert.ok(validateTarget(u));
});
test('proxy rejects disallowed origins, writes, missing limit binding and excessive requests',async()=>{
 const h=createHandler({fetcher:()=>{throw Error('must not fetch');}});
 assert.equal((await h(request(target,{headers:{Origin:'https://evil.example'}}),env)).status,403);
 assert.equal((await h(request(target,{method:'POST'}),env)).status,405);
 assert.equal((await h(request(),{ALLOWED_ORIGINS:origin})).status,503);
 assert.equal((await h(request(),{...env,RATE_LIMITER:{limit:async()=>({success:false})}})).status,429);
});
test('proxy supplies only controlled upstream headers and never forwards cookies',async()=>{
 let seen;const h=createHandler({fetcher:async(u,options)=>{seen=options;return new Response('行情',{headers:{'Set-Cookie':'secret=yes','Content-Type':'text/plain;charset=utf-8'}});}});
 const r=await h(request(target,{headers:{Origin:origin,Cookie:'private=1',Authorization:'secret'}}),env);
 assert.equal(await r.text(),'行情');assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(r.headers.get('Set-Cookie'),null);
 assert.equal(seen.headers.Cookie,undefined);assert.equal(seen.headers.Authorization,undefined);assert.equal(seen.redirect,'manual');
});
test('proxy refuses upstream redirects and oversized responses',async()=>{
 for(const upstream of [new Response(null,{status:302,headers:{Location:'http://127.0.0.1/'}}),new Response('x',{headers:{'Content-Length':String(3*1024*1024)}})]){
  const r=await createHandler({fetcher:async()=>upstream})(request(),env);assert.equal(r.status,502);
 }
});
test('proxy serves public cache with current caller CORS header',async()=>{
 const r=await createHandler({cache:{match:async()=>new Response('cached',{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'https://other.example'}})},fetcher:()=>{throw Error('should use cache');}})(request(),env);
 assert.equal(await r.text(),'cached');assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);
});
