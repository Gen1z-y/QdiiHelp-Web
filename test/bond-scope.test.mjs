import test from 'node:test';
import assert from 'node:assert/strict';
import {supportedBond,requireBond,migrateBondUniverse} from '../site/bond-policy.mjs';
import {syncHoldings,stockHoldingsReport} from '../site/lib/holdings-sync.mjs';
test('bond scope includes domestic bond styles and excludes ambiguous, equity, money and overseas names',()=>{
 for(const name of ['天弘信益债券A','某某中短债A','某某可转债债券A','某某国债指数债券A'])assert.ok(supportedBond({name,bond:true}),name);
 for(const name of ['', '某某货币A','某某全球股票A','某某股债平衡混合A','某某美元债债券(QDII)人民币A','某某海外债券A'])assert.throws(()=>requireBond({name,bond:true}),undefined,name);
 assert.equal(supportedBond({name:'债券A',bond:false}),false);assert.equal(supportedBond(null),false);
});
test('upgrade deactivates nonbond/unknown funds without deleting history or records and is repeatable',()=>{
 const d={watchlist:['007740','012414','000003'],profiles:{'007740':{profile:{name:'天弘信益债券A',bond:true}},'012414':{profile:{name:'白酒指数C',bond:false}}},lastView:{},records:{'012414:2026-10-27':{actual:{value:1}}},fundGroups:{'007740':'watch','012414':'held'}};
 assert.equal(migrateBondUniverse(d),true);assert.deepEqual(d.watchlist,['007740']);assert.deepEqual(Object.keys(d.inactiveFunds),['012414','000003']);assert.equal(d.records['012414:2026-10-27'].actual.value,1);assert.equal(d.fundGroups['012414'],'held');assert.equal(migrateBondUniverse(d),false);
});
test('bond index fund remains eligible for disclosure sync, unlike stock index funds',async()=>{
 const data={watchlist:['000001'],profiles:{'000001':{profile:{name:'国债指数债券A',bond:true}}},lastView:{},records:{}};
 const store={data,save:()=>{}};
 const result=await syncHoldings(store,()=>{},{fetchBondHoldings:async()=>({asOf:'2026-09-30',rows:[{code:'123456',name:'模拟债券',weight:10}]}),fetchHoldings:()=>{throw Error('stock disclosures must not be fetched');}});
 assert.equal(result.items.length,1);assert.equal(result.items[0].status,'updated');assert.equal(stockHoldingsReport(result,data).items.length,1);
});
