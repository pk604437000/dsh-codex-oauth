# 会话级 service_tier 验证记录

版本：0.3.3-fast.0。方案与计划已由用户确认；实现沿用当前 fork 的 feat/fast-mode，安装目标为当前 web profile。

## 实现范围

- 会话输入栏、模型选择附近增加继承默认 / Standard / Fast，按真实 sessionId 保存。
- Config 的 sessionServiceTiers volatile 字典持久化到本 profile；原 serviceTier 仅作默认。显式 Standard 不被默认 Fast 覆盖；inherit 删除仅本会话键。
- 从 GenerateOptions.sessionId 读取一次，普通轮次、工具续轮、自动/手动压缩使用本会话覆盖；无 ID 调用使用默认。
- 不修改 DSH 核心、不写未支持的自定义会话事件、不触碰 OAuth 格式。
- 当前 Host 的已存在 live/cold 会话通过受保护 GET/POST 接口读取/保存，不调用 resolveAgent。非 Codex、无会话、原生不可编辑/寻址视图不误写默认或其他会话。
- profile-local 状态不随会话日志导出；分叉/子会话新 ID 独立继承默认；归档/卸载不删除覆盖。

## TDD 与阶段验证

| 阶段 | RED | GREEN |
| --- | --- | --- |
| 会话配置与请求隔离 | 10 项因旧全局回退、缺少会话 API 失败 | 定向 36/36，完整 71/71 |
| 会话 Web API | 7 项因新路由不存在失败 | 定向 16/16，完整 78/78 |
| 输入栏与真实 React DOM | 9 项因缺少会话控件失败 | 交互/渲染 16/16，完整 87/87 |

配置测试使用真实临时文件保存与重建，以及实际 Cordis volatile 字典。适配器测试按并发 A/B 的 session-id 与请求体关联校验 priority/default；真实 DSH 压缩器调用也保留对应 ID。Web API 覆盖冷会话 snapshot.header.id、重复/错误参数、未知 ID、Host/Origin/方法、缺编辑器、读写失败与敏感错误隐藏。

前端直接运行提交的客户端 bundle、实际 React DOM 和离线 DOM，覆盖独立双窗格、刷新重建、默认变化、切换时旧读/写晚到、保存期间轮询、保存失败、非 Codex/未绑定/不可用 scope、只读和错配响应。

## Fast 语义

本功能只管理请求档位。配置 fast 发送 priority，default 发送 default。此前唯一获得同意的真实 probe 请求 priority、实际返回 default，并未确认加速；本功能开发没有追加真实推理请求。所有新增模型行为验证均为 mock，不能从绿色套件推断实际 Fast 已兑现。

## 实施取舍

- 使用现有专用 clone 的功能分支而非嵌套 worktree：符合用户原路径选择，main 不改；代价是依赖分支隔离而非第二 checkout。
- 复用插件 ConfigEditor 字典而非会话私有事件：无需核心补丁且可原子持久化；覆盖值不随单独会话日志导出。

## 最终审查与部署

待独立最终审查与当前 profile 安装完成后补充具体结果。本记录不包含凭据、个人账户身份或会话正文。
