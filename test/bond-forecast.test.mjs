import test from 'node:test';
import assert from 'node:assert/strict';

import {bondFitForecast,BOND_MODEL} from '../site/lib/bond-forecast.mjs';
import {forecastIssue} from '../site/lib/forecast-policy.mjs';
import {replayForecast} from '../site/lib/replay-audit.mjs';

const goodFactors=()=>[
 {symbol:'000012',name:'上证国债指数',date:'2026-10-13',dayReturn:0.001,carried:false},
 {symbol:'000013',name:'上证企债指数',date:'2026-10-13',dayReturn:0.0012,carried:false},
 {symbol:'000832',name:'中证转债指数',date:'2026-10-13',dayReturn:0.005,carried:false}];
const goodRef=()=>({return:0.002,r2:0.9,samples:80,indexDate:'2026-10-13',carried:false,coeffs:[0,2,0,0],factors:goodFactors()});
const base={date:'2026-10-12',value:1.05};

test('盘中、休市、基准与指数异常时都不生成债基正式预估',async()=>{
 const preOpen=await bondFitForecast('2026-10-13',{base,reference:async()=>{throw Error('开盘前不应拟合');},now:new Date('2026-10-13T09:29:00+08:00')});
 assert.equal(preOpen.candidate,null);assert.match(preOpen.unavailable,/国内市场未开盘/);assert.doesNotMatch(preOpen.unavailable,/盘中/);
 const intraday=await bondFitForecast('2026-10-13',{base,reference:async()=>goodRef(),now:new Date('2026-10-13T14:00:00+08:00')});
 assert.equal(intraday.candidate,null);assert.match(intraday.unavailable,/盘中数值仅供参考/);
 const weekend=await bondFitForecast('2026-10-10',{base,reference:async()=>goodRef(),now:new Date('2026-10-10T16:30:00+08:00')});
 assert.equal(weekend.candidate,null);assert.match(weekend.unavailable,/国内休市/);
 const multiDay=await bondFitForecast('2026-10-13',{base:{date:'2026-10-09',value:1.05},reference:async()=>goodRef(),now:new Date('2026-10-13T16:30:00+08:00')});
 assert.equal(multiDay.candidate,null);assert.match(multiDay.unavailable,/跨多日/);
 const provisional=await bondFitForecast('2026-10-13',{base:{date:'2026-10-12',value:1.05,provisional:true},reference:async()=>goodRef(),now:new Date('2026-10-13T16:30:00+08:00')});
 assert.equal(provisional.candidate,null);assert.match(provisional.unavailable,/正式净值基准/);
 const carried=await bondFitForecast('2026-10-13',{base,reference:async()=>({...goodRef(),carried:true,indexDate:'2026-10-12'}),now:new Date('2026-10-13T16:30:00+08:00')});
 assert.equal(carried.candidate,null);assert.match(carried.unavailable,/国债指数收盘行情/);
 const unfit=await bondFitForecast('2026-10-13',{base,reference:async()=>({return:null,unavailable:'拟合样本不足（3/60）',samples:3}),now:new Date('2026-10-13T16:30:00+08:00')});
 assert.equal(unfit.candidate,null);assert.match(unfit.unavailable,/样本不足/);
});

test('收盘确认后生成可校验、可回放的 bond-fit-v1 候选',async()=>{
 const {candidate}=await bondFitForecast('2026-10-13',{base,reference:async()=>goodRef(),now:new Date('2026-10-13T16:30:00+08:00')});
 assert.equal(candidate.model.method,BOND_MODEL);
 assert.ok(Math.abs(candidate.model.return-0.002)<1e-12);
 assert.equal(candidate.model.dailyReturn,candidate.model.return);
 assert.ok(Math.abs(candidate.model.value-1.05*1.002)<1e-12);
 assert.deepEqual(candidate.base,{date:'2026-10-12',value:1.05});
 assert.equal(candidate.fit.factors.length,3);
 assert.equal(candidate.fit.factors[0].date,'2026-10-13');
 assert.equal(forecastIssue(candidate,'测试增强债券基金A'),null);
 const replayed=replayForecast(candidate);
 assert.ok(Math.abs(replayed.return-candidate.model.return)<1e-12);
 assert.ok(Math.abs(replayed.value-candidate.model.value)<1e-12);
});

test('forecastIssue 拒绝被篡改或未收盘生成的债基预估',()=>{
 const valid=()=>({date:'2026-10-13',base:{date:'2026-10-12',value:1.05},model:{return:0.002,dailyReturn:0.002,value:1.05*1.002,method:'bond-fit-v1'},fit:{coeffs:[0,2,0,0],factors:goodFactors(),samples:80,r2:0.9},calculatedAt:'2026-10-13T16:30:00+08:00'});
 assert.equal(forecastIssue(valid()),null);
 const ret=valid();ret.model.return=0.003;assert.match(forecastIssue(ret),/债基拟合预估无效/);
 const early=valid();early.calculatedAt='2026-10-13T14:00:00+08:00';assert.match(forecastIssue(early),/收盘确认/);
 const weak=valid();weak.fit.r2=0.1;assert.match(forecastIssue(weak),/拟合输入不完整/);
 const few=valid();few.fit.samples=30;assert.match(forecastIssue(few),/拟合输入不完整/);
 const stale=valid();stale.fit.factors[0].date='2026-10-12';assert.match(forecastIssue(stale),/拟合输入不完整/);
 const span=valid();span.base.date='2026-10-09';assert.match(forecastIssue(span),/前一交易日基准/);
 const holiday=valid();holiday.date='2026-10-07';assert.match(forecastIssue(holiday),/国内休市/);
});

