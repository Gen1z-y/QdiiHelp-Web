import {initialize,preferences,browserFetch,configureProxy} from './browser-client.mjs';
const banner=document.querySelector('#browserStatus');
const panel=document.createElement('dialog');panel.id='browserData';
panel.innerHTML=`<div class="dialoghead"><h2>浏览器数据</h2><button type="button" id="closeBrowserData">关闭 ×</button></div>
<p>基金列表、历史净值及估算记录只保存在当前浏览器。不同电脑互不影响；同一浏览器配置文件共用数据，不自动跨设备同步。</p>
<p>清除网站数据或结束无痕会话可能丢失记录，请定期导出备份。关闭网页会停止未完成的刷新。</p>
<form id="proxyForm"><label for="proxyUrl">行情服务地址</label><input type="url" id="proxyUrl" placeholder="https://你的服务.workers.dev" autocomplete="off"><button type="submit">保存地址</button></form>
<p class="muted">服务只接收公开基金或证券代码，不接收你的完整列表、分组或业务备份。服务及数据源仍可获知所查询代码，服务商可能记录访问元数据。</p>
<div class="browserDataActions"><button id="exportBrowserData" type="button">导出完整备份</button><button id="importBrowserData" type="button">导入备份</button><button id="persistBrowserData" type="button">请求保留本机数据</button></div>
<input type="file" accept=".json,application/json" id="backupFile" hidden><p id="browserDataMessage" role="status" aria-live="polite"></p>`;
document.body.append(panel);
const message=document.querySelector('#browserDataMessage');
const action=async work=>{try{message.textContent='正在处理…';await work();}catch(error){message.textContent=error.message;}};
const json=async(url,options)=>{const response=await browserFetch(url,options),data=await response.json();if(!response.ok)throw Error(data.error);return data;};
document.querySelector('#closeBrowserData').onclick=()=>panel.close();
document.querySelector('#proxyForm').onsubmit=event=>{event.preventDefault();void action(async()=>{const value=document.querySelector('#proxyUrl').value.trim();await configureProxy(value);preferences.setItem('proxy-url',value);message.textContent='行情服务地址已保存，可关闭此窗口并刷新数据。';});};
document.querySelector('#exportBrowserData').onclick=()=>void action(async()=>{
 const data=await json('/api/browser/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='qdiihelp-browser-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);message.textContent='备份已交给浏览器下载，请妥善保管。';
});
document.querySelector('#importBrowserData').onclick=()=>document.querySelector('#backupFile').click();
document.querySelector('#backupFile').onchange=event=>void action(async()=>{
 const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>80*1024*1024)throw Error('备份不能超过80MB');
 const input=JSON.parse(await file.text());const {validateBackup}=await import('./browser-store.mjs');validateBackup(input);
 if(!confirm('将用备份中的 '+input.state.watchlist.length+' 只基金和历史数据替换当前浏览器数据。建议先导出当前备份。是否继续？')){message.textContent='已取消导入。';return;}
 await json('/api/browser/import',{method:'POST',body:JSON.stringify(input)});message.textContent='导入成功，正在重新加载…';location.reload();
});
document.querySelector('#persistBrowserData').onclick=()=>void action(async()=>{const ok=await navigator.storage?.persist?.();message.textContent=ok?'浏览器已允许持久保存；手动清除数据仍会删除，请保留备份。':'浏览器未授予持久保存，请定期导出备份。';});
let busy=false;
window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
try{
 const config=await fetch(new URL('./deploy-config.json',import.meta.url),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('无法读取部署配置');return r.json();});
 let proxy=config.proxyUrl||'';try{proxy=preferences.getItem('proxy-url')??proxy;}catch{}
 document.querySelector('#proxyUrl').value=proxy;
 await initialize(proxy);
 const button=document.createElement('button');button.textContent='浏览器数据';button.type='button';button.onclick=()=>panel.showModal();document.querySelector('#headerActions').append(button);
 banner.textContent='网页版 · 数据保存在当前浏览器，关闭网页后停止更新。';
 if(!proxy){banner.textContent+=' 请先设置行情服务地址。';panel.showModal();}
 await import('./app.js');await import('./history.js');await import('./global-markets.js');await import('./inputs.js');
 const poll=async()=>{try{const state=await json('/api/runtime');busy=state.busy;banner.textContent='网页版 · '+(busy?'正在处理数据，请保持页面打开。':state.saveError?'保存失败：'+state.saveError:'数据保存在当前浏览器，关闭网页后停止更新。');}catch(error){banner.textContent=error.message;}};
 setInterval(()=>void poll(),4000);void poll();
}catch(error){banner.textContent='无法打开网页版：'+error.message;banner.setAttribute('role','alert');document.querySelectorAll('.toolbar button,.toolbar input,.toolbar select').forEach(el=>el.disabled=true);}
