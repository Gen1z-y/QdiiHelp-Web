// Conservative name-based scope: domestic RMB bond funds only. Unknowns stay inactive.
export function supportedBond(profile){
 const name=profile?.name??'';
 return typeof name==='string'&&/债/.test(name)&&profile?.bond!==false&&!/混合|股票|货币|美元|港币|现钞|现汇|QDII|全球|海外|亚洲|亚太|国际|美国|新兴市场/i.test(name);
}
export function requireBond(profile){if(!supportedBond(profile))throw Error('本网页版仅支持可识别的人民币国内债基，不支持该基金或暂无法确认类型');return profile;}
export function migrateBondUniverse(data){
 data.inactiveFunds??={};let changed=false;
 data.watchlist=data.watchlist.filter(code=>{
  const profile=data.profiles?.[code]?.profile??Object.values(data.lastView??{}).filter(v=>v.code===code).sort((a,b)=>(b.checkedAt??'').localeCompare(a.checkedAt??''))[0];
  if(supportedBond(profile))return true;
  data.inactiveFunds[code]={name:profile?.name??code,reason:'旧记录不在债基支持范围内或类型待确认'};changed=true;return false;
 });
 return changed;
}
