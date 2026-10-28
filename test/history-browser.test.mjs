import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchHistory,configureHistoryStorage,buildComparison} from '../site/lib/history.mjs';
test('browser history downloads all pages, reuses current data and preserves old data on failure',async()=>{
 const saved=new Map(),calls=[];configureHistoryStorage({read:c=>saved.get(c),load:async c=>saved.get(c),write:async(c,d)=>saved.set(c,d)});
 const rows=Array.from({length:45},(_,i)=>({FSRQ:new Date(Date.UTC(2026,9,27-i)).toISOString().slice(0,10),DWJZ:String(1+i/1000),LJJZ:String(1+i/1000),JZZZL:'0.1'}));
 const fetcher=async url=>{const u=new URL(url),page=Number(u.searchParams.get('pageIndex'));calls.push(page);return Response.json({TotalCount:rows.length,Data:{LSJZList:rows.slice((page-1)*20,page*20)}});};
 const complete=await fetchHistory('007740','browser',{fetcher});assert.deepEqual(calls,[1,2,3]);assert.equal(complete.rows.length,45);assert.equal(complete.historyComplete,true);
 const noFetch=()=>{throw Error('offline');};const cached=await fetchHistory('007740','browser',{fetcher:noFetch,latestDate:rows[0].FSRQ});assert.equal(cached.rows.length,45);
 const failed=await fetchHistory('007740','browser',{force:true,fetcher:noFetch});assert.equal(failed.stale,true);assert.equal(saved.get('007740').stale,false);assert.equal(saved.get('007740').rows.length,45);
});
test('partial history never replaces a valid cached complete series',async()=>{
 const old={schema:2,code:'007740',historyComplete:true,rows:[{date:'2026-10-27',value:1,dailyReturn:0}],fetchedAt:'2020-01-01'},map=new Map([['007740',old]]);
 configureHistoryStorage({read:c=>map.get(c),load:async c=>map.get(c),write:async(c,d)=>map.set(c,d)});
 const result=await fetchHistory('007740','browser',{force:true,fetcher:async()=>Response.json({TotalCount:50,Data:{LSJZList:[{FSRQ:'2026-10-27',DWJZ:'1',JZZZL:'0'}]}})});
 assert.equal(result.stale,true);assert.match(result.error,/重复分页/);assert.equal(map.get('007740'),old);
});
