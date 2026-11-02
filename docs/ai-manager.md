# Saltygram AI 管家（第一版）

## 使用

打开汉堡菜单 → AI 管家。默认后端地址已随前端发布。后端访问密钥在本机 `.data/AI-连接信息.txt`；所有设备使用相同地址、相同密钥并登录同一 Telegram 账号，即共享角色、记忆、对话和当前任务。

在「角色与 API 设置」填写公开 HTTPS API 地址（通常以 `/v1` 结尾）和 API Key，点击「读取模型」，选择支持工具调用的模型并保存。接口兼容 `GET /models` 与 `POST /chat/completions`；不支持模型列表的服务可以手填模型 ID。不同服务商的专有接口不在第一版范围内。AI 推理费用取决于你填写的服务商，与 Cloudflare 免费托管不是一回事。

可以读取会话资料、分页消息、搜索消息、话题和分组；创建或调整分组、排序分组、调整置顶；保存长期偏好。工具返回的消息有明确截断标记和分页游标。没有代发消息、删除聊天、退群工具。

## 架构和边界

Cloudflare Worker 负责 AI API 请求，SQLite Durable Object 按 Telegram ID 保存配置、任务、聊天记录、长期记忆和操作日志。使用 Workers Free 可用的 SQLite DO，不启用付费套餐或付费资源；免费额度耗尽时可能停止服务，不保证无限容量或可用性。

Telegram 工具由当前已登录的在线浏览器执行。不会上传 Telegram Session。跨设备通过工具租约领取任务，一次只处理一个工具；同一账号只运行一个任务。后台标签页暂停轮询，重新打开或切回后继续；关闭所有设备后不会继续读取 Telegram。AI 请求受到 Worker 后台生命周期和免费额度限制，长请求可能中断并需要重试。

写操作领取后失联，不自动重放，任务进入「需要核对执行结果」。分组更新校验读取时的版本，防止覆盖其他客户端的新修改。写入前的分组快照保存在日志，可导出；第一版没有一键恢复。停止任务无法撤回已经发往 Telegram 的操作。

后端访问密钥是个人后端的管理凭据，不是 Telegram 登录认证；Telegram ID 仅分区数据。不要把此密钥分享给其他人。AI Key 用 Worker Secret 中的 AES-GCM 密钥加密后保存，不返回前端。访问密钥只存在使用者本机存储中。AI 为分析而读取的 Telegram 文本会发给你选择的 AI 服务商；Telegram 消息中的指令按不可信数据处理，但模型仍可能判断错误。

## 本地开发

```powershell
npm install
npm run ai:prepare
npm run ai:dev
npm run dev
```

`ai:prepare` 仅在没有本地密钥时生成 `.data/ai-backend-secrets.json`，并写入 `.dev.vars`。本地后端端口 8787。连接时可改为 `http://localhost:8787`。局域网访问需前端和后端同时绑定局域网地址。

## 部署

`wrangler.jsonc` 定义 `saltygram-ai` Worker 和一个 SQLite Durable Object 绑定，不包含秘密。

```powershell
npm run ai:deploy
```

首次部署另需通过 Wrangler Secret 设置 `ADMIN_TOKEN` 与 `VAULT_KEY`（32 字节随机密钥的 Base64）；后续部署保留已有 Secrets。保管好原密钥，替换 VAULT_KEY 会导致已保存 API Key 无法解密。前端 `public/public/ai-backend.json` 只保存公开后端 URL。

现有 GitHub → Pages 自动构建只更新静态前端，后端代码修改仍需单独运行 `ai:deploy`。`.data`、`.dev.vars`、`.wrangler` 均忽略提交。

## 验证

`node --test` 包括 Worker 真实运行时的认证、加密 Key 不回传、账号隔离、模型列表、完整工具调用轮次、多设备租约，以及浏览器工具的分组版本冲突、快照和账号切换检查。没有真实服务商凭据时，模型响应使用测试替身，不声称通过了真实模型分析或真实 Telegram 写操作测试。
