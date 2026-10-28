import test from 'node:test';
import assert from 'node:assert/strict';
import {buildComparison,fetchHistory} from '../site/lib/history.mjs';




test('累计收益包含独有交易日，不把起始日涨幅再次计入',()=>{
  const r=buildComparison([{code:'a',rows:[{date:'2026-09-01',value:1,dailyReturn:.5},{date:'2026-09-02',value:1.1,dailyReturn:.1},{date:'2026-09-03',value:.99,dailyReturn:-.1}]},{code:'b',rows:[{date:'2026-09-01',value:2,dailyReturn:.2},{date:'2026-09-03',value:2.2,dailyReturn:.1}]}],30,new Date('2026-09-20'));
  assert.deepEqual(r.dates,['2026-09-01','2026-09-03']);assert.equal(r.series[0].points[0].cumulative,0);
  assert.ok(Math.abs(r.series[0].totalReturn+.01)<1e-12);assert.ok(Math.abs(r.series[0].maxDrawdown+.1)<1e-12);
});
test('分红场景采用公布涨跌而非单位净值比值',()=>{
  const r=buildComparison([{code:'a',rows:[{date:'2026-09-01',value:2,dailyReturn:0},{date:'2026-09-02',value:1.5,dailyReturn:.01}]}],30,new Date('2026-09-20'));
  assert.ok(Math.abs(r.series[0].totalReturn-.01)<1e-12);
});
test('缺少日涨幅时拒绝生成虚假的平线',()=>{
  assert.throws(()=>buildComparison([{code:'a',rows:[{date:'2026-09-01',value:1,dailyReturn:0},{date:'2026-09-02',value:1,dailyReturn:null}]}],30,new Date('2026-09-20')),/缺少/);
});
test('单位与累计净值可补算缺失涨幅和现金分红',()=>{
  const r=buildComparison([{code:'a',rows:[{date:'2026-09-01',value:2,cumulativeNav:2,dailyReturn:0},{date:'2026-09-02',value:1.8,cumulativeNav:2.1,dailyReturn:null}]}],30,new Date('2026-09-20'));
  assert.ok(Math.abs(r.series[0].totalReturn-.05)<1e-12);assert.deepEqual(r.series[0].derivedDates,['2026-09-02']);
});
test('comparison cumulative returns use the same precise NAV basis as the detail chart',async()=>{
 const {cumulativeChartRows}=await import('../site/forecast-chart.js');
 const rows=[{date:'2026-10-12',value:1,cumulativeNav:1,dailyReturn:0},{date:'2026-10-13',value:1.00124,cumulativeNav:1.00124,dailyReturn:.0012},{date:'2026-10-14',value:.90137,cumulativeNav:1.00137,dailyReturn:.0001}];
 const copy=structuredClone(rows),comp=buildComparison([{code:'111111',rows}],30,new Date('2026-10-20'));
 const detail=cumulativeChartRows(rows.map(r=>({...r,actual:r.dailyReturn,officialNav:true})));
 assert.ok(Math.abs(comp.series[0].totalReturn-detail.rows.at(-1).actual)<1e-12);assert.deepEqual(rows,copy);
 assert.equal(comp.series[0].points[1].daily,.0012,'keep the original rounded publication as the daily display');
});

