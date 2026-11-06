# Configurable Codex Fast Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在用户的 GitHub fork 中提供可持久化的 Standard / Fast 选择，保留 0.3.1 功能，并交付通过测试的源码和本地安装包。

**Architecture:** 先用有完整性校验的 npm 0.3.1 发布源码建立兼容基线，保留 GitHub 的测试及构建工具。插件用 DSH 的 volatile Config 引用读取服务档位，用 configEditor 保存 profile；适配器在每个新请求组装时读取一次档位并写入 Responses 请求。已有 Web 设置页通过同源保护的 POST 路由保存选择，不改变模型 ID 或推理档位。

**Tech Stack:** JavaScript ESM、Node.js >=22、DSH LlmAdapter、Cordis / Schemastery、React、esbuild、node:test。

**Spec:** `docs/superpowers/specs/2026-11-06-codex-fast-mode-design.md`（用户已确认方案 A）。

## Global Constraints

- 本地仓库 `/data/project/dsh-codex-oauth`；功能分支 `feat/fast-mode`；保留上游 Git 历史和 main。
- 不替换当前 DSH 插件，不重启当前 Web 服务，不启动替代 GUI。
- 自动化使用 mock；不发送真实模型请求，不读取或复制生产 OAuth 凭据。
- 默认 Standard；服务档位与模型 ID、推理强度独立；不加入 Ultrafast 或伪模型。
- 不静默回退 Standard，不切换 API Key；界面仅表示请求的档位，不保证服务端实际档位。
- 使用 profile 配置持久化，不修改凭据文件存储格式。
- 测试通过后提交并推送用户 fork 的功能分支；不发布 npm，不自动提交上游 PR。
- root 执行 git 时仅使用命令级 `-c safe.directory=/data/project/dsh-codex-oauth`，不改全局 Git 安全配置。

## Review Focus

- 并发修改档位、某次保存失败：按提交顺序保存，失败不阻塞后续保存，不伪造成功状态（Task 3）。
- 未授权的设置请求与重复/非法参数：在写入任何配置前拒绝（Task 3）。
- Fast 被服务器拒绝或返回非 Fast：不重发、不修改推理；UI 不宣称账户资格或实际加速已验证（Tasks 3–4）。
- 工具后续轮次与压缩请求：使用同一插件档位，切换只影响后续组装的请求（Task 3）。
- 发布包、Git 提交与依赖：无凭据、无机器状态、构建可复现且可在当前 DSH 版本解析（Tasks 1、5）。

## File Structure

- 同步：发布包中的 `lib/`、`client/index.jsx`、`bin/dsh-openai-codex.js`、包元数据与使用文档；保留仓库 `test/`、构建/验证脚本和 `.gitignore`。
- `docs/upstream/npm-0.3.1.md`：来源 URL、SRI、同步白名单、与原 main 的区别。
- `test/companion-auth.mjs`：补齐 0.3.1 未随 npm 包发布的额度登录回归测试。
- `lib/models.js` / `test/adapter.mjs`：保留非法推理档位过滤。
- `lib/service-tier.js` / `test/service-tier.mjs`：严格验证、读取 volatile Config、串行持久化服务档位。
- `lib/index.js`：导出 Config，连接控制器、adapter 与 Web routes；隐藏重复的自动配置页。
- `lib/adapter.js` / `lib/responses-request.js`：每请求读取档位，写入 service_tier。
- `lib/web-auth.js` / `test/web-auth.mjs`：状态字段与受保护的设置保存路由。
- `client/service-tier.jsx` / `client/index.jsx` / `test/client.mjs`：现有设置页中的档位控件与展示测试。
- `README.md`、`README.zh.md`、`CHANGELOG.md`、`SPEC.md`、`package.json`、lockfile、生成的 `lib/client.js`：使用说明、版本、可复现构建。

---

### Task 1: Restore a verified npm 0.3.1 baseline with regression tests

**Files:** 同步上文白名单；Create `docs/upstream/npm-0.3.1.md`, `test/companion-auth.mjs`；Modify `test/adapter.mjs`, `test/quota.mjs`, `test/auth.mjs`, `test/web-auth.mjs`, `package.json`（仅兼容所需变化）。

**Interfaces:**
- Consumes: upstream `ca5b8b4`、npm `https://registry.npmjs.org/dsh-codex-oauth/0.3.1` 与其 tarball/SRI。
- Produces: 官方 0.3.1 的 companion modules、`getCompanionCredential(store, options)`、额度 registration 校验、原有 adapter 与 auth API；完整测试命令不再引用缺失文件。

- [x] **Step 1: Add the missing baseline tests before importing source.** `test/companion-auth.mjs` 覆盖并发 refresh 只轮换一次、terminal refresh 仅清除额度登录、错误账户不发请求、临时失败保留凭据；quota fixtures 提供可刷新凭据和唯一 client 注册，验证查询失败清空旧快照、TUI 非 Codex 路由不轮询。所有 token 使用本地构造的测试值。
- [x] **Step 2: Install existing development/peer dependencies with lifecycle scripts disabled and run the new tests.** Run `npm install --ignore-scripts`，再运行 `node --test test/companion-auth.mjs test/quota.mjs`。Expected: new contract tests fail against 0.3.0（缺少 companion module / old quota behavior）；记录真实失败，不将依赖失败当作功能失败。
- [x] **Step 3: Import verified source only.** 下载 npm 指定的 0.3.1 tarball 并校验 metadata 中的 SHA-512 SRI；解包时只允许已知的源文件、文档、元数据路径，拒绝链接、路径穿越与凭据路径。覆盖已有文件前先读取；保留仓库独有测试、构建工具和忽略规则。记录来源，不把本机 models.js 补丁冒充发布版。
- [x] **Step 4: Align fixtures with the released 0.3.1 contract, then run the full existing suite.** Run `npm test`。Expected: all baseline tests pass，无真实网络或模型调用。若 registry 依赖不能覆盖当前 DSH 的 prerelease 范围，只增加明确的兼容范围与测试版本，不降低既有最低要求。
- [x] **Step 5: Commit verified baseline + regression coverage.** Commit `chore: sync verified npm 0.3.1 baseline and regression tests`。

### Task 2: Preserve the unsupported ultra reasoning fix

**Files:** Modify `lib/models.js`, `test/adapter.mjs`。

**Interfaces:**
- Consumes: Task 1 `CodexModelCatalog`。
- Produces: 只发布 wire 接口支持的推理档位 `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`，不发布 `ultra`；被过滤的默认档位不再作为默认值。

- [x] **Step 1: Add test `catalog excludes unsupported ultra without rewriting supported effort IDs`.** 在 mock 模型列表中加入 ultra 和上述有效档位；断言 ultra 不出现，有效值原样保留，非法 defaultEffort 不保留。
- [x] **Step 2: Run `node --test --test-name-pattern='unsupported ultra' test/adapter.mjs`.** Expected: FAIL because 0.3.1 currently exposes ultra。
- [x] **Step 3: Add the known wire-effort allowlist to `modelInfo(entry)` in `lib/models.js`.** 不修改推理请求的其他语义。
- [x] **Step 4: Re-run the targeted test and full adapter suite.** Expected: PASS。
- [x] **Step 5: Commit `fix: filter unsupported reasoning efforts from Codex catalog`.**

### Task 3: Implement persistent profile service tier and guarded backend endpoints

**Files:** Create `lib/service-tier.js`, `test/service-tier.mjs`；Modify `lib/index.js`, `lib/adapter.js`, `lib/responses-request.js`, `lib/web-auth.js`, `test/adapter.mjs`, `test/web-auth.mjs`, `package.json`。

**Interfaces:**
- `validateServiceTier(value) -> 'default' | 'fast'`：严格接受两个字符串；非法值抛出错误，不接受 `priority`、`ultrafast`、空值或对象。
- `createServiceTierControl(ctx, config) -> { current(): string, writable(): boolean, save(value): Promise<string> }`：读 `config.serviceTier.get()`；没有 config 时默认 default；通过当前 fiber.entry 与 `ctx.get('configEditor').edit(entry, updater)` 串行保存，合并原 raw config；无 editor 时保存失败而非仅改内存。
- 插件导出 `Config`，`serviceTier` 为 default='default' 的 volatile enum；直接引用 Schemastery 时在 peerDependencies 声明 `@deepseek-ai/schemastery: ^3.18.5`。
- adapter options 增加 `getServiceTier(): string`；无 getter 默认 default。`responsesRequest(options, binding, attachments, resolveAccess, serviceTier = 'default')` 接收内部第 5 参数，明确发送 `service_tier: 'default' | 'fast'`。
- `registerWebAuth(ctx, credentials, { adapter, serviceTier, ...existing })` 保留旧接口；status 增加 `serviceTier` 和 `serviceTierWritable`。
- `AUTH_SERVICE_TIER_PATH='/plugins/dsh-codex-oauth/auth/service-tier'`；POST query 必须唯一 `value=default|fast`，返回 `{serviceTier}`；非法/重复参数 400，缺少持久化能力 503，保存失败沿既有错误边界报告，不伪装成功。

- [x] **Step 1: Write red tests for configuration and saves.** `default tier is Standard`; `invalid tiers fail before writes`; `save preserves unrelated config`; `failed save keeps current tier`; `concurrent saves serialize and recover after rejection`; `real Cordis Config references resolve default and fast`。mock editor 只有保存成功才更新 ref。
- [x] **Step 2: Write red request tests.** 默认请求 service_tier=default；getter=fast 时仅档位改变；两轮之间切回 default；reasoning.effort=high 原样保留；压缩请求采用 fast；无效 getter 不发 inference；服务器 400/403/429 不回退也不额外请求。Run `node --test test/service-tier.mjs test/adapter.mjs`，确认是缺失功能导致 FAIL。
- [x] **Step 3: Implement control + Config + request mapping through the declared interfaces.** `save` 使用 promise 队列，失败不使队列永久拒绝；不调用 setter 假造落盘成功。getter 在请求组装时只读取一次；生命周期仍由现有插件负责。
- [x] **Step 4: Write red route tests before implementing routes.** 验证同源成功后 status 可读、重建控制器仍读持久配置；wrong method/foreign host/origin/remote address/cross-site 在任何保存前拒绝；缺失/重复/非法 value 400；editor 不可用 503；磁盘错误无成功状态且不泄漏凭据。Run `node --test test/web-auth.mjs`，确认 FAIL。
- [x] **Step 5: Implement route and status wiring, then run `node --test test/service-tier.mjs test/adapter.mjs test/web-auth.mjs` and `npm test`.** Expected: PASS；OAuth 路由、注销、quota controls 和工具 replay 不倒退。
- [x] **Step 6: Commit `feat: persist Codex service tier and request Fast processing`.**

### Task 4: Add Web control and user-facing documentation

**Files:** Create `client/service-tier.jsx`, `test/client.mjs`；Modify `client/index.jsx`, `package.json`, README files, CHANGELOG, SPEC；Rebuild `lib/client.js`。

**Interfaces:**
- `ServiceTierControl({ value, disabled, writable, onChange })`：在已有设置页显示 `Service tier` 下拉，选项 `Standard`(default)、`Fast`(fast)，显示更高消耗以及“requested tier, availability depends on account/model”的提示；不推断额度余额或实际服务档位。
- 现有 `request(path, method)` 复用；POST `service-tier?value=<encoded>` 成功后才更新 state.serviceTier，失败保留原值并显示 notice；保存中禁用控件。
- UI 测试用 esbuild 将组件编译为 Node ESM，React 解析到测试安装的同一模块，React DOM server 渲染；React/React DOM 仅作为 devDependencies，不捆绑进 Web 客户端。

- [x] **Step 1: Add failing render tests before creating the control.** 断言 options 恰为 default/fast、当前值 selected、busy/unwritable disabled、无 Ultrafast、提示 requested tier 与 higher usage。Run `node --test test/client.mjs`，确认缺少组件的 FAIL。
- [x] **Step 2: Implement the component and wire the save handler into existing CodexSettings.** 与现有账号/额度控件并列，不修改当前 DSH shell；无持久化能力时解释不可保存。保存失败不能改变选择或显示成功。
- [x] **Step 3: Update English/Chinese README and SPEC.** 给出 profile patch 示例 `id: llm-codex-oauth`, `config: {serviceTier: fast}`，说明 default 恢复 Standard、profile 内全部后续请求（含压缩）的范围、额度消耗、账户资格与未进行真实 Fast 验证；保留现有登录/额度文档。
- [x] **Step 4: Set fork metadata and prerelease version `0.3.2-fast.0`, update CHANGELOG and test script.** repository/homepage/bugs 指向用户 fork；不修改 provider ID 或插件名；不发布 npm。
- [x] **Step 5: Run `npm test` (including client test) and `npm run build`.** Expected: PASS；构建产物继续使用 DSH 的 ModuleLoader，不包含捆绑 React。
- [x] **Step 6: Commit `feat: add Standard and Fast controls to Codex settings`.**

### Task 5: Verify, review, package and push the fork branch

**Files:** 必要 review 修复、lockfile、设计/计划完成标记、本地 tgz 产物；不改生产 profile。

**Interfaces:**
- Consumes: Tasks 1–4、origin 用户 fork、全部测试。
- Produces: 干净的功能分支、完整测试证据、可安装 `dsh-codex-oauth-0.3.2-fast.0.tgz`、分支 URL 与回滚/安装说明。

- [x] **Step 1: Fresh verification.** Run `npm ci --ignore-scripts`, `npm test`, `npm run build`, `git diff --check`；另外使用当前 DSH 安装的依赖做一次只读 host-resolution 集成 smoke，不触发真实推理或连接当前 GUI。Expected: all commands exit 0。
- [x] **Step 2: Run a fresh independent whole-branch code review.** reviewer 阅读设计、计划与 diff，特别检查 Config 的 volatile 引用和持久化、并发/失败边界、API 参数、来源校验、quota 回归与 UI 不误报。根据反馈先写回归测试再修复，随后重新运行受影响测试与完整套件。
- [x] **Step 3: Package without publishing.** Run `npm pack --dry-run --json`，审查文件白名单/无 token、node_modules、测试临时目录或机器配置；再运行 `npm pack --ignore-scripts` 生成本地 tgz。不得提交 tgz 到 Git。
- [x] **Step 4: Commit final documentation/lockfile/review changes and restore repository ownership to yzf after verifying its absolute path.** 确认 working tree clean、无生产路径更改。
- [x] **Step 5: Push only `feat/fast-mode` to `origin` and verify remote commit matches local HEAD.** 不写 main、不建 PR、不发布 npm。交付分支链接、源码路径、本地包、测试结果及“尚未验证账户 Fast 资格、尚未安装到当前 DSH”的明确说明。
