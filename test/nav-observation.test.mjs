import test from 'node:test';
import assert from 'node:assert/strict';
import {navObservation,navEstimate,navSnapshot} from '../site/lib/nav-observation.mjs';

test('publication dates skip domestic holidays and weekend make-up workdays',()=>{
 assert.equal(navObservation('2026-10-08'),'2026-10-08');
 assert.equal(navObservation('2026-10-09'),'2026-10-08');
 assert.equal(navObservation('2026-10-10'),'2026-10-09');
 assert.equal(navObservation('2026-10-11'),'2026-10-09');
 assert.equal(navObservation('2026-10-12'),'2026-10-09');
 assert.equal(navObservation('2026-10-07'),'2026-10-08');
});
test('NAV-day forecast includes holiday returns, and rejects stale bases and mismatched dates',()=>{
 const f={date:'2026-10-08',record:{forecast:{date:'2026-10-08',base:{date:'2026-09-30'},model:{return:.08,dailyReturn:.01}}}};
 assert.equal(navEstimate(f).return,.08);
 assert.equal(navEstimate({...f,date:'2026-09-30'}).return,null);
 f.record.forecast.base.date='2026-09-29';assert.equal(navEstimate(f).return,null);
 f.record.actual={previousDate:'2026-09-29'};assert.equal(navEstimate(f).return,.08);
});
test('cache fallback keeps the target date without reusing another date forecast',()=>{
 const saved={date:'2026-10-07',record:{forecast:{model:{return:.07}}},indexQuote:{date:'2026-10-07'},analysis:{model:{return:.07}}};
 const result=navSnapshot(saved,'2026-09-30');assert.equal(result.date,'2026-09-30');assert.deepEqual(result.record,{});assert.equal(result.analysis,null);assert.equal(result.indexQuote,null);assert.equal(saved.date,'2026-10-07');
});
