import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import './policy-version.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),dist=path.join(root,'dist');
// The fixed output is always inside this standalone project.
if(path.dirname(dist)!==root)throw Error('Invalid build path');
await fs.rm(dist,{recursive:true,force:true});await fs.cp(path.join(root,'site'),dist,{recursive:true});
const config=JSON.parse(await fs.readFile(path.join(dist,'deploy-config.json'),'utf8'));
if(process.env.QDII_PROXY_URL)config.proxyUrl=process.env.QDII_PROXY_URL;
if(config.proxyUrl){const u=new URL(config.proxyUrl);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('部署的行情服务必须为 HTTPS 地址');}
await fs.writeFile(path.join(dist,'deploy-config.json'),JSON.stringify(config)+'\n');
console.log('静态发布文件：'+dist);
