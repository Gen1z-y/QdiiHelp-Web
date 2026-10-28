const cache=new Map();
export function readQuoteCache(key,ttl){const c=cache.get(key);return c&&Date.now()-c.time<ttl?c:null;}
export function writeQuoteCache(key,data,time=Date.now()){if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,{data,time});}
export function clearQuoteCache(){cache.clear();}
// Start the backup early on failure, or after a short head start for the primary.
export async function hedged(primary,backup,delay=2500){
 let timer,start;const trigger=new Promise(resolve=>{start=resolve;timer=setTimeout(resolve,delay);});
 const first=Promise.resolve().then(primary).catch(error=>{start();throw error;});
 let finished=false;
 const second=trigger.then(()=>{if(finished)return new Promise(()=>{});return backup();});
 try{return await Promise.any([first,second]);}
 catch(error){throw error.errors?.at(-1)??error;}
 finally{finished=true;clearTimeout(timer);}
}
