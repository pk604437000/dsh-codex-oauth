# Session Service Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当前 Web GUI 中每个 Codex 会话独立持久化请求档位，刷新/重启保留且互不影响。

**Architecture:** 扩展插件自己的 volatile Config 字典，经现有 ConfigEditor 保存。适配器根据 GenerateOptions.sessionId 同步解析一次会话覆盖或默认；新增受保护的会话设置端点和 conversation.input.right 控件，不改核心或会话日志。

**Tech Stack:** 现有 JavaScript ESM、Cordis/Schemastery、React、esbuild、node:test、happy-dom；不增加依赖。

**Spec:** docs/superpowers/specs/2026-11-06-session-service-tier-design.md

## Global Constraints

- 当前 fork 的 feat/fast-mode 分支，保留 main；用户已要求实现并安装到 web profile，不创建 PR、不发布 npm。
- 保留原 Node/DSH/peer 最低要求；实际目标 DSH 0.2.1-rc.5。
- 配置模式 default/fast；wire default/priority；请求档位不等于已确认 Fast 加速。
- 不发额外真实模型请求，不改 OAuth、模型 ID、推理或计费路线。
- 不写会话私有事件、核心文件或浏览器独有状态；实际 ID、Host/profile 边界明确。

## Review Focus

- 并发 A/B 请求及快速 UI 切换：不可共享“当前会话”或把旧响应写进新会话；Task 1/3 测试。
- 未设置、显式 Standard、继承默认、profile 默认变化：显式值必须优先；Task 1 测试。
- 保存排队、失败和重建：不丢其他 session key 或无关配置，不假成功；Task 1/2 测试。
- 冷会话/归档/卸载及不存在 ID：只读验证不启动会话，不在 disposal 时删设置；Task 2 测试。
- 非 Codex、非本 Host/只读或未建立会话的 UI：不得误改全局或另一个本地会话；Task 2/3 测试。

---

### Task 1: 会话配置与请求隔离

**Files:** lib/service-tier.js, lib/index.js, lib/adapter.js, test/service-tier.mjs, test/adapter.mjs。

**Interfaces:** 导出 validateSessionId(value)→string，使用 spec 的 1–128 字符 ASCII 规则并拒绝原型敏感键。扩展 createServiceTierControl 的 current(sessionId?)→default|fast；session(sessionId)→{sessionId,selection:inherit|default|fast,effectiveTier,defaultTier}；saveSession(sessionId,selection)→Promise<同一快照>；保留 current()/save(default|fast)/writable()。新增 Config.sessionServiceTiers volatile 字典。适配器调用 getServiceTier(options.sessionId) 一次。

- [ ] **Step 1:** 写回归：A/B 各自 Fast/Standard；无覆盖继承；显式 Standard 抵抗默认 Fast；inherit 删除仅本键；重建保留；两种保存交错不丢键/配置；失败不改变状态；无 sessionId 兼容。
- [ ] **Step 2:** 运行 `node --test test/service-tier.mjs test/adapter.mjs`，观察新增断言因旧全局行为失败。
- [ ] **Step 3:** 实现上述接口；共用串行保存队列，ConfigEditor 更新函数合并最新 raw；Object.hasOwn 读取，验证模式及有界安全 ID，继承删键；不新增磁盘状态文件。每次请求只捕获一次结果，保留 priority 映射。
- [ ] **Step 4:** 运行相同测试；加真实 Cordis volatile 字典引用回归，以及不同 sessionId 的 compaction/工具续轮请求断言，全部通过。
- [ ] **Step 5:** 提交 `feat: persist isolated Codex service tiers per session`。

### Task 2: 本机会话设置接口

**Files:** lib/web-auth.js, test/web-auth.mjs。

**Consumes:** Task 1 的 serviceTier.session/saveSession/writable。
**Produces:** SESSION_SERVICE_TIER_PATH=/plugins/dsh-codex-oauth/auth/session-service-tier；GET ?session_id=ID、POST ?session_id=ID&value=inherit|default|fast；返回 Task 1 快照加 writable。

- [ ] **Step 1:** 写测试：现有两会话读写隔离/清除、冷会话 stat、无 Agent 启动；重复/缺失/非法/未知 ID、错误方法、外来 Host/Origin、缺编辑器和存储失败无敏感值。
- [ ] **Step 2:** 运行 `node --test test/web-auth.mjs`，确认新接口尚不存在而失败。
- [ ] **Step 3:** 注册 GET/POST 分支并复用现有 request guard；先严格 ID 校验，再用 ctx.get('sessions')?.get 与 ctx.get('sessionPersistence')?.stat 验证本 Host 存在；缺服务返回503，未知404；不可调用 resolveAgent。POST 只在成功后返回新快照，通用500隐藏原始错误。
- [ ] **Step 4:** 相同测试全绿，并确保原 OAuth/额度/默认档位路由全部不退化。
- [ ] **Step 5:** 提交 `feat: expose guarded per-session service tier settings`。

### Task 3: 会话输入栏控件

**Files:** 新建 client/session-service-tier.jsx；修改 client/index.jsx, client/service-tier.jsx, package.json, test/client-interaction.mjs, test/client.mjs；新增 test/session-client.mjs；重建 lib/client.js。

**Consumes:** Task 2 JSON API；原生 conversation.input.right list/session 插槽的 sessionId；modelDirectories.directoryFor(sessionId).store 的 getSnapshot/subscribe 与 load()。
**Produces:** SessionServiceTierControl({sessionId,directory,loadModel,available,request,t})，request(sessionId,value?,signal?) 读写上述端点；slots 注册时提供本会话实例及模型目录，不存共享当前会话。

- [ ] **Step 1:** 在实际 React DOM/离线 DOM 与编译 bundle 上写失败交互测试：同时 A/B；A 请求晚回后切 B；保存失败保留选择；保存前/中轮询不覆盖成功；非 Codex/不可用隐藏或禁用；首个真实 sessionId 后才写入。
- [ ] **Step 2:** 运行新 test/session-client.mjs 与现有 client 测试，确认旧 bundle 缺控件/行为而失败。
- [ ] **Step 3:** 使用原生 slot 与模型目录订阅，仅 Codex 显示控件；三种选择以 server snapshot 为准；按 ID/代次隔离异步响应，卸载取消读取，保存时禁用，异常保留已确认值；刷新时重新读取。注册中英文文案。现有设置控件标题改“默认服务档位”，保存成功通知当前会话控件刷新；对非本 Host/原生只读会话禁用，不误写当前 Host。
- [ ] **Step 4:** 更新 dsh.client.inject 为现有 conversation/model-selection 依赖；不打包 React/DSH SDK。将新测试加入 npm test，运行完整套件及 bundle smoke，确保原设置交互不退化。
- [ ] **Step 5:** 提交 `feat: add session-scoped Codex tier selector beside model picker`。

### Task 4: 审查、文档与部署

**Files:** README.md, README.zh.md, SPEC.md, CHANGELOG.md, package.json/package-lock.json；新增 docs/verification 会话级记录。

**Consumes:** Tasks 1–3 的实现与测试。
**Produces:** 0.3.3-fast.1 安装包、已安装当前 web profile、已验证远端功能分支与可见资源（原 fast.0 候选在真实 GUI 暴露 namespace 声明缺项，修复后采用新补丁身份）。

- [ ] **Step 1:** 文档说明优先级、默认/继承、并发与重启、分叉/子会话独立、profile-local 状态不随日志导出，以及 Fast 请求不保证上游兑现。更新版本，运行 npm test / npm run build / diff --check，审核安装包白名单、权限与无凭据。
- [ ] **Step 2:** 一名独立 reviewer 对计划基线至当前整个分支做最终审查；修正全部 Critical/Important 并用新增失败测试覆盖，不增加重复审查循环。
- [ ] **Step 3:** 备份当前 profile 相关配置与 0.3.2-fast.1；复用已知 pnpm11 环境，用安装包替换，跳过构建脚本，不执行无关插件构建。触发原生重载，不另开 Web 服务。
- [ ] **Step 4:** 在当前 URL 验证新版状态接口、客户端版本资源和会话隔离；只使用临时测试会话/模拟推理，不发付费模型请求；恢复测试覆盖/默认设置，保留用户已有选择。记录实际覆盖缺口。
- [ ] **Step 5:** 提交并只推送 feat/fast-mode，核对远端 SHA、本地主分支不变，恢复项目所有权；交付源码/包/验证记录，完成 goal。
