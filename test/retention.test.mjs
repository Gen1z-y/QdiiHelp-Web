import test from 'node:test';
import assert from 'node:assert/strict';
import {pruneOldObservations,hasOldObservations,RETENTION_DAYS} from '../site/lib/retention.mjs';



import {forecastStats} from '../site/lib/forecast-stats.mjs';
import {evidenceStats} from '../site/lib/model-evidence.mjs';
import {forecastHistory} from '../site/lib/holiday-export.mjs';
import {invalidateForecasts} from '../site/lib/forecast-policy.mjs';
import {replaySealedForecasts} from '../site/lib/replay-audit.mjs';

test('旧记录转摘要，180天边界内明细保留，缓存清理可重复执行',()=>{
 assert.equal(RETENTION_DAYS,180);
 const now=new Date('2026-10-10T12:00:00Z');
 const data={records:{'111111:2026-04-12':{forecast:{rows:[{weight:10}]}},'111111:2026-04-13':{forecast:{rows:[{weight:20}]}},'111111:2026-10-09':{}},
  lastView:{'111111:2026-04-12':{},'111111:2026-10-09':{}},fxDisplay:{'2026-04-12':{},'2026-10-09':{}}};
 assert.equal(hasOldObservations(data,{now}),true);
 const removed=pruneOldObservations(data,{now});
 assert.equal(removed,3);
 assert.deepEqual(Object.keys(data.records),['111111:2026-04-12','111111:2026-04-13','111111:2026-10-09']);
 assert.equal(data.records['111111:2026-04-12'].forecast.rows,undefined);
 assert.equal(data.records['111111:2026-04-13'].forecast.rows.length,1);
 assert.deepEqual(Object.keys(data.lastView),['111111:2026-10-09']);
 assert.deepEqual(Object.keys(data.fxDisplay),['2026-10-09']);
 assert.equal(hasOldObservations(data,{now}),false);
 assert.equal(pruneOldObservations(data,{now}),0);
});

test('仅有旧汇率缓存也触发保存',()=>{
 const data={records:{},lastView:{},fxDisplay:{'2025-01-01':{dailyReturn:0}}};
 assert.equal(pruneOldObservations(data,{now:new Date('2026-10-10T12:00:00Z')}),1);
});

