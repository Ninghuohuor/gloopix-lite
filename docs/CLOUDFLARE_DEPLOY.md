# Cloudflare 零基础部署指南

本指南适合第一次把 GitHub 项目部署到 Cloudflare 的使用者。推荐先完成网站登录和生图，再按需开启“在网页里修改访问密码”。全程可以使用 GitHub 与 Cloudflare 网页操作，不需要先购买域名。

Cloudflare 只是运行网站的地方。**网站访问密码不是 Cloudflare 账号密码**，也不要把 Cloudflare 账号密码或 API Token 填进 Gloopix Lite。

Cloudflare 在这里**可以**托管网站、在服务端检查访问密码、转发图片模型请求，并在绑定 KV 后保存网页修改的密码。它**不会自动**提供免费的图片模型 Key，也不会把浏览器本地的图片历史同步到其他设备。这个项目没有注册账号、多人权限或云端图片库。

> Cloudflare 控制台会调整按钮名称。如果你看到的文字略有不同，请按“Workers & Pages → 你的 Worker → Settings”查找；页面末尾有对应的官方说明链接。

本指南根据本仓库的配置和 Cloudflare 官方文档编写；项目已通过本地构建检查，但这里的控制台步骤**尚未在你的 Cloudflare 账号中逐屏验证**。

## 开始前准备

1. 一个 GitHub 账号、一个 Cloudflare 账号。
2. 把 [Gloopix Lite 仓库](https://github.com/Ninghuohuor/gloopix-lite) **Fork 到自己的 GitHub 账号**。后面的编辑都在你自己的副本中进行，不要往原仓库提交个人配置。
3. 想好一个网站访问密码，并用密码管理器另外生成一段至少 32 个字符的随机字符串，作为 `SESSION_SECRET`。两者不能相同。公开部署不要使用 `123456` 等简单密码。
4. 准备一个你有权使用的图片模型 API Key。可以先不填，部署成功后再决定是保存在 Cloudflare，还是只保存在自己的浏览器。

这几个名称容易混淆：

| 名称 | 用途 | 放在哪里 |
| --- | --- | --- |
| `ACCESS_PASSWORD` | 进入网站的初始密码 | Cloudflare Worker 的 **Secret** |
| `SESSION_SECRET` | 给登录状态签名的随机字符串，不是登录密码 | Cloudflare Worker 的 **Secret** |
| `IMAGE_API_KEY` | 图片模型服务商的 Key；仅在选择“部署级共享 API”时需要 | Cloudflare Worker 的 **Secret** |
| `ACCESS_PASSWORD_KV` | 让网站读写“网页修改后的密码”的绑定名，不是密码 | Worker 的 **KV 绑定**；可选 |

不要把密码、API Key、`.env.local` 或 `.dev.vars` 上传到 GitHub。`.env.example` 只是字段示例，不能填写真实密钥后提交。

## 第一步：从 GitHub 创建 Worker

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，进入 **Workers & Pages**。这里要创建 **Worker**，不要选只部署静态文件的 Pages 项目。
2. 选择 **Create application（创建应用）**，在 **Import a repository（导入仓库）** 旁选择 **Get started**。
3. 选择 GitHub，按提示授权 Cloudflare 访问你的仓库，再选中你刚 Fork 的 `gloopix-lite`。
4. 生产分支选 `main`；项目根目录保持默认（仓库根目录）。Worker 名称先用 `gloopix-lite`，与仓库里的 `wrangler.jsonc` 的 `name` 保持一致。如果你的账号里已经有同名 Worker，请先在**自己的 Fork** 里把 `wrangler.jsonc` 的 `name` 改成新名称，再在 Cloudflare 使用完全相同的名称。
5. **Deploy command（部署命令）** 填 `npm run deploy`。**Build command（构建命令）** 可以留空，因为这个项目的部署命令已经会构建；如果界面要求必填，填 `npm run build`，只是会多构建一次。不要保留默认的 `npx wrangler deploy`，它不会替你执行项目的 OpenNext 构建。
6. 选择 **Save and Deploy**，等待页面显示部署成功，并记下 Cloudflare 给出的 `*.workers.dev` 地址。第一次打开时还不能登录是正常的：下一步才设置密码。

以后你把代码更新推送到自己仓库的 `main` 分支，Cloudflare 的 Git 集成会自动重新构建和部署。不要把本地 `localhost:3000` 当成公开网址。[Cloudflare 导入仓库说明](https://developers.cloudflare.com/workers/ci-cd/builds/)

## 第二步：设置网站访问密码

在 Cloudflare 打开 **Workers & Pages → 你的 Worker → Settings → Variables and Secrets**，选择 **Add**。下面两项都要选 **Secret** 类型，而不是普通文本变量：

1. 名称 `ACCESS_PASSWORD`，值填你准备的网站访问密码。
2. 名称 `SESSION_SECRET`，值填另一段至少 32 个字符的随机字符串。

按界面提示保存并 **Deploy**，然后打开 `*.workers.dev` 地址，用 `ACCESS_PASSWORD` 的值登录。`SESSION_SECRET` 不需要、也不应该输入到网站登录框。Secret 创建后通常无法在控制台重新查看原值，请妥善保管。[Cloudflare 设置 Secret 的说明](https://developers.cloudflare.com/workers/configuration/secrets/)

如果此时登录页提示“站点配置尚未完成”，但你已经设置了上面两项，仍可尝试登录：该提示也可能只是表示图片 API 还未配置。登录后在右上角 **设置 → API 与模型** 添加 API 即可。

## 第三步：配置图片 API

任选一种方式即可，不要把真实 API Key 写进 GitHub：

### 方式 A：只在自己的浏览器里添加（最容易开始）

登录网站后，打开右上角 **设置 → API 与模型**，添加 API 地址、API Key 和模型 ID，并保存。APIMart 请选 **APIMart 异步生图**，基础地址可填 `https://api.apimart.ai/v1`；OpenAI Images 兼容服务请选 **OpenAI Images 兼容**。具体地址、模型 ID 和支持的尺寸，以你的服务商文档为准。

这种方式不需要在 Cloudflare 填 `IMAGE_API_KEY`，但配置只留在当前浏览器：换设备、换浏览器或清除网站数据后要重新添加。不要在公用电脑上保存 API Key。

### 方式 B：由部署者提供默认 API（其他设备也能直接用）

在 Worker 的 **Settings → Variables and Secrets** 中添加：

- `IMAGE_API_KEY`：选 **Secret**，填你的图片服务商 API Key。
- `IMAGE_API_BASE_URL`：填服务商给你的 API 基础地址；APIMart 可填 `https://api.apimart.ai/v1`，不填则使用项目默认的 OpenAI 地址。
- `IMAGE_MODEL`：填真实模型 ID；不填则默认为 `gpt-image-2`。
- `IMAGE_API_PROTOCOL`：APIMart 填 `apimart`；OpenAI Images 兼容接口填 `openai` 或不填。

保存并按界面提示部署。部署级 API 供能登录这个网站的人使用，可能产生模型费用；请只把访问密码交给可信任的人，并在模型服务商处留意用量。不要把图片服务商的 Key 误填成 Cloudflare API Token。

## 第四步：需要网页改密时才绑定 KV

如果你只打算在 Cloudflare 控制台修改初始密码，可以跳过本节。**登录本身不需要 KV；只有“设置 → 访问密码”中的网页改密需要它。**KV 只保存改后密码的加盐哈希和会话版本，不保存原始密码、API Key 或生成图片。

1. 在 Cloudflare 控制台找到 **Workers KV**，选择 **Create instance**（有的界面写 Create namespace），取一个便于自己认出的名字，例如 `gloopix-lite-password`，然后创建。这个名字只是你在控制台看到的资源名称。[创建 KV 的官方步骤](https://developers.cloudflare.com/kv/get-started/)
2. 打开刚创建的 KV，复制它的 **Namespace ID**。这是 Cloudflare 生成的资源 ID，**不是密码，也不是 API Key**；不要凭空填写示例 ID。
3. 回到你自己的 GitHub Fork，打开 `wrangler.jsonc`，点铅笔图标编辑。在 `"assets": { ... },` 后、`"observability": { ... }` 前加入下面几行，把 `换成你自己的NamespaceID` 替换为刚复制的 ID：

   ```jsonc
   "kv_namespaces": [
     {
       "binding": "ACCESS_PASSWORD_KV",
       "id": "换成你自己的NamespaceID"
     }
   ],
   ```

   注意前后逗号；**`binding` 必须逐字写成 `ACCESS_PASSWORD_KV`**，但 KV 资源本身的名字可以自定。不要把密码或 API Key 写进这个文件。[KV 绑定格式说明](https://developers.cloudflare.com/kv/concepts/kv-namespaces/)
4. 在 GitHub 页面提交这次编辑到你自己仓库的 `main`。等待 Cloudflare 自动重新部署；完成后，进入 **Worker → Settings → Bindings**，确认能看到名为 `ACCESS_PASSWORD_KV` 的 KV 绑定。
5. 登录网站，进入 **设置 → 访问密码**，输入当前密码、新密码和确认密码，保存。然后在另一个浏览器窗口用新密码验证。KV 跨地区同步可能有短暂延迟，旧密码与旧会话的失效**不保证全球即时生效**。[KV 一致性说明](https://developers.cloudflare.com/kv/concepts/how-kv-works/)

也可以先在 **Worker → Settings → Bindings → Add → KV Namespace** 中手动绑定，变量名仍填 `ACCESS_PASSWORD_KV`。但这个仓库通过 Git 自动部署，建议同时把绑定写进自己 Fork 的 `wrangler.jsonc`，把它作为后续部署的配置依据。[Cloudflare Wrangler 配置说明](https://developers.cloudflare.com/workers/wrangler/configuration/)

**重要：**网页改密成功后，KV 里的新密码记录会优先于 `ACCESS_PASSWORD`。此时只在 Cloudflare 控制台修改 `ACCESS_PASSWORD`，不会覆盖网页改过的密码。不要删除整个 KV 命名空间来“试着重置”，否则可能影响以后部署。

## 部署后检查

按顺序确认：

1. `*.workers.dev` 能打开，并要求输入网站访问密码。
2. 正确密码能登录，错误密码不能登录。
3. 设置 API 后，可以进行一次小尺寸、单张图片的测试；模型服务商可能收费。
4. 生成结果可以预览、下载，在**同一浏览器**刷新后仍可从历史中打开。
5. 如果启用了 KV，再测试网页改密与重新登录。没有启用 KV 时，网页改密会给出配置提示，而不是假装修改成功。

不要求配置自定义域名、D1 或 R2。生成历史在浏览器的 IndexedDB 中，不会因绑定 KV 而自动同步到其他设备。Cloudflare 的额度与图片模型 API 的计费是两回事，正式使用前请分别查看服务商当前的价格和限制。

## 常见问题

| 现象 | 先检查什么 |
| --- | --- |
| Cloudflare 构建失败 | Worker 名称是否与 `wrangler.jsonc` 的 `name` 一致；Deploy command 是否为 `npm run deploy`；是否选了自己 Fork 的仓库和 `main` 分支。到 Worker 的 **Deployments / Builds** 查看具体报错。 |
| 登录提示未配置 | `ACCESS_PASSWORD` 与 `SESSION_SECRET` 是否加在 **Worker 运行时的 Settings → Variables and Secrets**，是否选 Secret 并完成部署；只填在 Build variables 中不够。 |
| 登录成功但不能生图 | 在网页的“API 与模型”设置中填 Key，或设置部署级 `IMAGE_API_KEY`；核对服务商的地址、模型 ID、协议、余额和所选尺寸。 |
| 点击网页“修改密码”提示未配置 | 检查 KV 是否已经创建并绑定；绑定变量名必须是 `ACCESS_PASSWORD_KV`，编辑 GitHub 文件后还要等自动部署成功。 |
| 改密后另一地区仍能暂时用旧密码 | KV 是最终一致的；等待缓存传播。若你要求严格的即时撤销，当前 KV 方案不满足。 |
| 换设备后看不到图片历史或浏览器 API 设置 | 这是预期行为：两者保存在原设备的浏览器里，不在 Cloudflare KV 中。 |

忘记网页修改后的密码时，不要只改 `ACCESS_PASSWORD`：KV 记录会继续覆盖它。部署者需要先在 Cloudflare 把 `ACCESS_PASSWORD` 换成新的强密码、把 `SESSION_SECRET` 换成新的随机字符串并部署，再到该 KV 的 **KV Pairs** 中只删除键 `access-password-v1`，等 KV 缓存传播后用新的初始密码登录。不要删除整个命名空间；如果怀疑密码泄露，应先暂停对外访问并考虑 KV 的传播延迟。这个操作会使之前的网页改密记录失效，请只在确实需要恢复访问时执行。

## 官方参考

- [Cloudflare：从 GitHub 导入 Worker](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Cloudflare：Git 构建和部署命令](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare：运行时 Secret](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare：创建与绑定 KV](https://developers.cloudflare.com/kv/get-started/)
- [OpenNext：Cloudflare 部署命令](https://opennext.js.org/cloudflare/get-started)
