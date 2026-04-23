# AIRI AI 子模块清单

> 最后更新：2026-04-23（第二次）

---

## 一、LLM 工具（发送给 OpenAI / 大模型的工具）

这些工具会被注册到每次 LLM 对话请求中，直接影响大模型的能力范围。
注册位置：`packages/stage-ui/src/stores/llm.ts`

| 工具名 | 文件 | 功能说明 | 状态 |
|--------|------|---------|------|
| `builtIn_mcpListTools` / `builtIn_mcpCallTool` | `src/tools/mcp.ts` | MCP 协议网关，桥接外部 MCP 服务器工具 | **禁用** |
| `builtIn_debugRandomNumber` | `src/tools/debug.ts` | 调试用随机数生成，无实际生产价值 | **禁用** |
| `builtIn_emitSparkCommand` | `src/tools/character/orchestrator/spark-command.ts` | 向 Minecraft / Discord / Factorio 等子模块发送指令 | **禁用** |

> **注意**：AI 表情（`<|...|>` 标记）由 `llm-marker-parser.ts` 解析 LLM 文本输出触发，**不依赖任何工具**，禁用工具不影响表情功能。

**重新启用方式**：取消 `packages/stage-ui/src/stores/llm.ts` 中对应行的注释。

---

## 二、后台模块（Pinia Store，负责配置和事件接收）

### 核心模块（保留）

| 模块 | Store | 文件 | 功能说明 | 状态 |
|------|-------|------|---------|------|
| consciousness | `useConsciousnessStore` | `stores/modules/consciousness.ts` | LLM 提供商 & 模型选择，核心聊天驱动 | **启用** |
| speech (TTS) | `useSpeechStore` | `stores/modules/speech.ts` | 文字转语音，支持 ElevenLabs / Azure / 微软等 | **启用** |
| hearing (STT) | `useHearingStore` | `stores/modules/hearing.ts` | 语音识别输入，支持 VAD 实时检测 | **启用** |
| vision | `useVisionStore` | `stores/modules/vision/store.ts` | 摄像头图像分析，视觉推理 | **启用** |
| AIRI Card | `useAiriCardStore` | `stores/modules/airi-card.ts` | 角色卡片管理（CCv3 格式），管理 VRM / Live2D 模型 | **启用** |
| memory-short-term | — | — | 短期记忆（UI 占位，尚未实现） | **启用（待实现）** |
| memory-long-term | — | — | 长期记忆（UI 占位，尚未实现） | **启用（待实现）** |
| beat-sync | — | `stage-shared/beat-sync` | 音乐节拍同步 | **启用** |
| mcp-server | — | `src/tools/mcp.ts` | MCP 服务器连接管理 | **启用** |

### 社交/游戏模块

| 模块 | Store | 文件 | 功能说明 | 状态 |
|------|-------|------|---------|------|
| discord | `useDiscordStore` | `stores/modules/discord.ts` | Discord 机器人集成 | **保留（默认未配置）** |
| twitter / X | `useTwitterStore` | `stores/modules/twitter.ts` | Twitter/X 发帖集成 | **保留（默认未配置）** |
| gaming-minecraft | `useMinecraftStore` | `stores/modules/gaming-minecraft.ts` | Minecraft 机器人，监听服务端事件 | **禁用** |
| gaming-factorio | `useFactorioStore` | `stores/modules/gaming-factorio.ts` | Factorio 服务器连接 | **禁用（默认 enabled=false）** |

---

## 三、角色编排系统（Character Orchestrator）

负责接收子模块发来的 `spark:notify` 事件，驱动 LLM 生成反应文本。
位置：`packages/stage-ui/src/stores/character/orchestrator/`

| 组件 | 文件 | 功能说明 |
|------|------|---------|
| 编排器主体 | `orchestrator/store.ts` | 接收 `spark:notify`，调用 LLM 生成回应，发送 `spark:command` |
| Spark Notify 处理器 | `orchestrator/agents/event-handler-spark-notify/` | 解析 notify 事件，组织 LLM prompt |
| Spark Notify 工具 | `src/tools/character/orchestrator/spark-notify.ts` | 子代理专用工具，包含 `builtIn_sparkCommand` 和 `builtIn_sparkNoResponse` |

---

## 四、聊天上下文提供器（Context Providers）

在每次用户发送消息时，自动注入额外上下文到 LLM。
位置：`packages/stage-ui/src/stores/chat/context-providers/`

| 提供器 | 文件 | 注入内容 | 状态 |
|--------|------|---------|------|
| datetime | `context-providers/index.ts` | 当前日期时间 | **启用** |
| minecraft | `context-providers/minecraft.ts` | Minecraft 服务状态 & 运行时上下文 | **禁用** |

---

## 五、禁用项汇总

### 代码层禁用（注释掉）

| 禁用位置 | 文件 | 如何恢复 |
|---------|------|---------|
| LLM 工具：`builtIn_mcpListTools` / `builtIn_mcpCallTool` | `stores/llm.ts` | 取消 `// ...await mcp()` 的注释（需已配置 MCP server） |
| LLM 工具：`builtIn_debugRandomNumber` | `stores/llm.ts` | 取消 `// ...await debug()` 的注释 |
| LLM 工具：`builtIn_emitSparkCommand` | `stores/llm.ts` | 取消 `// await createSparkCommandTool(...)` 的注释 |
| Minecraft context 注入 | `stores/chat.ts` 第 128-130 行 | 恢复 `createMinecraftContext` 导入和调用 |
| Minecraft store 初始化 | `composables/use-modules-list.ts` 第 44 行 | 取消 `// minecraftStore.initialize()` 的注释 |

### 默认未激活（设置里没开，不用额外操作）

| 模块 | 原因 |
|------|------|
| gaming-factorio | `enabled` 默认 `false`，未配置则不向后端发送任何数据 |
| discord | 未填 Token，不会连接 |
| twitter | 未填 API Key，不会连接 |

---

## 六、AI 表情工作原理（不依赖任何工具）

```
LLM 文本输出 → llm-marker-parser.ts 解析 <|...|> 标记 → writeSpecial() → 触发表情/动作
```

示例：LLM 回复 `<|ACT:{"emotion":"happy"}|> 很高兴见到你！` → 触发 `happy` 表情，TTS 只朗读纯文字。

**ACT token 正确格式**：`<|ACT:{"emotion":"happy"}|>`（payload 必须有外层 `{}`）

**已知问题与修复记录**：

| 日期 | 问题 | 修复位置 |
|------|------|---------|
| 2026-04-23 | i18n YAML 中 ACT 格式示例缺少外层 `{}`，导致模型照错误示例输出无法解析的 token | `packages/i18n/src/locales/*/base.yaml` 全部修复 |
| 2026-04-23 | 已存在的角色卡 description 是 localStorage 快照，i18n 修复不自动生效 | `stores/chat.ts performSend` 注入时自动正则修正（`<\|ACT:(?!\{)([^|]+)\|>` → 加 `{}`） |
| 2026-04-23 | `airi-card.ts initialize()` 只创建不更新，默认卡 description 永远停留在创建时的格式 | `initialize()` 加迁移逻辑，每次启动同步默认卡 description |
