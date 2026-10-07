# Spec-007：聊天窗口 AI 身份（头像与名称）

**日期：** 2026-09-29  
**状态：** 已实现（分支 `codex/feature-006-fixed-primary-navigation`）  
**设计基线：** 与 Spec-006 同一分支，基于提交 `73496281`

> 默认资源更新：当前默认名称为“晓晓”，默认头像为黑框眼镜长发少女。详细资源及品牌分离约定见 [Feature-025](feature-025-brand-ui-and-startup.md)。自定义与同步规则不变。

## 1. 目标

聊天窗口里 AI 回复上方的身份标识（头像 + 名称）此前是固定值：品牌头像加 i18n 文案 `Lexora Buddy`。本方案让它可以自定义，并提供「跟随用户资料」的选项：

- 在设置中新增「AI 身份」区块，可自定义 AI 的头像与名称。
- 提供开关「同步用户头像与名称」：开启后直接使用「通用 → 个人资料」里的头像与昵称。
- 聊天窗口与设置中的预览保持一致。
- 聊天窗口里的 AI 名称沿用应用系统文字样式，不使用品牌展示字体或额外的字号、字重。

## 2. 配置

新增 `desktop.agentProfile`，落盘为 `[desktop.agent_profile]`：

```toml
[desktop.agent_profile]
name = ""
avatar = ""
sync_with_user_profile = false
```

| 字段 | 说明 |
|---|---|
| `name` | 自定义名称，最长 30 字符；留空使用默认名称 |
| `avatar` | 自定义头像，data URL；留空使用晓晓默认头像 |
| `syncWithUserProfile` | 是否跟随「通用 → 个人资料」的头像与昵称 |

头像大小限制沿用用户资料既有规则（≤ 2MB，data URL 长度上限同 `DESKTOP_PROFILE_AVATAR_MAX_DATA_URL_LENGTH`）。

## 3. 界面位置与形态

设置在 **外观** 分类下，位于外观设置之后：

```text
外观
├── 主题 / 大纲位置 / 欢迎语 …（既有外观设置）
└── AI 身份
    ┌──────────────────────────────────────────────────────────┐
    │ [头像]  名字                                              │
    │         [输入框]                    同步用户头像与名称 ●   │
    │         显示在聊天窗口 AI 回复上方…            [保存]      │
    └──────────────────────────────────────────────────────────┘
```

- 开关是行内的小控件，与头像/名称同处一行，不单独占一行，也没有额外说明文案。
- 开关立即生效（与其他设置开关一致），名称与头像通过「保存」提交。
- 开关开启时隐藏手动编辑控件，改为显示「当前使用个人资料里的头像与名称」与当前名称。

## 4. 行为

### 默认（未同步、未自定义）

- 头像：`resources/brand/xiaoxiao-avatar.png`（黑框眼镜长发少女），通过 `BRAND_ASSET_URLS.chatAvatar` 提供。
- 名称：i18n `desktop.chat.agentName`（中英文均为 `晓晓`）。

### 自定义（未同步）

- 可上传头像（图片类型、≤ 2MB，读取为 data URL）、恢复默认头像。
- 可填写名称（≤ 30 字符，留空则回到默认名称）。
- 任一为空时按「默认」规则回退。

### 同步用户资料

- 开启后，AI 身份**完全照搬个人资料的解析结果**（复用 `resolveUserProfile`）：
  - 用户设置了自定义头像 → 使用同一张图；
  - 用户没有头像（含系统头像缺失）→ 使用**同一个首字母圆形头像**（同样的首字母与配色算法），而不是回退到品牌图标；
  - 名称使用个人资料解析出的昵称（自定义昵称 → 系统显示名 → 系统用户名）。
- 聊天窗口与设置预览都按上述规则渲染，两处一致。
- 关闭同步后回到「自定义 / 默认」规则。
- 聊天窗口显示名称时继承所在界面的系统字体、字号、字重、行高和文字颜色；头像仍按身份配置显示。

## 5. 验收标准

- [x] 设置 → 外观 下存在「AI 身份」区块。
- [x] 可自定义 AI 头像与名称，保存后聊天窗口立即使用新值。
- [x] 未自定义时使用晓晓默认头像与名称。
- [x] 存在「同步用户头像与名称」开关，且为行内小控件、不单独占行。
- [x] 开关开启后，聊天窗口与设置预览都使用个人资料的头像与昵称。
- [x] 用户没有自定义头像时，AI 身份显示与个人资料一致的首字母圆，而非品牌图标。
- [x] 聊天窗口里的 AI 名称使用所在界面的系统文字样式，不使用品牌字体样式。
- [x] 开关关闭后恢复自定义 / 默认规则。

## 6. 未决事项

- 是否把设备名等其他资料字段也纳入同步，当前不做。
- 是否允许为不同空间设置不同 AI 身份，当前不做（全局单份配置）。

## 7. 相关实现

| 位置 | 说明 |
|---|---|
| `electron/shared/desktopApi.ts` | `DesktopAgentProfileConfig` 与配置/补丁类型 |
| `electron/shared/desktopApiSchemas.ts` | 配置补丁校验 |
| `electron/main/config/LexoraConfigStore.ts` | `agent_profile` 读写、默认值与补丁合并 |
| `src/app/bootstrap/DesktopAppProvider.vue` | 解析 `agentIdentity`（含同步分支） |
| `src/shared/ui/desktopUiContext.ts` | 向界面提供解析后的身份 |
| `src/modules/settings/widgets/app/DesktopAgentIdentitySettings.vue` | 设置区块 |
| `src/modules/settings/pages/DesktopAppearanceSettingsView.vue` | 挂载位置 |
| `src/modules/tasks/widgets/transcript/BuddyChatAgentIdentity.vue` | 聊天窗口渲染 |
| `src/modules/tasks/widgets/transcript/__tests__/BuddyChatAgentIdentity.spec.ts` | 晓晓默认身份 / 自定义头像 / 首字母圆 |
