# 0.3.2-fast.1 参数兼容修复与真实验证

## 触发问题

0.3.2-fast.0 的界面已安装并加载，但用户开启 Fast 后，真实 ChatGPT-plan 路由返回 `Unsupported service_tier: fast`。原来的模拟测试只验证发送配置值，遗漏了真实网关使用不同 wire ID 的情况。

## 非生成式模型目录证据

当前账户的 `GET https://api.openai.com/v1/models` 返回 GPT-6.1 Sol：

```json
{
  "service_tiers": [
    {"id": "priority", "name": "Fast", "description": "2x speed, increased usage"}
  ],
  "additional_speed_tiers": ["fast"]
}
```

目录名称描述的是模型可选档位，不等于某次请求实际使用该档位。

## 用户同意的一次真实请求

用户明确选择“修复并进行真实验证”。仅发送一次 Responses 推理请求，之后没有自动重试或继续发真实测试：

- 路由：现有 `https://api.openai.com/v1/responses`，继续使用插件原生 OAuth，不改 API Key 或其他登录。
- 模型：`gpt-6.1-sol`。
- 请求：`store: false`、`stream: true`、`service_tier: priority`、`reasoning.effort: low`。
- 输入：`Reply with exactly OK and nothing else.`，未附带当前会话历史或工具。
- HTTP：200。
- 终态：`response.completed` / `completed`。
- 服务端返回：**`service_tier: default`**。
- 报告用量：input 14、output 5、reasoning 0、total 19 tokens。
- 本次脚本只提取 completed.output 的文本，结果为空，未保存逐条输出 delta；所以不声称捕获到了 `OK` 文本，也不推算速度。

验证器以非零退出结束，因为它明确要求返回 priority/fast 才算 Fast 处理已确认。HTTP 请求成功不代表这项断言通过。

**结论：priority 参数可提交，但本次实际返回 Standard/default，真实 Fast 加速未得到确认。** 不据此断言所有账户、所有模型、所有后续请求都不支持 Fast，也不把本次请求改记为 Fast 成功。

## 修复范围

- 配置/界面继续使用 `default|fast`，仍为当前 profile 统一设置。
- 在请求边界把配置 `fast` 映射成目录声明的 wire ID `priority`；default 保持原样。
- 不改模型 ID、推理档位、OAuth 路由，不静默重发 Standard。
- 当前实际 profile 保留 Standard，避免把请求优先档位伪装成已确认的 Fast。

## 回归证据

先增加严格网关回归：仅接受 priority，其他值返回用户看到的 `Unsupported service_tier: fast`。旧实现下 4 项失败；修正映射后 5 项定向测试通过，覆盖默认档位、Fast 映射、切回 Standard、压缩和错误不重试。

## 完整测试与部署验证

- `npm test`：62/62 通过，含严格网关回归；构建在测试命令中完成。
- `git diff --check`：通过。
- 安装包：`dsh-codex-oauth-0.3.2-fast.1.tgz`，31 个白名单普通文件与当前源文件一致，无凭据或机器状态。
- SHA-256：`658cccc309d5cfcc636dd493a4cc2d1864cd49456380d6feda7aa349a50ef31b`。
- 当前 Web profile 已通过 DSH 插件管理器安装 0.3.2-fast.1，更新 profile 的注释标记触发既有 HMR 重载；未终止当前 Web 服务。
- 已安装的请求构造器离线验证：`fast -> priority`，`default -> default`；未发送额外推理。
- 当前服务 `/plugins/dsh-codex-oauth/auth/status` 返回 HTTP 200、`serviceTier: default`、`serviceTierWritable: true`。
- 当前服务新版带版本号的客户端资源返回 HTTP 200，包含 Service tier 与 Fast 选择器，验证时 revision 为 `6c06e60f9e74`。
- 当前全局 profile 仍保留 Standard；这些部署检查不改变真实 probe 返回 default 的结论。
- 安装时保持构建脚本禁用；另一个已有插件的 ignored-build 报告曾使安装器非零退出，后以命令级 `--ignore-scripts --config.strictDepBuilds=false` 完成安装，未运行或批准该插件脚本。

## 独立源码复核

独立审查者复核当前兼容性 diff，未发现 Critical、Important 或 Minor 问题；另行运行 `node --test test/adapter.mjs`，21/21 通过。审查结论只覆盖参数映射兼容性，不代表实际 Fast 处理已验证。没有追加真实模型请求。

本记录不包含 token、邮箱、账户 ID 或原始授权数据。
