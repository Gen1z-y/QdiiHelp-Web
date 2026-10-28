# QdiiHelp 网页版

独立于 Windows/PG 本地版的浏览器版本。GitHub Pages 提供静态页面；计算在浏览器 Web Worker 中运行；个人数据保存在当前浏览器的 IndexedDB。公开行情由单独部署的 Cloudflare Worker 转发。本目录可以直接作为独立 GitHub 仓库的根目录。

## 2026-10-28 发布状态

- 仓库：https://github.com/Gen1z-y/QdiiHelp-Web
- 公网页面：https://gen1z-y.github.io/QdiiHelp-Web/
- GitHub Pages 已启用 GitHub Actions，首次构建成功；首次部署因尚未启用 Pages 返回404，启用后仅重试部署已成功。公网浏览器初始化正常、空列表和本地存储提示正常，未捕获页面错误。
- **Cloudflare 行情服务尚未部署，当前不能刷新真实行情。** 维护者需先注册并登录 Cloudflare，部署 proxy/ 后配置 QDII_PROXY_URL。
- 每个新浏览器从空数据开始，未迁移本地版 PG 数据。

## 当前能力

- 保留原有界面与股票、指数、债基估算规则，支持基金添加/移除/分组/排序、刷新、披露持仓同步、完整历史曲线、对比及图片导出。
- 每个新浏览器从空基金列表开始；不包含原版 PG 数据和连接配置。
- 基金列表、分组、估算与净值记录、持仓快照和完整历史写入 IndexedDB；界面偏好及行情服务地址写入带项目路径前缀的 localStorage。可重建的部分行情缓存在内存及行情代理的公共缓存中。
- 独立设备或浏览器配置文件各自保存数据。同一配置文件的同一站点共用数据；用 Web Locks 阻止第二个标签页同时写入。项目路径加入命名空间可避免普通键名冲突，但同源不同路径不是安全边界。
- 浏览器数据面板支持 JSON 完整备份导出、校验后导入及申请持久存储。导入在一个事务中替换状态和完整历史；导入前另保存一份本机安全副本（同数据库内，不代替外部备份）。
- 网页关闭后计算与刷新停止；没有后台常驻服务、跨设备同步、注册登录或共享电脑上的账号级安全隔离。清理网站数据会删除本机记录，无痕浏览也不能作长期保存。

## 本地查看

需要 Node.js 22 或更高版本。项目无 npm 运行依赖，不需要 PostgreSQL，也无需 npm install。

```powershell
npm test
npm run preview
```

打开 `http://127.0.0.1:8790/qdiihelp-web/`。静态预览不加载原版服务或数据库；首次为空列表，真实刷新需要先部署并配置行情服务。端口被占用时设置 `QDII_PREVIEW_PORT` 为其他非正式端口，不要结束未知进程。预览拒绝 8787。

自动界面验证使用 `test/browser-smoke.mjs`，在独立临时浏览器会话中拦截外部请求并提供模拟行情；不连接真实数据源。需要另外安装 Playwright 和 Edge/Chromium，或通过 `PLAYWRIGHT_MODULE` 指向已有 Playwright 模块。

```powershell
$env:PLAYWRIGHT_MODULE = '你的Playwright模块路径'
node test/browser-smoke.mjs
```

## 发布行情服务

1. 登录自己的 Cloudflare 账号，在 `proxy/wrangler.jsonc` 的 `ALLOWED_ORIGINS` 中填写准确的 Pages 来源，例如 `https://gen1z-y.github.io`，不要包含仓库路径。多个来源用英文逗号分隔。开发来源需自行明确添加，正式配置不默认开放本机来源。
2. `RATE_LIMITER` 绑定已写在配置中，默认每个 IP 每个 Cloudflare 位置约 600 次/分钟。按实际使用调整；该限制近似、按位置执行，不是严格的全局配额。共享出口的同事共用 IP 限额。
3. 在本目录的 `proxy/` 中使用已安装的 Wrangler 或 `npx wrangler deploy` 部署。按官方流程登录，凭据只保存在本机，不写入仓库。服务无数据库绑定。
4. 保存返回的 `https://…workers.dev` 地址，检查带允许的 Origin 请求 `/health` 返回 `qdiihelp-public-quotes`。

代理只接受 GET 和固定数据源/路径/参数，拒绝任意地址、凭据、重定向、过大的响应，使用超时、60秒公共缓存和限流。没有 `RATE_LIMITER` 绑定会拒绝行情请求。Origin 校验不是用户身份认证，不能阻止伪造 Origin 的脚本；限流、平台配额和部署账号监测仍需维护者管理。费用、可用额度以及第三方数据使用条件以部署时各平台约定为准。

代理不保存用户业务状态，不接收备份、基金分组或完整自选列表。查询会携带单次所需的公开基金/证券代码；代理与上游仍可据请求获知查询对象，平台也可能记录 IP 等访问元数据。Worker 应用日志默认关闭。

## 发布 GitHub Pages

1. 创建独立仓库（例如 `QdiiHelp-Web`），将本目录内容放在仓库根目录，包含隐藏的 `.github` 文件夹。不要上传整个本地版目录。
2. 若用 GitHub Free，通常需要公开仓库。进入仓库 Settings → Pages，将 Source 设为 GitHub Actions。
3. 在 Settings → Secrets and variables → Actions → Variables 新增普通仓库变量 `QDII_PROXY_URL`，值为上一步的 Worker HTTPS 地址。它是公开的服务地址，不是密钥。
4. 推送 main，或手动运行“发布网页版”工作流。工作流先运行单元测试，再构建、发布 `dist/`。地址通常为 `https://用户名.github.io/仓库名/`。代码使用相对资源路径，无须固定仓库名。
5. 首次访问应直接使用部署的行情服务；也可在“浏览器数据”中自行指定地址，本机覆盖设置优先于部署默认值。

也可以先修改 `site/deploy-config.json` 中的 `proxyUrl`，再执行 `npm run build`，将 `dist/` 用于其他静态托管。构建产物不包含代理源码、测试、README 或部署凭据。

## 验证与限制

详见 `VERIFICATION.md`。GitHub Pages 已上线并验证页面初始化；Cloudflare 行情代理仍未上线。真实数据源在 Cloudflare 出口的反爬、地区限制及所有市场的实际行情仍需上线后验证；单个数据源失败会显示错误或保留旧数据，不能当作零收益。

尚未提供 PG 全量迁移入口。不能把原版 `state.json`、归档索引或数据库备份直接当作浏览器 JSON 导入；两版格式不同。此版本从空列表开始，不读取原版数据库。后续需要迁移时，应另做显式导出和格式转换。

估算仅供参考，以基金公司公布为准。许可证见 LICENSE。

## 维护资料

- [GitHub Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Cloudflare 限流绑定](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [IndexedDB 事务完成事件](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event)
- [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
