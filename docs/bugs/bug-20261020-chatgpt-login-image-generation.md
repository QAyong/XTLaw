# Bug：ChatGPT 账号登录通道误开放生图工具并返回通用失败

**日期**：2026-10-20  
**优先级**：中  
**状态**：已分析，待修复；已提交上游 Issue [#403](https://github.com/useLexora/Lexora/issues/403)  
**上游基线**：`47b169505338a00dc60b9df9eaad8c7d8a434828`  
**上游标签**：当前账号无添加标签权限，未能添加 `bug` 标签；Issue 标题已使用 `[Bug]` 前缀。  
**范围**：仅记录与反馈，不修改实现，不自动提交 Git。

## 证据与结论

- 本地实测为 XTLaw 0.2.2（Windows），不是上游 Lexora 的安装包版本。
- 用户确认使用 ChatGPT 账号登录；本次模型为 `gpt-6.1-sol`，接口为 `openai-responses`。
- 纯文字生图约 0.6 秒失败；此前两次参考图生图也失败。
- 上游核心生图文件与本地文件逐字一致；未运行上游安装包实测。
- 官方文档明确不支持该套餐直连通道的托管生图工具；当前代码却仅以服务商/API 判定支持。
- 原始服务端响应未保留，无法确定当次请求首先被哪个参数或能力限制拦截。

## 实际结果

工具返回 `XTLaw image generation failed: IMAGE_GENERATION_FAILED`，未返回图片或成果 ID。操作到达处理阶段即失败，未进入图片结果接收或保存阶段。

## 上游反馈正文

以下为脱敏后的公开 Issue 正文；不含会话 ID、个人路径、账号、密钥或令牌。

### 遇到的问题 / What happened

通过 **OpenAI → Sign in with ChatGPT（账号登录）** 接入后，普通聊天正常，但助手仍会获得 `lexora_image_generate`（生图工具）。请求生成一张简单静态图片时，工具快速失败，未返回图片：

```text
IMAGE_GENERATION_FAILED
```

这里指的是 `openai` + `openai-responses` 的 ChatGPT 套餐直连方式，**不是 API Key，也不是旧的 `openai-codex-responses` 后端通道**。

**证据边界**：上述失败在 Windows 的本地衍生构建中实测；已核对上游 `master` 的 `47b169505338a00dc60b9df9eaad8c7d8a434828`，核心文件 `OpenAiImageGenerationService.ts` 与本地逐字一致。尚未另行运行上游安装包复测，不将衍生构建版本号当作上游版本号。

### 复现步骤（选填） / Steps to reproduce (optional)

1. 添加内置 OpenAI 服务商，选择 **Sign in with ChatGPT** 登录，不配置 API Key。
2. 选择该账号可用的聊天模型；本次实测模型为 `gpt-6.1-sol`，普通对话正常。
3. 新建会话，要求生成一张静态图片，例如：“画一只站在池塘边的白色鹈鹕，水彩风格，不要文字。”
4. 助手调用 `lexora_image_generate`，不传参考图。
5. 本次调用约 0.6 秒失败，返回 `IMAGE_GENERATION_FAILED`，没有生成图片。

日志中该次操作依次为 `image.generation.preparing`、`image.generation.processing`、`image.generation.settled.failed`（`IMAGE_OPERATION_FAILED`），没有进入 `result_received` 或 `publishing` 阶段。此前带参考图的两次请求也失败。

### 预期结果（选填） / Expected behavior (optional)

- 根据**认证方式、实际通道与能力**判断是否开放生图，而不只根据服务商和 API 名称。
- 对官方不支持生图的 ChatGPT 套餐直连通道，不向助手暴露该工具，或执行前返回明确的“不支持当前登录方式”提示。
- 不静默切换到 API Key、其他账户或其他计费通道。
- 受支持且有权限的 API Key 生图路径不应受影响；本报告没有实测该路径成功与否。
- 失败时在脱敏前提下保留 HTTP 状态、请求 ID、可用的服务端错误码及阶段，避免用户把能力不支持误认为提示词或参考图问题。

### Lexora 版本（选填） / Lexora version (optional)

代码核对：上游 `master`，提交 `47b169505338a00dc60b9df9eaad8c7d8a434828`（2026-10-20）。实测为衍生构建，不填写上游安装包版本。

### 运行环境（选填） / Environment (optional)

Windows 桌面衍生构建；内置 OpenAI 服务商；ChatGPT 账号登录；`openai-responses`；模型 `gpt-6.1-sol`。

### 补充信息（选填） / Additional context (optional)

#### 1. 能力判断没有区分账号登录与 API Key

[生图能力判断代码](https://github.com/useLexora/Lexora/blob/47b169505338a00dc60b9df9eaad8c7d8a434828/apps/buddy/service/src/images/OpenAiImageGenerationService.ts#L91-L105)：

```ts
return (
  sourceProviderId === 'openai'
  && model.api === 'openai-responses'
) || (
  sourceProviderId === 'openai-codex'
  && model.api === 'openai-codex-responses'
)
```

[工具开放条件](https://github.com/useLexora/Lexora/blob/47b169505338a00dc60b9df9eaad8c7d8a434828/apps/buddy/service/src/images/imageGenerationExtension.ts#L23-L33) 直接依赖上述 `supports(model)`，因此 ChatGPT 账号登录也被判定为可用。

#### 2. 普通 OpenAI 分支发送非流式生图请求

[请求构造代码](https://github.com/useLexora/Lexora/blob/47b169505338a00dc60b9df9eaad8c7d8a434828/apps/buddy/service/src/images/OpenAiImageGenerationService.ts#L58-L64) 把“是否 Codex”直接作为 `stream` 参数传入。普通 `openai-responses` 因而发送 `stream: false`，同时声明并强制选择 `image_generation` 工具。

OpenAI 官方 [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) 明确规定，该 ChatGPT 套餐直连通道：

- HTTP 请求必须 `store: false`、`stream: true`。
- **Unsupported tools 包括 Image generation**。

[Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) 也说明该登录方式使用公开的 `POST https://api.openai.com/v1/responses`。所以，不能仅凭 URL 是公开 API 就将其视为 API Key 通道；仅改成流式也不能解除官方对生图工具的限制。

#### 3. 当前错误反馈不足以区分上述原因

[错误归一化与诊断提取代码](https://github.com/useLexora/Lexora/blob/47b169505338a00dc60b9df9eaad8c7d8a434828/apps/buddy/service/src/images/OpenAiImageGenerationService.ts#L353-L392) 已白名单保留部分 `providerCode`、`providerParameter`、`requestId`，但没有保留 HTTP 状态；对非标准 `detail` 错误、无图片输出和部分未分类异常，仍可能只得到通用失败。

官方 [Errors and recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery) 提醒：直连通道可能返回 `{"detail":"..."}`，不一定是标准 API `error` 对象。

**本次未保留原始服务端响应，不能断言实际请求首先被“非流式参数”还是“不支持生图工具”拦截，也不声称取得了某个具体服务端错误码。** 已确认的是实现与官方要求存在上述不兼容。

#### 关联与建议验证

关联 #315（生图能力适配的功能讨论）。本报告针对已有工具的可用性误判，不是新增跨模型调度需求。

建议补充以下回归覆盖：
- ChatGPT 账号登录 + 普通 OpenAI Responses：生图工具不开放或返回明确的不支持原因。
- API Key 通道：按实际能力判断，不因修复而一律禁用。
- 账号/认证方式切换后，可用工具及时更新。
- 非标准 `detail` 错误、普通 HTTP 错误、网络失败和“完成但无图片”能被区分，且诊断不泄露令牌、提示词或个人路径。

## 处理方式

后续修复应先明确认证方式与能力判断的数据来源，再设计工具开放条件和脱敏诊断；不以重登、删除凭据、切换计费或重复尝试提示词代替修复。当前会话只记录 Bug，不热修复。

## 文件与术语说明

| 原名称 | 中文含义 | 用途 |
|---|---|---|
| `OpenAiImageGenerationService.ts` | OpenAI 生图请求服务 | 判断通道、构造请求并解析结果 |
| `imageGenerationExtension.ts` | 生图工具扩展 | 向助手开放工具并返回结果 |
| `lexora_image_generate` | 生图工具名 | 由助手发起生图或改图请求 |
| `openai-responses` | 普通 OpenAI Responses 接口类型 | 本次 ChatGPT 账号登录所用接口 |
| `API Key` | 开发者接口密钥 | 与账号登录不同的接入和计费方式 |
| `stream` | 流式返回开关 | 该账号登录通道要求为 `true` |
