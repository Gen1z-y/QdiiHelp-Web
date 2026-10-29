export function forecastHistory(records,code){
 return Object.entries(records).filter(([key])=>key.startsWith(code+':')).map(([key,r])=>({
  date:key.slice(7),value:Number.isFinite(r.forecast?.model?.dailyReturn)?r.forecast.model.dailyReturn:r.reconstruction?.dailyReturn??null,
  reconstructed:!Number.isFinite(r.forecast?.model?.dailyReturn)&&Number.isFinite(r.reconstruction?.dailyReturn),
  actual:Number.isFinite(r.actual?.dailyReturn)?r.actual.dailyReturn:null,
  capturedAt:r.forecast?.calculatedAt??r.firstForecastAt??r.reconstruction?.calculatedAt??null,
  actualSeenAt:r.firstActualSeenAt??null
 })).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,90);
}
