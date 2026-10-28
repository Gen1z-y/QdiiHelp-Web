// Run with PLAYWRIGHT_MODULE set to an installed Playwright module directory.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const base=process.env.QDII_WEB_TEST_URL??'http://127.0.0.1:8790/qdiihelp-web/';
if(new URL(base).hostname!=='127.0.0.1'||new URL(base).port==='8787')throw Error('Only isolated loopback test URLs are allowed');
const results=[],errors=[],upstreams=[];
const browser=await chromium.launch({channel:'msedge',headless:true});
const api=(page,url,options={})=>page.evaluate(async({url,options})=>{
 const {browserFetch}=await import(new URL('./browser-client.mjs',location.href));
 const r=await browserFetch(url,options);return {status:r.status,data:await r.json()};
},{url,options});
const record=(name)=>{results.push(name);console.log('PASS '+name);};
const fixtureRows=Array.from({length:160},(_,i)=>({FSRQ:new Date(Date.UTC(2026,9,27-i)).toISOString().slice(0,10),DWJZ:String(1.1-i*.0001),LJJZ:String(1.1-i*.0001),JZZZL:'0.1'}));
async function contextWithMock(){
 const context=await browser.newContext({viewport:{width:1360,height:1000}});
 await context.addInitScript(()=>{localStorage.setItem('qdiihelp-web:v1:/qdiihelp-web/:proxy-url','https://quotes.test');});
 await context.route('https://quotes.test/**',async route=>{
  const source=new URL(new URL(route.request().url()).searchParams.get('url'));upstreams.push(source.href);let body='',type='application/json';
  if(source.pathname.includes('pingzhongdata')){body='var fS_name = "网页版验证全球股票基金A";';type='text/javascript';}
  else if(source.pathname.endsWith('/lsjz')){const size=Number(source.searchParams.get('pageSize')),page=Number(source.searchParams.get('pageIndex'));body=JSON.stringify({TotalCount:fixtureRows.length,Data:{LSJZList:fixtureRows.slice((page-1)*size,page*size)}});}
  else if(source.pathname.includes('FundArchivesDatas')){
   const html="<a title='网页版验证全球股票基金A'>基金</a>截止至：<font>2026-09-30</font><tbody><tr><td>1</td><td><a href='//quote.eastmoney.com/unify/r/116.00700'>00700</a></td><td>测试香港股票</td><td>40%</td></tr></tbody>";
   body='var apidata={content:'+JSON.stringify(html)+'};';type='text/plain';
  }else if(source.hostname==='api.frankfurter.dev'){
   body=JSON.stringify({rates:Object.fromEntries(fixtureRows.map(r=>[r.FSRQ,{USD:.14,HKD:1.1,JPY:21,KRW:190}]))});
  }else if(source.pathname.includes('/qt/stock/kline/get')){
   const secid=source.searchParams.get('secid');body=JSON.stringify({data:{code:secid.split('.')[1],klines:fixtureRows.map((r,i)=>r.FSRQ+','+(100+i*.1)+','+(100+i*.1)+',101,99,10000').reverse()}});
  }else if(source.hostname==='qt.gtimg.cn'){body='';type='text/plain';}
  else {body=JSON.stringify({data:{},Result:[]});}
  await route.fulfill({status:200,body,headers:{'Content-Type':type,'Access-Control-Allow-Origin':'*'}});
 });
 return context;
}
async function ready(page){page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER ERROR',e.message);});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});await page.goto(base);await page.waitForFunction(()=>document.querySelector('#headerActions')?.textContent.includes('浏览器数据'));}
try{
 const a=await contextWithMock(),page=await a.newPage();await ready(page);
 assert.equal((await api(page,'/api/funds?cached=1')).data.items.length,0);record('new browser starts empty');
 const added=await api(page,'/api/funds',{method:'POST',body:JSON.stringify({code:'007740',group:'watch'})});assert.equal(added.status,200);
 const refreshed=await api(page,'/api/funds?date=auto');assert.equal(refreshed.status,200);assert.equal(refreshed.data.items[0].code,'007740');
 await page.waitForFunction(async()=>{const {browserFetch}=await import(new URL('./browser-client.mjs',location.href));return !(await(await browserFetch('/api/runtime')).json()).busy;});record('add fund and refresh via browser engine');
 const sync=await api(page,'/api/holdings/sync',{method:'POST',body:'{}'});assert.equal(sync.status,200);assert.equal(sync.data.items[0].status,'updated');record('holdings sync and recalculation run locally');
 const history=await api(page,'/api/history?codes=007740&format=detail&days=0');assert.equal(history.status,200);assert.equal(history.data.rows.length,160);assert.equal(history.data.historyComplete,true);record('full history uses all pages');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#headerActions')?.textContent.includes('浏览器数据'));
 const persisted=await api(page,'/api/funds?cached=1');assert.equal(persisted.data.items[0].code,'007740');assert.equal((await api(page,'/api/history?codes=007740&format=detail')).data.rows.length,160);record('reload restores funds and full history');
 const second=await a.newPage();await second.goto(base);await second.waitForFunction(()=>document.querySelector('#browserStatus').textContent.includes('另一个标签页'));assert.equal(await second.locator('#addForm button').isDisabled(),true);await second.close();record('same-browser second tab cannot overwrite data');
 const b=await contextWithMock(),other=await b.newPage();await ready(other);assert.equal((await api(other,'/api/funds?cached=1')).data.items.length,0);record('independent browser context has isolated data');
 await page.waitForFunction(async()=>{const {browserFetch}=await import(new URL('./browser-client.mjs',location.href));return !(await(await browserFetch('/api/runtime')).json()).busy;});
 const backup=(await api(page,'/api/browser/export')).data;assert.equal(backup.state.watchlist[0],'007740');assert.equal(backup.histories[0].rows.length,160);
 const malformed=structuredClone(backup);malformed.state.watchlist=['bad'];assert.equal((await api(other,'/api/browser/import',{method:'POST',body:JSON.stringify(malformed)})).status,400);
 assert.equal((await api(other,'/api/browser/import',{method:'POST',body:JSON.stringify(backup)})).status,200);await other.reload();await other.waitForFunction(()=>document.querySelector('#headerActions')?.textContent.includes('浏览器数据'));
 assert.equal((await api(other,'/api/funds?cached=1')).data.items[0].code,'007740');record('backup export, validation, import and recovery');
 const storage=await page.evaluate(async()=>{
  const {BrowserStore,transaction}=await import(new URL('./browser-store.mjs',location.href));
  const store=await BrowserStore.open('qdiihelp-smoke-transaction');store.data.watchlist=['000001'];store.data.fundGroups={'000001':'held'};await store.save();
  const real=store.db.transaction.bind(store.db);store.db.transaction=(...args)=>{const tx=real(...args);if(args[1]==='readwrite')queueMicrotask(()=>tx.abort());return tx;};
  store.data.watchlist=['000002'];let rejected=false;try{await store.save();}catch{rejected=true;}
  store.db.transaction=real;let flushRejected=false;try{await store.flush();}catch{flushRejected=true;}
  await store.save();await store.close();const loaded=await BrowserStore.open('qdiihelp-smoke-transaction');const codes=loaded.data.watchlist;await loaded.close();return {rejected,flushRejected,codes};
 });assert.deepEqual(storage,{rejected:true,flushRejected:true,codes:['000002']});record('aborted IndexedDB commits surface errors and can retry');
 await page.locator('[data-fund-group="watch"]').click();await page.locator('[data-fund-code="007740"]').waitFor();
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));record('mobile layout fits viewport');
 await page.screenshot({path:new URL('../verification-mobile.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
 await page.setViewportSize({width:1360,height:1000});await page.screenshot({path:new URL('../verification-desktop.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
 assert.deepEqual(errors,[]);assert.ok(upstreams.length>0);record('no uncaught browser errors; mock public-data requests only');
 await fs.writeFile(new URL('../verification-browser.json',import.meta.url),JSON.stringify({results,errors,upstreamRequests:upstreams.length,mocked:true},null,2));
 await a.close();await b.close();
}finally{await browser.close();}

