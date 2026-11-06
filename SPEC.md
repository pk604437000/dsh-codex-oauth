# dsh-codex-oauth 0.3 原生适配器规格

## 目标与依赖

在 DSH 中使用 OpenAI 官方 Sign in with ChatGPT 直接接入方案。插件直接实现官方 `LlmAdapter`，依赖 DSH `0.2.0-rc.2` 兼容接口、Cordis 和 atomic-write，不依赖 pi-ai，不修改 DSH 源码，不提供 API Key 计费回退。Node.js 最低版本为 22。

## 授权与账户

- 初次授权使用 `dynamic_agent_client`、稳定的 `ext_agent_host_id`、应用名、state、nonce 和 S256 PKCE；取得签发的 client ID 后，复用该 ID 进行同一账户的再次授权。
- 本机 HTTP 回调只监听 `127.0.0.1`；校验 state、回调 client ID、ID token 的签名、issuer、audience、有效期和 nonce。再次授权必须保持原账户 subject。
- 使用官方公开 Responses 资源与 `chatgpt.tokens.use.direct` scope；仅获得身份授权时显示已登录、未授权套餐，禁止推理调用。
- 提供 `login [--new-account]`、`status`、`accounts`、`use <client-id>`、`models [--refresh]`、`logout`，正常 login 完成原生授权后自动复用或刷新额度凭据，否则顺序引导额度授权；取消或失败保留原生登录。另提供独立修复用的 `quota-login`、`quota-status`、`quota-logout`。不支持旧 device-code 流程。
- Web 设置提供登录、取消、账户选择、退出、模型刷新和官方用量链接。所有控制路由要求本机请求与同源，返回 `no-store`；状态和挑战不含 token。
- 取消授权不得撤销原有登录。退出登录尝试远程撤销后清除当前账户 token，保留注册与其他账户；未确认远程撤销时向用户说明。

## 凭据与并发

- 文件为 `$DSH_HOME/.openai-codex-auth.v2.json`，包含 version、hostId、registrations、activeClientId 和账户变化 generation。
- 原子写入，POSIX 文件权限 `0600`、目录 `0700`；拒绝凭据文件符号链接。
- 跨进程锁保护登录落盘、账户选择、退出和 rotating refresh，避免重复使用旧 refresh token。
- 临时刷新错误保留凭据，明确失效的 refresh 清除 token，保留注册。
- 账户切换或退出使准备中的调用失效。已发送的同进程请求会取消；其他进程的已发送请求不由本进程控制。
- 旧 v1 凭据保留，新路由需要重新授权。不读取或修改 Pi、Codex 的凭据文件。

## 模型目录

通过与推理相同的 OAuth token 查询 `GET https://api.openai.com/v1/models`。展示 `visibility: list` 的条目，保持服务端排序，以 display_name 展示、slug 请求。上下文、输入模态和推理档位使用服务器提供的信息；未知模型可按显式 ID 请求，最终权限由服务器判定。

目录按当前授权缓存五分钟，账户变化后失效，可手动刷新。目录请求过程中切换账户，即使随后切回，也不得将旧结果绑定到新授权。

## 会话级 Fast 服务档位（0.3.3-fast.1 fork）

- Config 字段 `serviceTier` 为 volatile 的 profile 默认，只接受 `default`（Standard，默认）和 `fast`；新增 volatile `sessionServiceTiers` 字典按真实 sessionId 保存显式 default/fast，缺键即继承。通过当前 profile 的 configEditor 持久化，不写凭据或会话日志，不随单独日志导出。
- 保存串行执行，保留无关配置；失败不更新当前选择，也不阻塞后续保存。缺少持久化编辑器时明确报错，Web 控件禁用。
- Web 原状态/POST service-tier 保留为默认档位。GET/POST `/plugins/dsh-codex-oauth/auth/session-service-tier?session_id=ID` 管理本会话；POST value 为 inherit/default/fast，inherit 仅删除本键，返回 sessionId/selection/effectiveTier/defaultTier/writable。本机同源与方法保护、唯一合法参数和当前 Host 真实会话校验先于写入，不启动 Agent；失败不宣称保存成功。
- 每个新组装的 Responses 请求读取一次配置档位；`default` 发送 `service_tier: "default"`，界面/配置 `fast` 映射为该 ChatGPT 套餐目录声明的 `service_tier: "priority"`，而非此路由返回不支持的字面值 `fast`。根据 GenerateOptions.sessionId 选择本会话覆盖，其次 profile 默认，最后 Standard；无 ID 的直接调用使用默认。普通调用、工具续轮和手动/自动压缩保持相同会话 ID；其他会话的显式选择、模型 ID、推理强度、provider 及已发请求不变。
- Fast 消耗更多额度；界面不宣称真实资格、实际服务档位或加速已验证。不静默降级重发 Standard、不切换 API Key；自动化只使用 mock。
- 模型目录过滤 Responses wire 接口不支持的 ultra，保留 none/minimal/low/medium/high/xhigh/max 的原始值。

## 请求、输出和历史

- `POST https://api.openai.com/v1/responses`，固定 `store: false`、`stream: true`，input 数组携带所需历史；不使用 backend-api 或 previous_response_id。
- system 转为 instructions 或 developer 消息。函数工具置于 namespace，保留原始参数文本和 call ID，回传 function_call_output。工具执行由 DSH 负责。
- 不发送此路由不支持的 sampling、输出上限、托管工具或原生 tool_search。设置 temperature、maxTokens、stop 时明确报 UNSUPPORTED_OPTION。
- DSH 的 purpose: compaction 调用接受压缩器自动传入的 maxTokens，但不发送输出上限字段，避免阻断历史压缩；此通道不保证摘要输出上限。普通调用仍拒绝显式 maxTokens，压缩调用也仍拒绝 temperature 和 stop。
- 图片使用 DSH 附件请求表示，单张编码目标 1 MiB、约 4M 像素，整次请求 base64 预算 32 MiB。超预算要求 DSH 卸载图片；文件与已卸载图片提供本地工具句柄。
- SSE 转换为 DSH 的 text、reasoning、tool-call 块、usage 和 finish。以 response.completed 判定成功；失败、未完成、无终态中断分别处理。缺失 Content-Type 的有效 SSE 仍可读取。
- 未闭合 UTF-8/SSE 块、取消和空响应不得伪装成成功。五分钟无数据则终止流。
- 保存 output_item.done 的完整 reasoning（含 encrypted_content）和工具项；与 DSH 可见块指纹绑定。同账户、同模型且块未改变时回传完整原生项；编辑、模型切换、账户变化后退化为 DSH 通用历史。上下文压缩由 DSH 处理。
- 用量区分普通输入与缓存输入；输出已包含推理 token。账户应用额度耗尽不自动重试，临时服务不可用交给 DSH 重试策略。

## 额度显示

- 优先解析正常响应的 `x-codex-*` 头和 `codex.rate_limits` 事件；缺少新鲜数据时用插件保留的旧 v1 Codex 凭据只读查询 WHAM，不用原生 SIWC token 查询该接口。
- 额度登录沿用旧 v1 文件，检查私有权限、邮箱和 accountId，临近过期自动刷新；同一跨进程锁与原子写入保存轮换后的 token。临时失败保留凭据，明确失效断开额度登录，不影响原生推理。不读取其他应用的凭据。
- 每次查询先访问 `/backend-api/wham/usage/chatpass/apps`，完整列表必须唯一匹配原生 client ID；缺失、重复、分页或登录变化时不显示缓存额度。backend 401 最多刷新重试一次。来源仍未公开，注册匹配不是独立身份保证，文档保留限制说明。
- 成功缓存 60 秒，失败退避 30 秒，并发共享请求；账户变化、登出和卸载阻止旧查询更新。无数据不伪造额度，过期快照标记 stale。
- Web 显示英文额度条；TUI 摘要为 `codex 81% 4h36m 50% 5d4m`，`/codex-usage` 展开详情。不调用模型。
- 模型/推理档位同一行的位置通过可选的本机 dsh-tui 0.14.0 补丁实现；默认公开接口仍位于输入框上方，安装不自动应用布局补丁。

## 验收

通过行为边界测试验证独立注册和签名校验、轮换刷新并发、临时/永久刷新失败、多账户退出、取消授权、Web 边界、目录刷新及账户变化、SSE 分块与中断、工具/推理回传、附件和 DSH 官方运行时集成。

在隔离 profile 中进行真实 OAuth 授权、动态模型查询、GPT-6.1 Sol 流式调用、工具执行与后续历史回传，再更新本机使用的 profile。发布、Git 提交和推送需另行授权。
