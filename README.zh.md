# dsh-codex-oauth — Fast 增强版 fork

这是 [pk604437000 的 fork](https://github.com/pk604437000/dsh-codex-oauth)，版本为 **0.3.3-fast.0**，基于 [eons2long/dsh-codex-oauth](https://github.com/eons2long/dsh-codex-oauth) 已校验的 npm 0.3.1 发布版，增加可持久化的 Standard / Fast 选择，并保留非法 `ultra` 推理档位过滤。上游 npm 包没有这些 Fast 控件。[发布版来源与校验记录](docs/upstream/npm-0.3.1.md)。

[English](README.md) | 中文

通过 [OpenAI 官方的直接 OAuth 接入](https://developers.openai.com/siwc/token-sharing-open-source)，在 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 中使用 ChatGPT 套餐模型。0.3 版本直接实现 DSH 官方 `LlmAdapter`，不再依赖 `pi-ai` 或 `dsh-llm-pi-ai`。

插件负责浏览器授权、账户选择、自动刷新凭据、查询当前账户的模型，以及转换 Responses 流式响应。支持 DSH 工具调用、图片、对话历史和完整加密推理状态的回传。文件系统、工具执行、权限和上下文压缩由 DSH 提供。

## 要求与安装

要求 Node.js 22 及以上，以及与 DSH `0.2.0-rc.2` 兼容的 `dsh-llm` 和 `dsh-atomic-write`。0.3 不再兼容 DSH 0.1 的旧适配器接口。自动化集成也覆盖当前 DSH `0.2.1-rc.5` 的宿主依赖；peer 范围明确接受这个已验证的预发布版本，兼容严格 npm 消费者。

此 Fast 预发布版未发布到 npm。先构建 fork，再把本地安装包添加到实际使用的 profile；已有源码目录时跳过 clone：

```bash
git clone --branch feat/fast-mode https://github.com/pk604437000/dsh-codex-oauth.git
cd dsh-codex-oauth
npm ci --ignore-scripts
npm test
npm pack --ignore-scripts
dsh plugin --profile web add -w "file:$PWD/dsh-codex-oauth-0.3.3-fast.0.tgz"
```

安装后重启原来的 DSH Web 进程，并刷新已有 GUI 地址。TUI 使用者将 `--profile web` 换成 `--profile dsh-tui`，再重启对应 profile。只构建和测试此仓库不会改变正在运行的 DSH 安装。

使用安装包也能避免升级已有源码安装时，pnpm 继续复用旧本地目录的文件列表。

如果 TUI 同时加载了内置订阅 OAuth 模块，需要从 `dsh-tui-auth` 中排除 `openai-codex`，由本插件提供该 provider。在 `$DSH_HOME/profiles/dsh-tui/cordis.patch.yml`（默认 `~/.dsh/profiles/dsh-tui/cordis.patch.yml`）中配置：

```yaml
- id: dsh-tui-auth
  config:
    providers: [anthropic, xai, meta]
```

保留该配置块已有的 `credentialsFile` 和 `modelOverrides`；provider 列表只保留当前 TUI 支持的条目。更新插件后重启 profile。

## 登录与选择模型

```bash
dsh plugin --profile dsh-tui exec dsh-openai-codex login
dsh plugin --profile dsh-tui exec dsh-openai-codex status
dsh plugin --profile dsh-tui exec dsh-openai-codex models --refresh
```

在浏览器中授权应用，并允许使用 ChatGPT 套餐。回调监听 `127.0.0.1:1455`，端口被占用时改用其他本机端口。新流程需要浏览器授权，不支持 `--device-code`。

Web 界面打开 **设置 → OpenAI Codex**，点击 **Continue with ChatGPT**，授权后返回。设置页支持账户选择、取消登录、退出登录、刷新模型列表和[管理用量](https://chatgpt.com/settings/usage)。如果只授权了账户身份，会单独显示未授权套餐使用；再次登录即可请求该授权。

在 DSH 模型选择器中选择 `openai-codex`。模型列表直接来自当前账户，因此账户支持 GPT-6.1 Sol 等新模型时，无需更新插件内的静态列表。插件保留服务端名称与排序，缓存五分钟，也可手动刷新。

## 每个会话单独设置 Standard / Fast

每个可编辑的本地 Codex 会话，在**输入栏、模型选择附近**有“服务档位”：**继承默认 / Standard / Fast**。A 会话选 Fast、B 会话选 Standard，互不影响，也不改变各自模型或推理强度。刷新页面、重启后保留；后续普通调用、工具续轮以及自动/手动压缩按本会话选择发送，已发出的请求保持原档位。非 Codex 会话隐藏控件；未绑定会话或原生只读/寻址子会话不会误写本机设置。

原来的 **设置 → OpenAI Codex → Default service tier** 只作为未指定会话的默认值，以及没有 sessionId 的直接调用的默认值。已显式设为 Standard 的会话不会随全局默认切成 Fast；选择“继承默认”删除本会话覆盖。保存中禁用控件，保存失败保留已确认值并显示错误。宿主缺少持久化编辑器时禁用写入。

Web 和 TUI 都可在实际 profile 的 `cordis.patch.yml` 中加入以下配置，保留其他已有配置：

```yaml
- id: llm-codex-oauth
  config:
    serviceTier: default
    sessionServiceTiers:
      SESSION_ID_A: fast
      SESSION_ID_B: default
```

示例键替换为真实会话 ID；Web 控件会自动使用正确 ID。覆盖值保存在本 Host/profile 的插件配置中，不随单独的会话日志导出。分叉/子会话具有新 ID，未设置时继承 profile 默认，不自动复制父会话选择；卸载或归档会话不会清除已保存选择。

持久化配置值仅为 `default` / `fast`；会话 UI/API 的 `inherit` 动作用于删除本键。`standard`、`priority`、`ultrafast` 不是配置值。Fast 仍发送 `service_tier: "priority"`，对应目录 `id: "priority", name: "Fast"`；Standard 发送 `service_tier: "default"`。每次请求只读取一次 **本会话显式覆盖 → profile 默认 → Standard**，普通调用、工具续轮和压缩一致。其他会话的显式选择、其他 provider、模型 ID、推理强度及已发出的请求均不改变。

Fast 会增加套餐额度或付费额度的消耗，具体以 [OpenAI 当前费率及资格说明](https://learn.chatgpt.com/docs/agent-configuration/speed) 为准。选择器表示的是**请求的档位**，不代表账户/模型资格已验证，也不证明服务端实际使用 Fast。服务端可能返回错误或降档；插件显示错误，不静默重发 Standard，也不切换 API Key 计费。自动化测试使用 mock，普通测试命令不会发送真实模型请求，因此不验证真实 Fast 资格。

**2026-11-06 真实验证：**经用户明确同意，仅发送了一次使用目录 `priority` ID 的短请求。请求完成，但实际返回 `service_tier: "default"`，因此尚未证实 Fast 处理或加速。该次检查后保留了 Standard；参数被接受不等于实际 Fast 生效。[真实兼容性记录](https://github.com/pk604437000/dsh-codex-oauth/blob/feat/fast-mode/docs/verification/2026-11-06-priority-wire-fix.md)。

单个会话恢复 Standard，直接在该会话选择 Standard。若要全部恢复，将 profile 默认设为 `default` 并清空 `sessionServiceTiers` 字典；只改默认不会清除显式 Fast 覆盖。完整回滚时重新安装旧版本并恢复对应 profile 备份，再重启。服务档位设置不会迁移或转换 OAuth 凭据。

## 多账户与凭据

```bash
dsh plugin --profile dsh-tui exec dsh-openai-codex login --new-account
dsh plugin --profile dsh-tui exec dsh-openai-codex accounts
dsh plugin --profile dsh-tui exec dsh-openai-codex use <client-id>
dsh plugin --profile dsh-tui exec dsh-openai-codex logout
```

每个账户保留官方签发的应用注册信息，再次授权复用该注册并校验账户身份。退出登录会尝试撤销远程会话、清除当前账户的本地 token，并保留注册信息供下次登录使用；其他账户不受影响。取消正在进行的登录会保留原先的账户。

凭据存储在 `$DSH_HOME/.openai-codex-auth.v2.json`，默认 `~/.dsh/.openai-codex-auth.v2.json`。版本化文件保存稳定的主机标识、账户注册和当前账户。采用原子写入；POSIX 系统下目录仅所有者可访问，文件权限为 `0600`。跨进程文件锁确保刷新 token 时不会重复使用已轮换的凭据。临时刷新失败保留凭据，明确失效的授权会被清除。

**从 0.2 升级：需要重新登录。** 旧 `.openai-codex-auth.json` 中的凭据无法用于新的推理路由，原生登录不会覆盖旧文件；独立的额度登录会复用并刷新该文件。插件不导入或修改 `~/.pi/agent/auth.json` 与 `~/.codex/auth.json`。

## 支持范围与限制

普通调用和历史压缩调用都使用 DSH 会话标识设置稳定的 `session-id`、`x-client-request-id` 请求头，以保持网关的会话关联并支持提示缓存复用；缓存命中仍不保证。没有会话标识的调用不发送这两个请求头。

使用 OAuth 请求 `https://api.openai.com/v1/responses`，每次设置 `store: false`、`stream: true`，并通过 `input` 发送所需历史。无需 OpenAI API Key。资格和应用额度由 ChatGPT 套餐控制，插件不会自动切换到 API Key 计费。

- DSH 函数工具在本地执行，工具定义放在 Responses namespace 中。所有提供的工具定义都会发送；此路由不支持原生 Responses `tool_search`。
- 文本和图片通过 DSH 附件服务处理。文件和已卸载图片以本地句柄提供给 DSH 工具，不会上传到 OpenAI Files API。
- 推理档位和上下文信息使用模型目录提供的元数据。只有同一账户、同一模型且内容未改变的块才复用原生 replay 状态；编辑或压缩后的消息使用剩余的 DSH 历史。
- 设置 `temperature`、`maxTokens` 或 `stop` 会返回 `UNSUPPORTED_OPTION`，因为 ChatGPT 套餐路由不支持这些参数。请在 agent 配置中留空。
- DSH 历史摘要调用（`purpose: compaction`）接受压缩器自动传入的 `maxTokens` 预算，但不将它发送给 API。自动和手动 DSH 压缩可以执行；此路由不保证压缩器配置的摘要输出上限。摘要指令追加在原有历史之后，以保留可复用的请求前缀。
- 仅完整完成的响应视为成功。额度不足、未完整完成和连接中断分别处理；账户额度耗尽不会自动重试，临时服务故障遵循 DSH 重试策略。
- 本适配器不提供 Responses 托管的图片生成、文件搜索、Code Interpreter、电脑操作、MCP 或音视频能力。DSH 本地能力仍可通过函数工具使用。

官方限制见 [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)。

## 开发与验证

### 额度显示

Web 设置页提供英文额度条和重置时间。TUI 状态栏显示简短摘要，`/codex-usage` 展开额度窗口及更新时间。按服务端窗口长度识别 5h（300 分钟）和 Weekly（10,080 分钟），不固定假定 primary/secondary 的含义。

摘要格式为 `codex 81% 4h36m 50% 5d4m`，较短窗口在前；`*` 表示旧数据，`?` 表示缺少重置时间。dsh-tui 0.14.0 可运行 `node scripts/patch-tui-quota-placement.mjs [Chat.js路径]`，只将这条状态移至输入框下方的模型/推理档位同一行，并保存 Chat.js 和 StatusLine.js 原文件备份。窄终端使用已有字段截断布局，不另加额度行。公开状态 API 固定在输入框上方，因此位置调整需要本机 TUI 补丁；重新安装或升级 TUI 可能覆盖补丁，脚本会拒绝不支持的版本。

npm 安装的 TUI profile 可手动应用可选补丁：

```bash
node "${DSH_HOME:-$HOME/.dsh}/profiles/dsh-tui/node_modules/dsh-codex-oauth/scripts/patch-tui-quota-placement.mjs"
```

之后重启 TUI。未应用补丁时，摘要使用标准的输入框上方位置；安装插件不会自动修改 TUI。

优先使用正常请求的 `x-codex-*` 响应头和 `codex.rate_limits` 流事件。没有新鲜数据时，使用 `.openai-codex-auth.json` 中独立的 Codex 额度登录。该登录由插件维护，不依赖 pi-ai、不读取 Pi 或 Codex 应用的登录文件、不改变原生推理路由，也不调用模型。成功结果缓存 60 秒，查询失败退避 30 秒，并发共享一次请求。

从 0.3.1 开始，普通 `login`（或 Web 设置中的 **Continue with ChatGPT**）会一起连接额度。已有匹配凭据会自动复用或刷新，否则在原生登录后继续打开额度授权，选择相同账户和工作区。取消或失败只影响额度，不会丢失已完成的原生登录。新用户不需要额外命令；单独修复、查看或断开额度时可运行：

```bash
dsh plugin --profile dsh-tui exec dsh-openai-codex quota-login
dsh plugin --profile dsh-tui exec dsh-openai-codex quota-status
dsh plugin --profile dsh-tui exec dsh-openai-codex quota-logout
```

选择与原生推理相同的 ChatGPT 账户及工作区。已有插件 v1 凭据会复用；临近过期自动刷新，使用同一跨进程文件锁和原子写入保存轮换后的 refresh token。backend 返回 401 时最多刷新并重试一次。临时失败保留凭据；明确撤销或失效时断开额度登录，需要重新 quota-login。quota-logout 只移除本地额度凭据，不退出原生推理登录。浏览器登录使用 Codex 固定的 1455 回调端口；被占用时先结束其他正在进行的登录。

查询 `https://chatgpt.com/backend-api/wham/usage` 前，先用额度凭据查询 `/backend-api/wham/usage/chatpass/apps`，完整列表中必须唯一匹配原生 client ID；注册缺失、重复或存在不支持的分页时不显示额度。每个请求边界重新检查两套登录状态，原生 SIWC token 不发送到这些接口。

此未公开的辅助来源返回套餐额度；注册与邮箱匹配并非独立的账户身份或工作区证明，也尚未确认覆盖原生 SIWC 的所有应用限制。这些说明保留在代码和文档中，UI 不增加来源标签。额度凭据缺失、不匹配、撤销或被接口拒绝时显示不可用。

快照仅保存在当前进程内存中，切换账户或登出时清除；超过五分钟或已过重置时间标记 stale。辅助查询失败会清除上次辅助快照，不推算额度已恢复至 100%；不同接口的数据独立解析，不混合拼接额度窗口。

```bash
npm install
npm test
# 可选：需要已登录的测试账户，会使用 ChatGPT 套餐额度。
DSH_HOME=/path/to/test-home npm run test:live -- gpt-6.1-sol
```

`npm test` 构建 Web bundle，并验证 OAuth 身份校验、并发刷新、账户切换、Web 路由边界、流式错误、工具及推理 replay、附件，以及与 DSH 官方运行时的集成。真实调用检查执行三轮工具对话并验证历史回传。

## 许可证

MIT
