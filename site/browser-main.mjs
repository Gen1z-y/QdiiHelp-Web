import {initialize,browserFetch} from './browser-client.mjs';
const banner=document.querySelector('#browserStatus');
const panel=document.createElement('dialog');panel.id='browserData';
panel.innerHTML=`<div class="dialoghead"><h2>本机数据说明</h2><button type="button" id="closeBrowserData">关闭 ×</button></div>
<p>债基列表、历史净值及估算记录只保存在当前浏览器。不同电脑互不影响；同一浏览器配置文件共用数据，不自动跨设备同步。</p>
<p>本版不提供备份导入导出。清除网站数据、使用无痕浏览或更换浏览器会导致数据无法保留；关闭网页会停止未完成的刷新。</p>
<p>行情服务由站点统一配置，无需填写。服务只接收公开基金或证券代码，不接收你的完整列表或分组；服务商可能记录查询及访问元数据。</p>
<button id="persistBrowserData" type="button">请求保留本机数据</button><p id="browserDataMessage" role="status" aria-live="polite"></p>`;
document.body.append(panel);
document.querySelector('#closeBrowserData').onclick=()=>panel.close();
document.querySelector('#persistBrowserData').onclick=async()=>{try{const ok=await navigator.storage?.persist?.();document.querySelector('#browserDataMessage').textContent=ok?'浏览器已允许持久保存，手动清除网站数据仍会删除记录。':'浏览器未授予持久保存。';}catch(e){document.querySelector('#browserDataMessage').textContent=e.message;}};
let busy=false;
window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
try{
 const config=await fetch(new URL('./deploy-config.json',import.meta.url),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('无法读取部署配置');return r.json();});
 if(!config.proxyUrl)throw Error('站点行情服务尚未配置');
 await initialize(config.proxyUrl);
 const button=document.createElement('button');button.textContent='数据说明';button.type='button';button.onclick=()=>panel.showModal();document.querySelector('#headerActions').append(button);
 banner.textContent='债基网页版 · 数据保存在当前浏览器，关闭网页后停止更新。';
 await import('./app.js');await import('./history.js');await import('./inputs.js');
 const poll=async()=>{try{const state=await(await browserFetch('/api/runtime')).json();busy=state.busy;banner.textContent='债基网页版 · '+(busy?'正在处理数据，请保持页面打开。':state.saveError?'保存失败：'+state.saveError:'数据保存在当前浏览器，关闭网页后停止更新。')+(state.inactiveFundCount?' 已停用 '+state.inactiveFundCount+' 只非债基或类型待确认的旧基金，原记录仍在本机。':'');}catch(e){banner.textContent=e.message;}};
 setInterval(()=>void poll(),4000);void poll();
}catch(error){banner.textContent='无法打开网页版：'+error.message;banner.setAttribute('role','alert');document.querySelectorAll('.toolbar button,.toolbar input,.toolbar select').forEach(el=>el.disabled=true);}
