// Synchronous SHA-256 for the existing evidence fingerprints; no Node runtime.
const K=new Uint32Array(64);let count=0;
for(let n=2;count<64;n++){let prime=true;for(let d=2;d*d<=n;d++)if(n%d===0){prime=false;break;}if(prime)K[count++]=Math.floor((Math.cbrt(n)%1)*2**32);}
const rotate=(v,n)=>(v>>>n)|(v<<(32-n));
export function sha256(value){
 const input=typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value);
 const bytes=new Uint8Array(Math.ceil((input.length+9)/64)*64);bytes.set(input);bytes[input.length]=128;
 const view=new DataView(bytes.buffer);view.setUint32(bytes.length-8,Math.floor(input.length/2**29));view.setUint32(bytes.length-4,(input.length*8)>>>0);
 const hash=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),w=new Uint32Array(64);
 for(let block=0;block<bytes.length;block+=64){
  for(let i=0;i<16;i++)w[i]=view.getUint32(block+i*4);
  for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=w[i-16]+(rotate(x,7)^rotate(x,18)^(x>>>3))+w[i-7]+(rotate(y,17)^rotate(y,19)^(y>>>10));}
  let [a,b,c,d,e,f,g,h]=hash;
  for(let i=0;i<64;i++){const t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
  for(const [i,v] of [a,b,c,d,e,f,g,h].entries())hash[i]+=v;
 }
 return [...hash].map(v=>v.toString(16).padStart(8,'0')).join('');
}
export const randomUUID=()=>globalThis.crypto.randomUUID();
export function createHash(algorithm){if(algorithm!=='sha256')throw Error('Unsupported hash');let chunks='';return {update(value){chunks+=typeof value==='string'?value:new TextDecoder().decode(value);return this;},digest(format){if(format!=='hex')throw Error('Unsupported encoding');return sha256(chunks);}};}
