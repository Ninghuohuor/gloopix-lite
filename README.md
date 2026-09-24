# Gloopix Lite

Gloopix Lite 是一个私人 AI 生图网站极简版。它保留访问密码保护、基础信息设置、API 与模型设置、文本生图、参考图生图、预览与下载。

图片历史不需要服务端数据库；网页改密在 Cloudflare 上需要可选的 KV。项目不需要用户系统、积分、充值、对象存储或常驻服务器，可部署到 Cloudflare Workers；具体额度和费用以 Cloudflare 及图片 API 服务商的当前说明为准。

第一次部署？直接按 [Cloudflare 零基础部署指南](docs/CLOUDFLARE_DEPLOY.md) 操作。

## 功能边界

- 单站点、单访问密码
- 登录后可在“设置 → 访问密码”中修改密码；旧密码和此前的登录会话将失效（Cloudflare KV 跨区域传播可能有短暂延迟）
- GPT Image 2 默认模型，可在页面中添加和切换模型；每个模型可独立设置质量、尺寸能力与默认值
- 尺寸按模型管理：已知模型使用内置模板，未知模型默认使用“自动”，并支持按服务商文档添加自定义 API 尺寸参数
- 支持 OpenAI Images 兼容接口与 APIMart 异步图片接口；两者在 API 设置中分别选择
- 可在页面中设置网站名称、浏览器标题、简介、Logo 文字、Logo 图片与标签页图标
- 网站名称默认同步到左上角 Logo 文字和浏览器标题；单独改过的文字保持独立
- API 与模型既可由部署环境统一配置，也可由使用者在右上角设置；支持添加多个 API，每个 API 可配置多个模型
- 页面设置保存在当前浏览器；基础信息图片使用 IndexedDB Blob 存储，不写入项目或服务端
- 一张可选参考图，支持 PNG、JPEG、WebP，最大 8MB
- 单次可选择生成 1–4 张图片
- 生成结果以 Blob 写入当前浏览器的 IndexedDB，刷新或重启浏览器后仍可查看和下载
- 本地历史默认最多使用 500MB 或浏览器为当前网站分配额度的 80%（取较小值），达到上限时自动删除最早记录
- 不依赖原 Gloopix 服务、数据库、账号、上传目录、域名或密钥

其他服务商的异步任务接口仍需单独适配。

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
cp .env.example .env.local
npm run dev
```

编辑 `.env.local`，至少填写站点访问配置：

```dotenv
ACCESS_PASSWORD="你的访问密码"
SESSION_SECRET="一段至少 32 位的随机字符串"
```

打开 `http://localhost:3000`。进入工作台后，可在右上角“设置”中修改当前浏览器的基础信息，或添加一个或多个 API，并分别填写地址、API Key、接口路径与模型；也可以继续使用 `.env.local` 中的 `IMAGE_API_*` 作为部署级默认配置。不要把 `.env.local` 提交到 Git。

本机运行时，网页修改的访问密码以加盐哈希保存在 `.data/access-password.json`（可用 `ACCESS_PASSWORD_STORE_FILE` 改位置），不会写回 `.env.local`。此文件不应提交或分享。修改后环境变量中的初始密码不再可用于登录；如需通过删除密码记录文件恢复初始密码，应同时轮换 `SESSION_SECRET`，让此前的登录会话失效。请保护该文件并做好备份。

## API 兼容要求

文本生图会向 `IMAGE_API_GENERATIONS_PATH` 发送 OpenAI Images 风格的 JSON 请求。参考图生图会向 `IMAGE_API_EDITS_PATH` 发送 multipart 请求，字段包括 `model`、`prompt`、`size`、`n`、`response_format` 和 `image`。

浏览器中添加 APIMart API 时，选择“APIMart 异步生图”，地址填 `https://api.apimart.ai/v1`。该接口使用 `/images/generations` 提交任务，参考图作为 `image_urls` 一同提交，再通过 `/tasks/{task_id}` 等待结果。`gpt-image-2` 内置 APIMart 文档列出的 15 种比例；分辨率单独选择 1K、2K 或 4K。未知模型默认只提供自动尺寸和 1K，按该模型文档再调整。生成结果会立即下载并写入浏览器本地历史，不依赖 APIMart 临时图片链接长期有效。

选择多张图片时，APIMart 适配器为每张图片独立提交一个任务，再汇总结果，确保实际返回数量与用户选择一致。

若通过部署环境配置 APIMart，把 `IMAGE_API_PROTOCOL` 设为 `apimart`，并填写对应的 `IMAGE_API_BASE_URL`、`IMAGE_API_KEY` 与 `IMAGE_MODEL`。`IMAGE_API_PROTOCOL` 默认为 `openai`，旧配置无需修改。

模型开启“质量档位”后，请求会携带 `quality`；开启“尺寸参数”后，生成页只显示该模型配置的尺寸。选择“自动”时不会主动发送 `size`，由上游决定默认尺寸；自定义尺寸会把填写的真实参数原样发送。不同中转站对尺寸和质量值的兼容性不同，应以其接口文档为准。

上游应返回以下任一结构：

```json
{ "data": [{ "b64_json": "..." }] }
```

```json
{ "data": [{ "url": "https://..." }] }
```

若返回 URL，服务端会立即读取并转换为 data URL，再交给浏览器预览与下载。图片不会写入本地磁盘。

不同中转站支持的尺寸可能不同。用 `IMAGE_SIZE_SQUARE`、`IMAGE_SIZE_LANDSCAPE` 和 `IMAGE_SIZE_PORTRAIT` 调整发送值。

## 本地历史

右上角的历史入口显示当前浏览器保存的生成记录、图片数量和占用空间，并支持单条删除、全部清空、预览与下载。图片使用 Blob 保存，不使用 Base64，因此不会产生 Base64 约 33% 的额外体积。应用会尝试申请浏览器持久化存储，但本地历史仍然只属于当前设备、当前浏览器和当前网站域名；清除网站数据、使用无痕模式、换浏览器或换域名时不会自动迁移。

## Cloudflare Workers 部署

第一次部署请直接看 [Cloudflare 零基础部署指南](docs/CLOUDFLARE_DEPLOY.md)：从 GitHub 导入、设置访问密码、配置图片 API，到可选的 KV 网页改密，都有逐步说明和排错方法。不需要先购买域名，也不需要在网站页面填写 Cloudflare 账号信息。

本仓库使用 OpenNext 构建 Workers。图片历史只保存在访问者当前浏览器；KV 只在需要“网页修改访问密码”时使用。Cloudflare 与模型 API 的额度、费用分别计算，请以服务商当前页面为准。

## 检查

```bash
npm test
npm run lint
npm run build
```

测试使用模拟上游，不会产生模型费用。真实端到端测试需要你自己的 API Key，并可能产生费用。

## 安全说明

- 访问密码是在服务端校验的，成功后写入 HttpOnly、SameSite=Strict 的签名 Cookie。
- `SESSION_SECRET` 用于签名会话，必须与访问密码不同。
- 环境变量中的 API Key 不会进入客户端 bundle 或公开配置接口。
- 页面中填写的 API Key 保存在当前浏览器的 localStorage，生成时会发送给你部署的 Gloopix Lite 服务端，再由服务端请求模型服务商；不要在不受信任的共享设备上保存。
- 这是一层适合私人站点的共享密码保护，不是多用户身份系统。
- 参考图和生成图会经过 Worker 内存与模型服务商。请阅读你所用服务商的隐私与保留政策。
