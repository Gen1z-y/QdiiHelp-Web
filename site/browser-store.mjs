const DB_VERSION=1;
const emptyState=()=>({version:1,watchlist:[],fundGroups:{},records:{},lastView:{}});
// FundStatsCache wraps the records index in a Proxy, which structuredClone rejects.
const cloneState=data=>structuredClone({...data,records:{...data.records}});
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function validateState(data){
 if(!object(data)||data.version!==1||!Array.isArray(data.watchlist)||data.watchlist.length>60||new Set(data.watchlist).size!==data.watchlist.length||data.watchlist.some(c=>typeof c!=='string'||!/^\d{6}$/.test(c)))throw Error('基金列表格式不正确');
 if(!object(data.records)||!object(data.lastView)||!object(data.fundGroups))throw Error('本机数据缺少业务字段');
 for(const [code,group] of Object.entries(data.fundGroups))if(!/^\d{6}$/.test(code)||!['watch','held'].includes(group))throw Error('基金分组格式不正确');
 // Reject archive references and keys unsafe for the business code's plain objects.
 let nodes=0;
 const visit=(value,depth=0)=>{
  if(depth>80||++nodes>3000000)throw Error('本机数据过大或嵌套过深');
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){if(['__proto__','constructor','prototype','$archive','$backupHistory'].includes(key))throw Error('本机数据包含不支持的字段');visit(child,depth+1);}
 };visit(data);
 return data;
}
function openDatabase(name){return new Promise((resolve,reject)=>{
 const req=indexedDB.open(name,DB_VERSION);
 req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('state');db.createObjectStore('history',{keyPath:'code'});};
 req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>db.close();resolve(db);};
 req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('其他页面阻止数据库升级，请关闭后重试'));
});}
// Resolve only after transaction commit, not the earlier request success event.
export function transaction(db,stores,mode,work){return new Promise((resolve,reject)=>{
 const tx=db.transaction(stores,mode);let result;
 tx.oncomplete=()=>resolve(typeof result==='function'?result():result);
 tx.onerror=()=>reject(tx.error??Error('浏览器存储操作失败'));
 tx.onabort=()=>reject(tx.error??Error('浏览器存储事务已取消'));
 try{result=work(tx);}catch(error){tx.abort();reject(error);}
});}
const get=(db,store,key)=>transaction(db,[store],'readonly',tx=>{const r=tx.objectStore(store).get(key);return ()=>r.result;});
const summary=h=>({...h,rows:h.rows.slice(0,160)});
export class BrowserStore{
 static async open(namespace){
  if(!namespace)throw Error('缺少浏览器数据命名空间');
  const db=await openDatabase(namespace),saved=await get(db,'state','current');
  const store=new BrowserStore(db,saved??emptyState());
  // Only lightweight summaries stay resident; full series remain in IndexedDB.
  const keys=await transaction(db,['history'],'readonly',tx=>{const r=tx.objectStore('history').getAllKeys();return ()=>r.result;});
  for(const key of keys){const h=await get(db,'history',key);store.history.set(key,summary(h));}
  return store;
 }
 constructor(db,data){this.db=db;this.data=validateState(data);this.backend='indexeddb';this.history=new Map();this.pending=Promise.resolve();this.lastError=null;this.linkViews();}
 linkViews(){for(const [key,view] of Object.entries(this.data.lastView))view.record=this.data.records[key]??view.record??{};}
 enqueue(work){const task=this.pending.catch(()=>{}).then(work).then(result=>{this.lastError=null;return result;},error=>{this.lastError=error;throw error;});task.catch(()=>{});this.pending=task;return task;}
 save(){
  clearTimeout(this.saveTimer);this.saveTimer=null;
  const snapshot=cloneState(this.data);
  return this.enqueue(async()=>{await transaction(this.db,['state'],'readwrite',tx=>tx.objectStore('state').put(snapshot,'current'));this.lastSavedAt=new Date().toISOString();});
 }
 deferSave(){if(this.saveTimer)return;this.saveTimer=setTimeout(()=>{void this.save();},200);}
 async flush(){if(this.saveTimer)await this.save();await this.pending;if(this.lastError)throw this.lastError;}
 async readHistory(code){await this.pending;return get(this.db,'history',code);}
 saveHistory(code,data){
  if(code!==data.code)throw Error('历史基金代码不匹配');
  const value=structuredClone(data);
  return this.enqueue(async()=>{await transaction(this.db,['history'],'readwrite',tx=>tx.objectStore('history').put(value));this.history.set(code,summary(value));});
 }
 add(code,group='watch'){if(!/^\d{6}$/.test(code)||!['watch','held'].includes(group))throw Error('基金代码或分组无效');if(!this.data.watchlist.includes(code)){if(this.data.watchlist.length>=60)throw Error('最多保存60只基金');this.data.watchlist.push(code);}this.data.fundGroups[code]=group;void this.save();}
 remove(code){this.data.watchlist=this.data.watchlist.filter(c=>c!==code);delete this.data.fundGroups[code];void this.save();}
 reorder(codes){if(!Array.isArray(codes)||codes.length!==this.data.watchlist.length||new Set(codes).size!==codes.length||codes.some(c=>!this.data.watchlist.includes(c)))throw Error('排序必须包含当前全部基金且不能重复');this.data.watchlist=[...codes];void this.save();}
 async close(){await this.flush();this.db.close();}
}
