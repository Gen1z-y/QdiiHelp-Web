import {mergeBondHolding} from './lib/bond-disclosure.mjs?v=bond-v2-20261029';
import {forecastHistory} from './lib/forecast-history.mjs?v=bond-v2-20261029';
import {requireBond,migrateBondUniverse} from './bond-policy.mjs?v=bond-v2-20261029';
import {navObservation,navEstimate,navSnapshot,observationPlan,previousNavDate,reconcileObservation,planForFund} from './lib/nav-observation.mjs?v=bond-v2-20261029';
import {PERIOD_VERSION,pendingPublications,marketProgress,publishedPeriod} from './lib/nav-period.mjs?v=bond-v2-20261029';
import {session} from './lib/calendar.mjs?v=bond-v2-20261029';
import {sharedUpdate} from './lib/update-task.mjs?v=bond-v2-20261029';
import {RefreshTasks} from './lib/refresh-tasks.mjs?v=bond-v2-20261029';
import {RefreshInputs} from './lib/refresh-inputs.mjs?v=bond-v2-20261029';
import {FundStatsCache} from './lib/fund-stats-cache.mjs?v=bond-v2-20261029';
import {calendarCoverage} from './lib/calendar-maintenance.mjs?v=bond-v2-20261029';
import {sourceStatus} from './lib/source-status.mjs?v=bond-v2-20261029';
import {syncHoldings,stockHoldingsReport,syncComparison} from './lib/holdings-sync.mjs?v=bond-v2-20261029';
import {holdingsAnnouncements} from './lib/holdings-announcements.mjs?v=bond-v2-20261029';
import {bondObservation} from './lib/bond-date.mjs?v=bond-v2-20261029';
import {modelQuality,residualCandidate,captureEvidence,evidenceStats} from './lib/model-evidence.mjs?v=bond-v2-20261029';
import {canReuseView,blocksStockModel,publicView} from './lib/load-policy.mjs?v=bond-v2-20261029';
import {indexForFund,indexClose,estimateMarketIndex,clearIndexCache} from './lib/indices.mjs?v=bond-v2-20261029';
import {forecastIssue,invalidateForecasts} from './lib/forecast-policy.mjs?v=bond-v2-20261029';
import {holdingsChanged,selectHoldingSnapshot,forecastHoldingsChanged} from './lib/holdings-version.mjs?v=bond-v2-20261029';
import {holdingDateIssue,STOCK_ALLOCATION_ISSUE} from './lib/estimation-rules.mjs?v=bond-v2-20261029';
import {fetchHistory,buildComparison,savedHistory,configureHistoryStorage} from './lib/history.mjs?v=bond-v2-20261029';
import {navs,holdings,fundProfile,rowWithPrices,mapLimit,fxMovement,usableFx,clearProviderCache,navCrossCheck,bondHoldings,configureFxStorage} from './lib/provider.mjs?v=bond-v2-20261029';
import {estimateMarket,reconcile,previousWeekday,validDate,chinaDate} from './lib/model.mjs?v=bond-v2-20261029';
import {quoteDateMatches,marketId,marketStatus} from './lib/calendar.mjs?v=bond-v2-20261029';
import {pruneOldObservations} from './lib/retention.mjs?v=bond-v2-20261029';
import {replaySealedForecasts} from './lib/replay-audit.mjs?v=bond-v2-20261029';
import {bondReference,usableBondReference} from './lib/bond-reference.mjs?v=bond-v2-20261029';
import {bondFitForecast} from './lib/bond-forecast.mjs?v=bond-v2-20261029';
import {BrowserStore} from './browser-store.mjs?v=bond-v2-20261029';
const store=await BrowserStore.open(globalThis.QDII_NAMESPACE);
if(migrateBondUniverse(store.data))await store.save();
const usePostgres=false,historyRoot='browser',origin='https://qdii.invalid',port=0;
configureHistoryStorage({read:code=>store.history.get(code),load:code=>store.readHistory(code),write:(code,data)=>store.saveHistory(code,data)});
configureFxStorage({read:key=>store.data.fxSnapshots?.[key],write:(key,value)=>{store.data.fxSnapshots??={};store.data.fxSnapshots[key]=value;store.deferSave();}});
const policyStats={};
if(invalidateForecasts(store.data,policyStats)||policyStats.stamped)await store.save();
await store.flush();
const inflight=new Map();
let recalculationTask=null;
let holdingsSyncTask=null;
let restoring=false;
let shuttingDown=false,maintenanceTask=null,startupPruneTask=null;
const activeRequests=new Set();
const listTasks=new Set();
const trayRefreshTasks=new Set();
const fxDisplayTasks=new Map();
const fundStatsCache=new FundStatsCache();
function fundRecords(code){store.data.records=fundStatsCache.bind(store.data.records);return fundStatsCache.forFund(code);}
const startedAt=new Date().toISOString(),runtimeErrors=[];
const recordError=message=>{runtimeErrors.unshift({at:new Date().toISOString(),message:String(message).slice(0,500)});runtimeErrors.length=Math.min(runtimeErrors.length,20);};
store.data.refreshRuns??=[];
const refreshTasks=new RefreshTasks({runs:store.data.refreshRuns,work:async({date='auto',group=null,codes=null},progress)=>{const data=await list(date,progress,{group,codes});for(const item of data.items)if(item.error)recordError(item.code+'：'+item.error);return data;},persist:async()=>{await store.save();await store.flush?.();}});
export function startRefresh(options={},progress=()=>{}){if(shuttingDown||restoring)throw Error('正在关闭或恢复数据，请稍后再试');return refreshTasks.start(options,progress);}
export async function refreshFromTray(progress=()=>{}){
 const task=(async()=>{
 const result=await startRefresh({date:'auto',source:'tray'},progress).promise;
 if(store.saveTimer)await store.save();await store.flush?.();
 return {...result.refreshTask,historyPending:!!historySyncTask,historyErrors:historySyncTask?[]:historySyncState.errors};
 })();trayRefreshTasks.add(task);try{return await task;}finally{trayRefreshTasks.delete(task);}
}
async function recalculate(date,onProgress){
  if(recalculationTask)throw new Error('正在重新计算，请等待本次完成');
  const task=(async()=>{
    await Promise.allSettled([...listTasks,...inflight.values()].filter(Boolean));
    await Promise.all([clearProviderCache(),clearIndexCache()]);
    const result=await list(date,onProgress,{force:true});
    return {...result,recalculated:true,summary:{estimated:result.items.filter(f=>Number.isFinite(f.navEstimate?.return)).length,actual:result.items.filter(f=>f.record?.actual).length,unavailable:result.items.filter(f=>!f.record?.actual&&!Number.isFinite(f.navEstimate?.return)&&!(f.bond&&Number.isFinite(f.bondReference?.return))).length}};
  })();
  recalculationTask=task;try{return await task;}finally{recalculationTask=null;}
}
function checkCode(code){if(!/^\d{6}$/.test(code))throw new Error('请输入6位基金代码');return code;}
function checkDate(date){if(!validDate(date)||date>chinaDate()||Date.now()-Date.parse(date)>100*86400000)throw new Error('请选择最近100天内且不晚于今天的净值日期');return date;}
async function update(code,targetDate,{force=false,onStage=()=>{},onOfficial=()=>{},asOf=targetDate,preserveHistory=false,syncHoldingsForecast=false,inputs=null,plan=null,deadlineAt,checkParent=()=>{}}={}) {
  const date=asOf;
  const previous=store.data.lastView[code+':'+targetDate];
  if(previous?.asOf===asOf&&(!plan||previous.periodVersion===PERIOD_VERSION&&JSON.stringify(previous.plan)===JSON.stringify(plan))&&canReuseView(previous,store.data.holdingsSnapshots?.[code],{force}))return previous;
  const key=code+':'+targetDate;
  const failure=e=>{const old=store.data.lastView[key];return {...(old??{code,name:store.data.profiles?.[code]?.profile?.name??code,date:targetDate,asOf,record:store.data.records[key]??{},latestHoldings:null}),error:e.message,stale:!!old};};
  return sharedUpdate(inflight,key,onStage,async({report:onStage,check})=>{
    try {
      onStage('获取正式净值与基金资料');
      const navPromise=inputs?inputs.nav(code,()=>navs(code,true)):navs(code,true);
      const [nav,profile]=await Promise.all([navPromise,inputs?inputs.profile(code,()=>profileFor(code,force,check)):profileFor(code,force,check)]);
      requireBond(profile);check();const initialActual=nav.find(n=>n.date===targetDate);
      onOfficial({code,name:profile.name,bond:profile.bond,index:!!indexForFund(profile.name)||/联接|指数/.test(profile.name),group:store.data.fundGroups?.[code]??'watch',date:targetDate,actual:initialActual?{...initialActual,previousDate:nav.find(n=>n.date<targetDate)?.date}:null,latestNav:nav[0]});
      check();
      let navWarning=null;try{const cross=await navCrossCheck(code,nav);if(cross&&!cross.ok)navWarning=cross.reason;}catch{}
      check();
      // One NAV response can settle several older observations without recomputing predictions.
      for(let i=0;i<nav.length;i++){
        const priorKey=code+':'+nav[i].date,prior=store.data.records[priorKey];
        if(!prior||(preserveHistory&&Number.isFinite(prior.actual?.dailyReturn)&&!prior.actual.returnSource))continue;
        const actual={...nav[i],previousDate:nav[i+1]?.date};
        store.data.records[priorKey]=reconcileObservation(prior,null,actual,new Date().toISOString(),{target:nav[i].date});
        if(store.data.lastView[priorKey])store.data.lastView[priorKey].record=store.data.records[priorKey];
      }
      const indexId=indexForFund(profile.name);let indexQuote=null;
      if(indexId){onStage('获取指数行情');try{indexQuote=await indexClose(indexId,date,session(targetDate,'CN').closed?nav.find(n=>n.date<targetDate)?.date:plan?.expectedBase??previousNavDate(targetDate));}catch(e){const cached=store.data.lastView[key]?.indexQuote;indexQuote={...(cached||{id:indexId,name:indexId==='NDX'?'纳斯达克100':'标普500'}),stale:!!cached,error:e.message};}}
      let holdingError=null;
      onStage('读取披露持仓');
      const nonStock=profile.allocation?.stock===0&&profile.allocation.date<=date;
      // Refresh never fetches disclosures: holdings live in the Fund Holdings
      // dialog (manual sync plus the idle daily disclosure check).
      const savedHolding=store.data.holdingsSnapshots?.[code];
      const stockFund=!profile.bond&&!indexId&&!/联接|指数/.test(profile.name)&&!nonStock;
      if(stockFund&&!savedHolding)holdingError='暂无持仓资料：请先在“基金持仓”中同步最新披露';
      const h=stockFund?(savedHolding??{name:profile.name,rows:[],asOf:null}):{name:profile.name,rows:[],asOf:null};
      check();
      const actual=nav.find(n=>n.date===targetDate)??null;
      const expectedBase=actual||session(targetDate,'CN').closed?nav.find(n=>n.date<targetDate)?.date:plan?.expectedBase??previousNavDate(targetDate);
      let base=nav.find(n=>n.date===expectedBase);
      if(!base){const prior=store.data.records[code+':'+expectedBase]?.forecast;
        if(prior?.model?.value>0&&prior.date===expectedBase)base={date:expectedBase,value:prior.model.value,provisional:true};
      }
      // Missing expected publications remain outstanding; expose a longer
      // interval from a real NAV instead of silently calling it one day.
      if(!base&&plan)base=nav.find(n=>n.date<date);
      const old=store.data.records[key];
      const oldForecast=previous?.record?.forecast;
      // A validated forecast for a fully closed session cannot change anymore:
      // reuse it until an actual NAV, a holdings change or a new base arrives.
      const settledForecast=!!oldForecast?.rows?.length&&oldForecast.rows.every(r=>r.secid&&marketStatus(targetDate,marketId(r.secid)).state==='complete');
      if(!force&&!indexId&&!actual&&previous?.periodVersion===PERIOD_VERSION&&JSON.stringify(previous.plan)===JSON.stringify(plan)&&oldForecast?.model?.method==='market-close-v4'&&!previous.error&&!previous.modelError
        &&(Date.now()-Date.parse(oldForecast.calculatedAt)<3600000||settledForecast)&&base?.date===oldForecast.base?.date&&base?.value===oldForecast.base?.value
        &&!holdingsChanged(h,previous.latestHoldings)&&JSON.stringify(profile.allocation)===JSON.stringify(previous.allocation)){
        const view={...previous,latestNav:nav[0],checkedAt:new Date().toISOString()};store.data.lastView[key]=view;store.deferSave();return view;
      }
      let candidate=null,analysis=null,modelError=null,challenger=null,challengerError=null,quality=null,bondHoldingsInfo=null;
      if(profile.bond){
        // The bond fit only becomes a forecast after the CN close confirms the
        // index bar; intraday values stay a display reference (bondRefs).
        modelError=actual?null:'债基暂无法生成拟合预估';
        bondHoldingsInfo=store.data.bondHoldingsSnapshots?.[code]??null;
        if(!actual&&!session(targetDate,'CN').closed){
          try{
            const fit=await bondFitForecast(targetDate,{history:savedHistory(code,historyRoot)??{rows:[]},holdings:bondHoldingsInfo,base,reference:(date,options)=>inputs?inputs.bond(code,date,()=>bondReference(date,options)):bondReference(date,options)});
            if(fit.candidate){candidate=fit.candidate;analysis={...candidate,diagnostic:true};modelError=null;}
            else modelError=fit.unavailable??'债基拟合预估暂不可用';
          }catch(e){modelError='债基拟合预估失败：'+e.message;}
        }
      }
      else if(indexId){
        try{
          if(!base)throw new Error('缺少净值基准');
          if(!quoteDateMatches(indexQuote.date,date,'US')||indexQuote.stale)throw new Error('等待对应交易日指数收盘数据');
          onStage('获取指数与汇率');
          const dailyFx=await fxMovement('USD',indexQuote.valuationPreviousDate,date);
          if(!usableFx(dailyFx,indexQuote.valuationPreviousDate,date))throw new Error('单日汇率不可用');
          candidate=estimateMarketIndex(date,base,indexQuote,await fxMovement('USD',base.date,date),dailyFx);
          const reason=forecastIssue(candidate,profile.name);if(reason)throw new Error(reason);
          analysis=candidate;
        }catch(e){candidate=null;modelError=e.message;}
      }
      else if(/联接|指数/.test(profile.name)) modelError='指数及ETF联接基金尚未接入对应指数或目标ETF估值，暂停股票持仓估算';
      else if(nonStock) modelError=STOCK_ALLOCATION_ISSUE;
      else if(holdingError) modelError=holdingError;
      else if(!base) modelError='缺少早于目标日期的正式净值';
      else if(holdingDateIssue(h.asOf,date))modelError=holdingDateIssue(h.asOf,date);
      else {
        const holdingsRows=h.rows.filter(row=>row.weight>0);let collected=0;
        onStage(`股票行情与汇率 0 / ${holdingsRows.length}`);
        const rows=await mapLimit(holdingsRows,async row=>{check();const value=await rowWithPrices(row,base.date,date);onStage(`股票行情与汇率 ${++collected} / ${holdingsRows.length}`);return value;},6);
        candidate={date,base,holdingsDate:h.asOf,rows,model:{...estimateMarket(base,rows),method:'market-close-v4'},calculatedAt:new Date().toISOString()};
        analysis={...candidate,diagnostic:true};
        const reason=forecastIssue(candidate,profile.name);if(reason){modelError=reason;candidate=null;}
        if(candidate){
          quality=modelQuality(candidate,profile.allocation);
          if(h.expansionError){quality.reasons.push('完整持仓获取失败：'+h.expansionError);if(quality.level==='覆盖较充分')quality.level='存在缺口';}
          const usd=rows.find(r=>r.currency==='USD'&&Number.isFinite(r.rmbReturn));
          const usWeight=rows.filter(r=>r.currency==='USD'&&Number.isFinite(r.rmbReturn)).reduce((n,r)=>n+r.weight,0);
          if(usd&&candidate.model.coverage>=20&&usWeight/candidate.model.coverage>=.8&&profile.allocation?.stock>candidate.model.coverage){
            try{const q=await indexClose('SPX',date,base.date);if(q.stale||!quoteDateMatches(q.date,date,'US'))throw new Error('代理指数日期不匹配');challenger=residualCandidate(candidate,profile.allocation,q,usd.fx,usd.dailyFx);}
            catch(e){challengerError=e.message;}
          }
        }
      }
      // Recheck before snapshotting: an actual observed during collection must win.
      onStage('计算预估并核对最新净值');
      const latest=candidate && !actual?await navs(code,true):nav;
      check();
      const published=latest.find(n=>n.date===targetDate)??actual;
      const publishedPreviousDate=latest.find(n=>n.date<targetDate)?.date;
      const now=new Date().toISOString();
      if(candidate&&plan)Object.assign(candidate,{periodVersion:PERIOD_VERSION,valuationBaseDate:expectedBase,
        referenceOnly:base?.date!==expectedBase||plan.targetConfirmed===false});
      const reviseHoldings=syncHoldingsForecast&&forecastHoldingsChanged(old?.forecast,h);
      const record=preserveHistory&&Number.isFinite(old?.actual?.dailyReturn)&&!old.actual.returnSource?old:{...old,...reconcileObservation(old,old?.actual?null:candidate,published?{...published,previousDate:publishedPreviousDate}:null,now,{target:targetDate,asOf,reviseHoldings})};
      const revised=record.forecastRevisedAt===now&&record.forecast!==old?.forecast;
      if(!profile.bond&&!published&&!old?.actual&&!old?.sealedAt&&blocksStockModel({indexId,nonStock,holdingsDate:h.asOf,date})){
        if(record.forecast){record.rejectedForecasts??=[];record.rejectedForecasts.push({forecast:record.forecast,reason:modelError,invalidatedAt:now});record.forecast=null;record.firstForecastAt=null;}
      }
      captureEvidence(record,published||asOf<targetDate||old?.sealedAt&&!revised||candidate?.base?.provisional?null:candidate,{allocation:profile.allocation,candidate:challenger,holdingSource:{source:h.source,expanded:h.expanded,expansionError:h.expansionError}},now);
      if(indexId&&!(preserveHistory&&old?.actual))record.indexClose=indexQuote;
      store.data.records[key]=record;
      const view={code,name:profile.name,bond:profile.bond,index:!!indexId||/联接|指数/.test(profile.name),date:targetDate,asOf,indexQuote,latestNav:latest[0],base,latestHoldings:h,analysis,record,holdingsReestimated:revised,modelError,navWarning,allocation:profile.allocation,quality,challenger,challengerError,bondHoldings:bondHoldingsInfo,plan,periodVersion:PERIOD_VERSION,
        checkedAt:new Date().toISOString(),error:null};
      store.data.lastView[key]=view;store.deferSave();return view;
    } catch(e) {
      const old=store.data.lastView[key];
      return {...(old??{code,name:code,date:targetDate,asOf,record:store.data.records[key]??{},latestHoldings:null}),error:e.message,stale:!!old};
    }
  },{deadlineAt,checkParent}).catch(failure);
}
function stats(code,historyRows,targetDate,validation=false) {
  fundRecords(code);return fundStatsCache.get(code,{historyRows,targetDate,historyDays:100000,validation});
}
async function profileFor(code,force=false,check=()=>{}){
 const saved=store.data.profiles?.[code];
 if(!force&&saved&&Date.now()-Date.parse(saved.fetchedAt)<3600000)return requireBond(saved.profile);
 const profile=requireBond(await fundProfile(code,{force,check}));check();store.data.profiles??={};store.data.profiles[code]={profile,fetchedAt:new Date().toISOString()};return profile;
}
function fundPlan(code,nav=null,now=new Date()){
 const profile=store.data.profiles?.[code]?.profile;
 const known=nav??[...(savedHistory(code,historyRoot)?.rows??[]),...Object.entries(fundRecords(code)).flatMap(([,r])=>r.actual?[r.actual]:[])];
 return planForFund({code,holding:store.data.holdingsSnapshots?.[code],indexId:indexForFund(profile?.name??''),
  nav:known,rule:store.data.fundValuationRules?.[code]},now);
}
function decorate(view,history,target){
 const ownRecords=fundRecords(view.code);
 const item={...publicView(view),group:store.data.fundGroups?.[view.code]??'watch',lastSync:store.data.lastHoldingsSync?.items?.find(r=>r.code===view.code)?.status??null,stats:stats(view.code,history.rows,target),history:{count:history.totalCount??history.rows.length,fetchedAt:history.fetchedAt,source:history.source,stale:!!history.stale,error:history.error},bondReference:view.bond?usableBondReference(target,store.data.bondRefs?.[view.code]??null):null};
 item.recentObservations=Object.entries(ownRecords).filter(([key,r])=>key.slice(7)<view.date&&!session(key.slice(7),'CN').closed&&(r.forecast||r.actual))
  .sort(([a],[b])=>b.localeCompare(a)).slice(0,5).map(([key,r])=>({date:key.slice(7),estimate:navEstimate({date:key.slice(7),record:r}),actual:r.actual?.dailyReturn??null,actualSeenAt:r.firstActualSeenAt??null}));
 item.forecastHistory=forecastHistory(ownRecords,view.code);item.navEstimate=navEstimate(item);
 item.pendingPublications=pendingPublications(view.code,ownRecords,view.date);
 item.marketProgress=marketProgress(item);
 item.stages=Object.values(ownRecords).flatMap(r=>r.stages??[]).filter(s=>s.date<=view.date)
  .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,120);
 item.officialPeriod=publishedPeriod(view.record?.actual);
 const periodFrom=item.navEstimate.from??previousNavDate(view.date),periodTo=item.navEstimate.asOf??view.date;
 const fxKey=`USD:${periodFrom}:${periodTo}`;
 const shown=store.data.fxSnapshots?.[fxKey];
 const cachedFx=store.data.fxDisplay?.[view.date];
 item.valuationFx=shown??(periodFrom===previousNavDate(view.date)&&periodTo===view.date&&cachedFx&&!cachedFx.error?{return:cachedFx.dailyReturn,base:{date:cachedFx.previousDate,close:cachedFx.previousClose},target:{date:cachedFx.closeDate,close:cachedFx.close},source:cachedFx.source}:null);
 const recordedForecast=view.record?.forecast??view.record?.partialForecast;
 const historicalFx=recordedForecast?.fx??recordedForecast?.rows?.find(r=>r.currency==='USD')?.fx;
 item.forecastFxDiffers=!!(historicalFx&&item.valuationFx&&(historicalFx.source!==item.valuationFx.source||Math.abs(historicalFx.return-item.valuationFx.return)>1e-12));
 item.forecastHistory=item.forecastHistory.filter(r=>!session(r.date,'CN').closed).map(r=>{const estimate=navEstimate({date:r.date,record:store.data.records[view.code+':'+r.date]});return {...r,value:estimate.partial?null:estimate.return};});
 item.stats={...item.stats,pairs:item.stats.pairs.filter(r=>!session(r.date,'CN').closed||Number.isFinite(r.actual)).map(r=>{const estimate=navEstimate({date:r.date,record:store.data.records[view.code+':'+r.date]});return {...r,forecast:estimate.partial?null:estimate.return};})};return item;
}
async function snapshot(date){
 if(usePostgres)await Promise.all(store.data.watchlist.map(code=>store.readHistory(code,{recent:true})));
 const items=store.data.watchlist.flatMap(code=>{
  const known=Object.values(store.data.lastView).filter(v=>v.code===code).sort((a,b)=>(b.checkedAt??'').localeCompare(a.checkedAt??''))[0],plan=date==='auto'&&!known?.bond?fundPlan(code):null,target=date==='auto'?(known?.bond?bondObservation(chinaDate(),known.latestNav?.date).date:plan.target):date;
  let view=store.data.lastView[code+':'+target]??(known?(date==='auto'?navSnapshot(known,target,store.data.records[code+':'+target]):known):null);
  const lastAttempt=refreshTasks.list().flatMap(r=>r.items??[]).find(item=>item.code===code&&item.date===target);
  if(!view&&!lastAttempt?.error)return [];
  if(!view)view={code,name:store.data.profiles?.[code]?.profile?.name??code,date:target,record:store.data.records[code+':'+target]??{},latestHoldings:store.data.holdingsSnapshots?.[code]??null,modelError:'尚未成功获取数据，请点击刷新数据',bond:profileIsBond(code)};
  if(plan)view={...view,plan,asOf:plan.asOf};
  if(lastAttempt?.error)view={...view,error:lastAttempt.error,stale:!!known};
  if(date==='auto'&&known?.bond&&known.latestNav?.date===target&&view.date!==target){const record=store.data.records[code+':'+target]??{};view={...known,date:target,record:{...record,actual:record.actual??known.latestNav}};}
  const history=savedHistory(code,historyRoot)??{rows:[]};return [{...decorate(view,history,view.date),...(date==='auto'&&view.bond?{domesticClosure:bondObservation(chinaDate(),view.latestNav?.date).closure}:{}),fromSaved:!!known,requestedDate:target}];
 });return {date,items,serverTime:new Date().toISOString(),cached:true,fx:null};
}
async function list(...args){
 if(holdingsSyncTask)await holdingsSyncTask;
 if(recalculationTask&&!args[2]?.force)await recalculationTask;
 const task=listImpl(...args);listTasks.add(task);try{return await task;}finally{listTasks.delete(task);}
}
function profileIsBond(code){return !!store.data.profiles?.[code]?.profile?.bond;}
async function listImpl(date,onProgress=()=>{},{force=false,preserveHistory=false,holdingsForecastCodes=new Set(),group=null,codes:onlyCodes=null}={}) {const codes=store.data.watchlist.filter(code=>(!onlyCodes||onlyCodes.includes(code))&&(!group||(group==='bond'?(profileIsBond(code)||Object.values(store.data.lastView).some(v=>v.code===code&&v.bond)):(store.data.fundGroups?.[code]??'watch')===group)));let completed=0;onProgress({completed,total:codes.length});
 const stockTarget=date==='auto'?navObservation():date,inputs=new RefreshInputs();
 // Bond-only refresh does not request foreign exchange display data.
 const fundTasks=new Map();
 const items=await mapLimit(codes,async c=>{
  const onStage=stage=>onProgress({completed,total:codes.length,code:c,name:store.data.profiles?.[c]?.profile?.name??c,stage});
  let target=date==='auto'?null:date;
  const item=await sharedUpdate(fundTasks,c,onStage,async({report:onStage,check,deadlineAt})=>{
   if(usePostgres)await store.readHistory(c,{recent:true});
   check();onStage('检查目标净值，已公布则复用');
   let plan=null;
   if(date==='auto'){
    const profile=store.data.profiles?.[c]?.profile??await inputs.profile(c,()=>profileFor(c,force,check)).catch(()=>null);
    check();
    if(profile?.bond){
     const known=Object.values(store.data.lastView).filter(v=>v.code===c).sort((a,b)=>(b.checkedAt??'').localeCompare(a.checkedAt??''))[0];
     const nav=await inputs.nav(c,()=>navs(c,true)).catch(()=>null);
     check();target=bondObservation(chinaDate(),nav?.[0]?.date??known?.latestNav?.date).date;
    }
    else {const nav=await inputs.nav(c,()=>navs(c,true)).catch(()=>null);check();plan=fundPlan(c,nav);target=plan.target;}
   }
   if(!preserveHistory&&plan&&!profileIsBond(c)&&plan.partial){
    const prior=store.data.records[c+':'+plan.from];
    if(!prior?.forecast&&!prior?.actual)await update(c,plan.from,{onStage,inputs,deadlineAt,checkParent:check});
    check();
   }
   const checkedBefore=store.data.lastView[c+':'+target]?.checkedAt;
   const view=await update(c,target,{force,preserveHistory,syncHoldingsForecast:holdingsForecastCodes.has(c),onStage,inputs,plan,deadlineAt,checkParent:check,onOfficial:official=>onProgress({completed,total:codes.length,code:c,name:official.name,stage:'正式净值已获取，预估更新中',official}),asOf:plan&&!profileIsBond(c)?plan.asOf:target}),history=savedHistory(c,historyRoot)??{rows:[]};
   check();
   if(view.bond&&!(view.record?.actual?.date===target&&!force))try{const ref=await inputs.bond(c,target,()=>bondReference(target,{history,holdings:store.data.bondHoldingsSnapshots?.[c]}));check();if(ref){store.data.bondRefs??={};store.data.bondRefs[c]=ref;}}catch{}
   check();const result=decorate(view,history,target);
   result.refreshReused=!!checkedBefore&&view.checkedAt===checkedBefore;
   if(date==='auto'&&view.bond)result.domesticClosure=bondObservation(chinaDate(),view.latestNav?.date).closure;
   return result;
  }).catch(error=>{
   const known=Object.values(store.data.lastView).filter(v=>v.code===c).sort((a,b)=>(b.checkedAt??'').localeCompare(a.checkedAt??''))[0];
   target??=known?.bond?bondObservation(chinaDate(),known.latestNav?.date).date:fundPlan(c).target;
   const old=store.data.lastView[c+':'+target];
   const view={...(old??{code:c,name:store.data.profiles?.[c]?.profile?.name??c,date:target,record:store.data.records[c+':'+target]??{},latestHoldings:null,bond:profileIsBond(c)}),error:error.message,stale:!!old};
   return decorate(view,savedHistory(c,historyRoot)??{rows:[]},target);
  });
  onProgress({completed:++completed,total:codes.length,code:c,name:item.name,item});return item;
 },3);if(store.saveTimer)store.save();if(!preserveHistory)startHistorySync(codes);return {date,items,serverTime:new Date().toISOString(),historySync:!preserveHistory,fx:null,fxUpdating:fxDisplayTasks.has(stockTarget)};}

let historySyncTask=null;
const historySyncQueue=new Set(),historySyncScheduled=new Set();
let historySyncState={running:false,completed:0,total:0,errors:[]};
function startHistorySync(codes){
 if(!historySyncTask){historySyncScheduled.clear();historySyncState={running:false,completed:0,total:0,errors:[]};}
 for(const code of codes)if(!historySyncScheduled.has(code)){historySyncScheduled.add(code);historySyncQueue.add(code);historySyncState.total++;}
 if(historySyncTask||!historySyncQueue.size)return;
 historySyncState.running=true;
 historySyncTask=(async()=>{
  while(historySyncQueue.size){
   const batch=[...historySyncQueue];historySyncQueue.clear();
   await mapLimit(batch,async code=>{try{
    const latestDate=Object.values(store.data.lastView).filter(v=>v.code===code).map(v=>v.latestNav?.date).filter(Boolean).sort().at(-1);
    const result=await fetchHistory(code,historyRoot,{latestDate});if(result.error)historySyncState.errors.push(code+'：'+result.error);
   }catch(e){historySyncState.errors.push(code+'：'+e.message);}finally{historySyncState.completed++;}},4);
  }
 })().finally(()=>{historySyncState.running=false;historySyncTask=null;if(historySyncQueue.size)startHistorySync([...historySyncQueue]);});
}
const send=async(res,status,data)=>{try{if(store.saveTimer)await store.save();await store.flush?.();}catch(e){status=503;data={error:'浏览器保存失败：'+e.message};}res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function streamFunds(res,operation,initial=null){
 res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 const emit=(type,data)=>{if(!res.destroyed)res.write(JSON.stringify({type,...data})+'\n');};
 emit('progress',{completed:0,total:null});
 if(initial)emit('snapshot',{data:initial});
 try{const data=await operation(progress=>emit('progress',progress));await store.save();await store.flush?.();emit('result',{data});}
 catch(e){recordError(e.message);emit('error',{error:e.message});}finally{res.end();}
}

async function body(req,limit=2048) {let raw='';for await(const c of req){raw+=c;if(raw.length>limit)throw new Error('请求过大');}return JSON.parse(raw||'{}');}
export async function handleRequest(req,res){
  try{
    const url=new URL(req.url,origin);
    if(url.pathname==='/api/runtime'&&req.method==='GET')return send(res,200,{version:'2026.10.15-speed',startedAt,now:new Date().toISOString(),...runtimeStatus(),storage:store.backend??'json',lastSavedAt:store.lastSavedAt??null,inactiveFundCount:Object.keys(store.data.inactiveFunds??{}).length,saveError:store.lastError?.message??store.runtime?.error?.message??null,historySync:historySyncState,refreshes:refreshTasks.list().slice(0,5),calendars:calendarCoverage(),sources:sourceStatus(Object.values(store.data.lastView)),errors:runtimeErrors,memory:null,historyCache:{fullFunds:store.history?.size??0,summaryFunds:store.historyRecent?.size??0}});
    if(url.pathname==='/api/refresh'&&req.method==='GET')return send(res,200,{runs:url.searchParams.get('brief')==='1'?refreshTasks.list().slice(0,5).map(r=>({...r,items:r.items.filter(item=>item.error),brief:true})):refreshTasks.list()});
    const refreshRoute=/^\/api\/refresh\/([^/]+)(\/retry)?$/.exec(url.pathname);
    if(refreshRoute&&req.method==='GET'&&!refreshRoute[2]){const run=refreshTasks.get(refreshRoute[1]);return send(res,run?200:404,run??{error:'刷新记录不存在'});}
    if(url.pathname==='/api/history-sync'&&req.method==='GET'){const date=navObservation();return send(res,200,{...historySyncState,fx:null,fxUpdating:fxDisplayTasks.has(date)});}
    if(url.pathname==='/api/history' && req.method==='GET'){
      const codes=[...new Set((url.searchParams.get('codes')||store.data.watchlist.slice(0,8).join(',')).split(',').filter(Boolean))];
      if(codes.length<1||codes.length>8)throw new Error('请选择1–8只基金');codes.forEach(code=>{checkCode(code);if(!store.data.watchlist.includes(code))throw Error('请先添加支持的债基');});
      const days=Number(url.searchParams.get('days')||90);if(![0,30,90,180,365,1095,1825].includes(days))throw new Error('不支持的时间范围');
      const all=await mapLimit(codes,async code=>{
        const from=days>0&&url.searchParams.get('format')!=='detail'?new Date(Date.parse(chinaDate())-days*86400000).toISOString().slice(0,10):null;
        const h=await fetchHistory(code,historyRoot,{force:url.searchParams.get('refresh')==='1',from,to:from?chinaDate():null});
        const last=Object.values(store.data.lastView).find(v=>v.code===code);
        return {...h,name:last?.name??code};
      },2);
      if(url.searchParams.get('format')==='detail'){if(codes.length!==1)throw Error('详情只支持一只基金');const validation=url.searchParams.get('validation')==='1';return send(res,200,{...all[0],stats:stats(codes[0],all[0].rows,null,validation),...(validation?{evidenceStats:evidenceStats(fundRecords(codes[0]),codes[0])}:{})});}
      return send(res,200,buildComparison(all,days));
    }
    if(url.pathname==='/api/refresh'&&req.method==='POST'){
     const {group=null}=await body(req);if(group&&!['held','watch','bond'].includes(group))throw Error('无效的基金分组');
     const task=startRefresh({date:'auto',group,source:'page'});return send(res,202,task.report);
    }
    if(refreshRoute?.[2]&&req.method==='POST'){const task=refreshTasks.retry(refreshRoute[1]);return send(res,202,task.report);}
    if(url.pathname==='/api/browser/flush')return send(res,200,{ok:true,lastSavedAt:store.lastSavedAt});
    if(url.pathname==='/api/fund-profile' && req.method==='GET')return send(res,200,requireBond(await fundProfile(checkCode(url.searchParams.get('code')||''))));
    if(url.pathname==='/api/holdings/announcements' && req.method==='GET'){
      const code=checkCode(url.searchParams.get('code')||'');
      if(!store.data.watchlist.includes(code))throw Error('请先添加支持的债基');
      const dates=[url.searchParams.get('date'),url.searchParams.get('previousDate')].filter(Boolean);
      if(!dates.length||dates.some(d=>!validDate(d)))return send(res,400,{error:'披露日期无效'});
      return send(res,200,await holdingsAnnouncements(code,dates));
    }
    if(url.pathname==='/api/holdings/sync' && req.method==='GET')return send(res,200,stockHoldingsReport(store.data.lastHoldingsSync,store.data));
    if(url.pathname==='/api/holdings/sync-one'&&req.method==='POST'){
      if(holdingsSyncTask||recalculationTask)throw new Error('正在更新或计算，请等待本次完成');
      const {code,stream=false}=await body(req);checkCode(code);
      if(!store.data.watchlist.includes(code))throw new Error('基金不在列表中，无法同步');
      const operation=async onProgress=>{
      if(holdingsSyncTask||recalculationTask)throw Error('正在更新或计算，请等待本次完成');
      const task=(async()=>{
      const stage=text=>onProgress({code,stage:text,completed:0,total:1});
      stage('等待正在执行的更新完成');
      await Promise.allSettled([...listTasks,...inflight.values()].filter(Boolean));
      stage('获取基金资料');
      const profile=await profileFor(code,true).catch(()=>null);
      const name=profile?.name??store.data.profiles?.[code]?.profile?.name??code;
      const viewHolding=Object.values(store.data.lastView).filter(v=>v.code===code&&v.latestHoldings?.asOf).map(v=>v.latestHoldings).sort((a,b)=>b.asOf.localeCompare(a.asOf))[0];
      const storedHolding=store.data.holdingsSnapshots?.[code];
      const previous=profile?.bond?store.data.bondHoldingsSnapshots?.[code]:(storedHolding&&(!viewHolding||storedHolding.asOf>=viewHolding.asOf)?storedHolding:viewHolding);
      let sync;
      if(!profile)sync={code,name,status:'failed',previousDate:previous?.asOf??null,date:null,count:0,message:'未能获取基金资料'};
      else if(indexForFund(profile.name)||/联接|指数/.test(profile.name))sync={code,name,status:'unsupported',previousDate:null,date:null,count:0,message:'指数及ETF联接基金无披露持仓可同步'};
      else try{
        if(profile.bond){
          stage('获取披露债券持仓');
          const latest=await bondHoldings(code,{force:true});
          if(!/^\d{4}-\d{2}-\d{2}$/.test(latest.asOf)||!latest.rows?.length)throw new Error('未获取到有效披露债券持仓');
          selectHoldingSnapshot(previous,latest);
          const changed=holdingsChanged(previous,latest);
          store.data.bondHoldingsSnapshots??={};store.data.bondHoldingsSnapshots[code]={...mergeBondHolding(previous,latest),fetchedAt:new Date().toISOString()};
          sync={code,name,bond:true,status:changed?'updated':'unchanged',previousDate:previous?.asOf??null,date:latest.asOf,count:latest.rows.length,bonds:latest.rows.map(r=>({name:r.name,code:r.code,weight:r.weight})),message:changed?'已更新披露债券持仓':'已是数据源最新披露债券持仓'};
        }else{
          const remote=await holdings(code,{force:true,onStage:stage});
          const saved=previous;
          const choice=selectHoldingSnapshot(saved,remote),chosen=choice.holding;
          if(!/^\d{4}-\d{2}-\d{2}$/.test(chosen.asOf)||!chosen.rows?.length)throw new Error('未获取到有效披露持仓');
          const changed=holdingsChanged(saved,chosen);
          store.data.holdingsSnapshots??={};store.data.holdingsSnapshots[code]={...chosen,fetchedAt:new Date().toISOString(),source:'东方财富 · 基金披露股票持仓'};
          sync={code,name,status:changed?'updated':'unchanged',previousDate:saved?.asOf??null,date:chosen.asOf,count:chosen.rows.length,message:(changed?'已更新':'已是数据源最新披露')+(choice.warning?'；'+choice.warning:chosen.expansionError?'；只取得重仓股，完整明细获取失败：'+chosen.expansionError:'')};
        }
      }catch(e){sync={code,name,status:'failed',previousDate:previous?.asOf??null,date:previous?.asOf??null,count:previous?.rows?.length??0,message:e.message};}
      let item=null;
      try{
        stage('持仓处理完成，正在刷新该基金估算');
        const inputs=new RefreshInputs();
        const nav=await inputs.nav(code,()=>navs(code,true)).catch(()=>null);
        const known=Object.values(store.data.lastView).filter(v=>v.code===code).sort((x,y)=>(y.checkedAt??'').localeCompare(x.checkedAt??''))[0];
        const plan=profile?.bond?null:fundPlan(code,nav);
        const target=profile?.bond?bondObservation(chinaDate(),nav?.[0]?.date??known?.latestNav?.date).date:plan.target;
        const view=await update(code,target,{force:true,preserveHistory:true,syncHoldingsForecast:['updated','unchanged'].includes(sync.status),onStage:stage,inputs,plan,asOf:profile?.bond?target:plan.asOf});
        item=decorate(view,savedHistory(code,historyRoot)??{rows:[]},target);
        sync.calculationMessage=item.record?.actual?'实际已公布，保留历史净值与预测':item.error||item.modelError||(item.holdingsReestimated?'已按最新持仓重算预估':'预估处理完成');
      }catch(e){sync.message=(sync.message?sync.message+'；':'')+'估算刷新失败：'+e.message;}
      const latest=profile?.bond?store.data.bondHoldingsSnapshots?.[code]:store.data.holdingsSnapshots?.[code];
      Object.assign(sync,syncComparison(previous,latest?.asOf===sync.date?latest:previous));
      sync=stockHoldingsReport({items:[sync]},store.data).items[0]??sync;
      store.data.lastHoldingsSync??={items:[],summary:{},serverTime:sync.syncedAt};
      if(store.data.lastHoldingsSync){
        const report=store.data.lastHoldingsSync,index=report.items.findIndex(r=>r.code===code);
        for(const row of report.items)row.syncedAt??=report.serverTime;
        if(index>=0)report.items[index]={...report.items[index],...sync};else report.items.push(sync);
        report.serverTime=sync.syncedAt;
        report.summary=Object.fromEntries(['updated','unchanged','failed','unsupported'].map(status=>[status,report.items.filter(r=>r.status===status).length]));
      }
      store.save();
      onProgress({code,completed:1,total:1,stage:sync.status==='failed'?'同步失败，已保留旧持仓':'处理完成'});
      return {sync,item};
      })();holdingsSyncTask=task;
      try{return await task;}finally{if(holdingsSyncTask===task)holdingsSyncTask=null;}
      };
      if(stream)return await streamFunds(res,operation);
      return send(res,200,await operation(()=>{}));
    }
    if(url.pathname==='/api/holdings/sync' && req.method==='POST'){
      if(holdingsSyncTask||recalculationTask)throw new Error('正在更新或计算，请等待本次完成');
      const {stream=false,date='auto'}=await body(req),target=date==='auto'?'auto':checkDate(date);
      const operation=async progress=>{
        if(holdingsSyncTask||recalculationTask)throw new Error('正在更新或计算，请等待本次完成');
        const task=(async()=>{
          await Promise.allSettled([...listTasks,...inflight.values()].filter(Boolean));
          await Promise.all([clearProviderCache(),clearIndexCache()]);
          const report=await syncHoldings(store,p=>progress({...p,phase:'holdings'}));
          // Call the implementation directly: list() waits for this holdings task.
          // Refresh every fund, including unchanged holdings, bonds and indices.
          const holdingsForecastCodes=new Set(report.items.filter(r=>['updated','unchanged'].includes(r.status)).map(r=>r.code));
          const data=await listImpl(target,p=>progress({...p,phase:'recalculate'}),{force:true,preserveHistory:true,holdingsForecastCodes});
          for(const row of report.items){
            const view=data.items.find(f=>f.code===row.code);
            row.recalculation=view?.record?.actual?'published':Number.isFinite(target==='auto'?view?.navEstimate?.return:view?.record?.forecast?.model?.return)?'updated':'unavailable';
            row.calculationMessage=view?.record?.actual?'实际已公布，保留历史净值与预测':view?.error||view?.modelError||(row.recalculation==='unavailable'?'暂无有效预估':view?.holdingsReestimated?'已按最新持仓重算预估':view?.record?.sealedAt?'已保留收盘封存预估':'预估已更新');
          }
          report.recalculation=Object.fromEntries(['updated','published','unavailable'].map(s=>[s,report.items.filter(r=>r.recalculation===s).length]));
          report.refreshSummary={total:data.items.length,estimated:data.items.filter(f=>Number.isFinite(f.navEstimate?.return)).length,actual:data.items.filter(f=>f.record?.actual).length,unavailable:data.items.filter(f=>!f.record?.actual&&!Number.isFinite(f.navEstimate?.return)&&!(f.bond&&Number.isFinite(f.bondReference?.return))).length};
          report.targetDate=target;report.completedAt=new Date().toISOString();store.save();
          return {...stockHoldingsReport(report,store.data),data};
        })();holdingsSyncTask=task;
        try{return await task;}finally{holdingsSyncTask=null;}
      };
      if(stream)return await streamFunds(res,operation);return send(res,200,await operation(()=>{}));
    }
    if(url.pathname==='/api/funds' && req.method==='GET'){const group=url.searchParams.get('group');if(group&&!['held','watch','bond'].includes(group))return send(res,400,{error:'无效的基金分组'});const date=url.searchParams.get('date')||'auto',target=date==='auto'?'auto':checkDate(date);if(url.searchParams.get('cached')==='1')return send(res,200,await snapshot(target));if(url.searchParams.get('stream')==='1')return await streamFunds(res,progress=>startRefresh({date:target,group,source:'page'},progress).promise,await snapshot(target));return send(res,200,await startRefresh({date:target,group,source:'page'}).promise);}
    if(url.pathname==='/api/recalculate' && req.method==='POST'){
      if(holdingsSyncTask)throw new Error('正在更新基金持仓，请等待完成');
      const {date='auto',stream=false}=await body(req),target=date==='auto'?'auto':checkDate(date);if(stream)return await streamFunds(res,progress=>recalculate(target,progress));return send(res,200,await recalculate(target));
    }
    if(url.pathname==='/api/order' && req.method==='PUT'){const {codes}=await body(req);store.reorder(codes);return send(res,200,{codes:store.data.watchlist});}
    if(url.pathname==='/api/funds' && req.method==='POST'){
      const {code,group}=await body(req);checkCode(code);
      if(!['held','watch'].includes(group))throw new Error('请选择加入自选或持有');
      if(store.data.watchlist.length>=60&&!store.data.watchlist.includes(code))throw new Error('最多保存60只基金');
      const profile=requireBond(await fundProfile(code));await navs(code);store.data.profiles??={};store.data.profiles[code]={profile,fetchedAt:new Date().toISOString()};delete store.data.inactiveFunds?.[code];store.add(code,group);return send(res,200,{ok:true,group});
    }
    const match=url.pathname.match(/^\/api\/funds\/(\d{6})$/);
    if(match && req.method==='DELETE'){store.remove(match[1]);return send(res,200,{ok:true});}
    if(url.pathname==='/api/health')return send(res,200,{ok:true,app:'qdii-help',storageVersion:usePostgres?4:3,storage:store.backend??'json',build:usePostgres?'postgres-v1':'shared-storage-v3',date:navObservation()});
    return send(res,404,{error:'接口不存在'});
  }catch(e){recordError(e.message);return await send(res,400,{error:e.message});}
}

export function runtimeStatus(){return {busy:!!(holdingsSyncTask||recalculationTask||listTasks.size||inflight.size||historySyncTask||refreshTasks.pending().length||fxDisplayTasks.size),shuttingDown:false};}


