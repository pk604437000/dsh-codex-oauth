# Codex 会话级服务档位

状态：用户已确认“按此方案实现并安装”，确认输入栏选择器、继承默认 / Standard / Fast、持久化与会话隔离。

## 目标与约束

让当前 Web GUI 的不同 Codex 会话各自指定请求的 service_tier，不再被迫共享一个全局选择。选择刷新、重启后保留；只影响该会话后续组装的请求，不改已发出的请求。

- 在用户现有 fork 的 `feat/fast-mode` 分支实现并安装到当前 `web` profile；保留 main，不创建 PR、不发布 npm。
- 继续使用原生 OAuth 与现有模型/推理设置，配置 `fast` 仍发送 wire `priority`，Standard 发送 default。
- 本功能只设置请求档位；既有真实 probe 返回 default，并未证实 Fast 处理。本轮不新增真实模型测试请求。
- 不修改 DSH 核心或会话日志格式，不使用外部插件禁止调用的 appendPluginRecord。
- 保留现有版本要求、peer 范围和开发依赖；目标宿主为已安装 DSH 0.2.1-rc.5。

## Approaches

1. **会话输入栏选择器（用户确认）**：放在模型选择附近，当前会话随手切换，使用原生 session-scoped slot；状态写入插件配置，按真实 sessionId 分隔。
2. 会话设置菜单：行为相同，但每次需展开菜单，用户目前的不便正是操作过远，故不选。
3. 只做斜杠命令：界面简省但可见性与可发现性较差，不选；本轮不额外增加命令。

## 界面与行为

输入栏使用 `conversation.input.right` 列表插槽，不覆盖现有模型选择器。Codex 会话显示“服务档位”选择：继承默认、Standard、Fast；继承时显示当前默认档位。非 Codex 会话隐藏。未绑定实际会话、未知会话、非本 Host 可写会话或缺少持久化编辑器时不得误写全局默认。

插件设置中的原控件明确改为“默认服务档位”。修改默认不覆盖显式设置过的会话；选择继承默认会删除本会话覆盖值。

```text
会话 A：模型 …   服务档位：Fast
会话 B：模型 …   服务档位：Standard
会话 C：模型 …   服务档位：继承默认（Standard）
```

保存中禁用控件，成功后再确认新选择。失败保留最后确认值并显示错误。快速切换会话、乱序读响应和保存期间的刷新都不把 A 的状态写到 B。

## 数据与请求路径

扩展插件 Config：

- `serviceTier: default|fast`：原 profile 默认值，保持兼容。
- `sessionServiceTiers: Record<SessionId, default|fast>`：volatile 字典，默认空；通过现有 ConfigEditor 原子保存。

选择顺序：本会话显式覆盖 → profile 默认 → Standard。没有 sessionId 的直接适配器调用仍使用默认。使用 Object.hasOwn 读取键，拒绝无效值，不把损坏状态静默当成 Standard。

CodexAdapter 在组装每次 HTTP 请求前读取一次 `options.sessionId`。DSH 普通轮次、工具续轮、自动/手动压缩都传真实 ID；不修改冻结的 GenerateOptions，不使用共享“当前会话”变量。

状态属于本 Host/profile 的插件配置，不写 OAuth 文档、不伪装成原生会话日志事件；单独导出会话日志不会携带这些覆盖值。分叉/子会话使用新的 ID，默认独立继承 profile，不自动复制父会话覆盖。卸载/归档会话不删除覆盖，因为它们不是永久删除。

## Web 接口

新增 `/plugins/dsh-codex-oauth/auth/session-service-tier`：

- GET：恰好一个 `session_id`，返回 `{sessionId, selection, effectiveTier, defaultTier, writable}`。
- POST：另需恰好一个 `value=inherit|default|fast`，保存后返回相同快照。
- 保留现有本机 Host/Origin 与方法保护；ID 限制为 1–128 个 ASCII 字符、匹配 `^[A-Za-z0-9][A-Za-z0-9_.:-]*$`，排除 `__proto__` / constructor / prototype，拒绝路径与控制字符；再用当前 Host 的 sessions.get / sessionPersistence.stat 验证存在，不调用 resolveAgent，不创建或启动会话。
- 无效/重复参数 400，未知会话 404，缺少配置编辑能力 503，读写失败返回通用错误而非原始配置或凭据。

前端依赖现有 conversation/model-selection 服务及 session-scoped props；以实际返回的会话 ID 请求本 Host 接口。对远端/只读会话按原生会话能力禁用，不把不存在的本机会话当成另一个全局选择。

## 验收

1. A=Fast、B=Standard 并发请求分别发送 priority/default，来回切换互不污染。
2. 继承、显式覆盖、默认修改、清除覆盖、重启后重建均正确，保留无关配置。
3. 工具续轮与自动/手动压缩按同一 ID 读取；无 ID 调用兼容原行为。
4. 方法/Origin/Host、重复参数、非法 ID、未知/冷会话、缺编辑器及保存失败有测试。
5. 真正 React DOM 交互覆盖双会话、快速切换、乱序响应、保存失败和非 Codex 隐藏。
6. 全套测试、独立最终审查、打包检查、当前 profile 安装及现有 GUI/API 资源验证；不额外进行真实推理。
