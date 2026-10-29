import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function updatePolicyVersion(){
 const root=new URL('../site/lib/',import.meta.url),name=new URL('forecast-policy.mjs',root);
 const original=await fs.readFile(name,'utf8'),hash=createHash('sha256');
 for(const file of ['forecast-policy.mjs','calendar.mjs','estimation-rules.mjs','model.mjs','provider.mjs','bond-reference.mjs','bond-forecast.mjs','bond-adaptive.mjs','bond-disclosure.mjs','bond-factors.mjs']){
  const text=await fs.readFile(new URL(file,root),'utf8');hash.update(file);hash.update(text.replace(/FORECAST_POLICY_VERSION='[a-f0-9]+'/g,"FORECAST_POLICY_VERSION='BUILD_VERSION'"));
 }
 const next=original.replace(/FORECAST_POLICY_VERSION='[a-f0-9]+'/,"FORECAST_POLICY_VERSION='"+hash.digest('hex').slice(0,16)+"'");if(next!==original)await fs.writeFile(name,next);
}
await updatePolicyVersion();
