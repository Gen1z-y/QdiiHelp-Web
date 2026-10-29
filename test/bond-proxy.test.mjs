import test from 'node:test';import assert from 'node:assert/strict';
import {ADAPTIVE_BOND_FACTORS} from '../site/lib/bond-factors.mjs';
import {validateTarget,createHandler} from '../proxy/worker.mjs';
const url=new URL('https://yield.chinabond.com.cn/cbweb-mn/indices/singleIndexQueryResult');
for(const [k,v] of Object.entries({indexid:ADAPTIVE_BOND_FACTORS[0].id,qxlxt:'00',ltcslx:'',zslxt:'CFZS',zslxt1:'CFZS',lx:'1',locale:'zh_CN'}))url.searchParams.set(k,v);
const origin='https://gen1z-y.github.io',env={ALLOWED_ORIGINS:origin,RATE_LIMITER:{limit:async()=>({success:true})}};
test('新版代理只允许8个固定财富因子与报告正文参数',()=>{
 for(const f of ADAPTIVE_BOND_FACTORS){const u=new URL(url);u.searchParams.set('indexid',f.id);assert.ok(validateTarget(u.href));}
 for(const [k,v] of [['indexid','arbitrary'],['zslxt','QJZS'],['qxlxt','06'],['locale','en_US']]){const u=new URL(url);u.searchParams.set(k,v);assert.throws(()=>validateTarget(u.href));}
 const report='https://np-cnotice-fund.eastmoney.com/api/content/ann?client_source=web_fund&show_all=1&art_code=AN202610271830984010';assert.ok(validateTarget(report));assert.throws(()=>validateTarget(report.replace('show_all=1','show_all=0')));assert.throws(()=>validateTarget(report+'&callback=foo'));
});
test('仅固定财富查询转换上游POST，公开接口仍拒绝写入且不转发凭据',async()=>{
 let seen;const handler=createHandler({fetcher:async(u,o)=>{seen=o;return Response.json({CFZS_00:{}});}});
 const request=method=>new Request('https://quotes.example/quote?url='+encodeURIComponent(url),{method,headers:{Origin:origin,Authorization:'private',Cookie:'private=1'}});
 assert.equal((await handler(request('GET'),env)).status,200);assert.equal(seen.method,'POST');assert.equal(seen.body,undefined);assert.equal(seen.headers.Authorization,undefined);assert.equal(seen.headers.Cookie,undefined);
 assert.equal((await handler(request('POST'),env)).status,405);
});
