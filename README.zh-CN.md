<p align="center">
  <strong>简体中文</strong> |
  <a href="./README.md">English</a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/content/public/banner-dark-1280x640.avif">
  <source media="(prefers-color-scheme: light)" srcset="./docs/content/public/banner-light-1280x640.avif">
  <img width="100%" src="./docs/content/public/banner-light-1280x640.avif">
</picture>

<h1 align="center">Project AIRI</h1>

<p align="center">
  <strong>具有独特技术创新的 AI 虚拟角色平台</strong>
</p>

<p align="center" style="margin-top: -10px;">
  重现 Neuro-sama — AI 虚拟角色的灵魂容器
</p>

<p align="center">
  <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/Discord-7389D8?logo=discord&logoColor=white"></a>
  <a href="https://github.com/moeru-ai/airi/blob/main/LICENSE"><img src="https://img.shields.io/github/license/moeru-ai/airi.svg"></a>
  <a href="https://github.com/moeru-ai/airi/stargazers"><img src="https://img.shields.io/github/stars/moeru-ai/airi"></a>
  <a href="https://airi.moeru.ai"><img src="https://img.shields.io/badge/在线体验-success"></a>
</p>

---

## AIRI 的独特之处

> **简而言之**：AIRI 不仅仅是一个 AI 聊天界面。它是一个**技术创新平台**，拥有 6 大核心突破，能够实现真正的实时、可扩展、智能的虚拟角色交互。

### 与其他项目的快速对比

| 特性 | 普通 AI 项目 | **AIRI** |
|---------|---------------------|----------|
| 响应处理 | 等待完整响应 | **零延迟流式解析** |
| 插件系统 | 基础钩子 | **完整生命周期状态机 + 远程插件** |
| 记忆系统 | 简单键值存储 | **语义嵌入搜索 + 用户意图识别** |
| 上下文管理 | 单次提示注入 | **多源桶系统与策略管理** |
| 平台支持 | 单一平台 | **Web + 桌面 + 移动端统一** |
| 角色动画 | 静态或基础 | **多层实时动画系统** |

---

## 六大核心创新

### 1. 🚀 LLM 标记流式解析器

**是什么**：一个零延迟解析器，实时处理 LLM 流，将文本与控制标记分离。

```typescript
// 示例：嵌入控制标记的流式响应
"你好！" <|ACT:{"emotion":"happy"}|> "你好吗？"
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         立即触发情感动画
```

**为什么重要：**
- 其他项目等待完整响应后才解析
- AIRI 在接收 token 的同时处理，实现：
  - 即时情感反馈
  - 实时工具调用执行
  - 流畅的流式动画

**位置**：`packages/stage-ui/src/composables/llm-marker-parser.ts`

---

### 2. 🔌 Eventa 驱动的插件系统

**是什么**：一个状态机驱动的插件架构，具有传输无关的通信能力。

```
插件生命周期 (XState):
loading → loaded → authenticating → authenticated
→ announced → preparing → prepared → configured → ready
```

**为什么重要：**
- **传输抽象**：in-memory、WebSocket 和 Electron 使用相同的 API
- **远程插件**：通过 WebSocket 在独立进程中运行插件
- **版本协商**：自动处理协议/API 兼容性
- **权限系统**：细粒度的 apis/resources/capabilities 控制

**你可以做什么：**
```typescript
// 定义一个在任何地方都能工作的插件
definePlugin({
  name: 'my-plugin',
  setup: async ({ channels, apis }) => {
    // 贡献能力、注册工具等
  }
})
```

**位置**：`packages/plugin-sdk/src/plugin-host/core.ts`

---

### 3. 🧠 语义记忆系统

**是什么**：一个具有基于嵌入的语义搜索的智能记忆系统。

```typescript
export interface MemoryRecord {
  id: string
  characterId: string      // 按角色隔离
  type: 'user' | 'feedback' | 'project' | 'reference'
  content: string
  importance: 1-5         // 优先级分级
  priority: 'low' | 'medium' | 'high' | 'critical'
  embedding?: number[]     // 搜索用语义向量
}
```

**核心功能：**

| 功能 | 描述 |
|---------|-------------|
| **用户意图触发** | 识别"记住这个"等短语来提取记忆 |
| **语义搜索** | 记忆数 > 30 时启用向量相似度搜索 |
| **解耦设计** | 无嵌入提供者时优雅降级 |
| **本地计算** | 余弦相似度零额外 API 成本 |
| **导入/导出** | JSON + CSV 支持合并模式 |

**与 Claude Code 对比：**

| 功能 | Claude Code | AIRI |
|---------|-------------|------|
| 存储 | 文件系统 | IndexedDB（跨平台） |
| 用户触发 | 无 | ✅ 短语检测 |
| 优先级分级 | 无 | ✅ importance + priority |
| 视觉标记 | 无 | ✅ ⚠️ 🔥 ⭐ 标记 |
| 导入/导出 | 手动 | ✅ 内置支持 |

**位置**：`packages/stage-ui/src/stores/memory/index.ts`

**详细对比**：[AIRI_Claude_Code_Memory_Comparison.md](./AIRI_Claude_Code_Memory_Comparison.md)

---

### 4. 📦 上下文桶系统

**是什么**：一个具有灵活更新策略的多源上下文注入系统。

```typescript
// 按源分类的上下文桶
const activeContexts = {
  'system:datetime': [...],     // 当前时间
  'system:memory': [...],       // 持久记忆
  'minecraft:state': [...],     // 游戏状态
  'plugin:custom': [...]        // 插件提供
}

// 两种更新策略：
ContextUpdateStrategy.ReplaceSelf  // 替换整个上下文
ContextUpdateStrategy.AppendSelf   // 追加到上下文
```

**为什么重要：**
- **源隔离**：每个上下文提供者独立管理
- **策略灵活**：可为每个源选择替换或追加
- **调试友好**：400 条上下文历史记录用于检查
- **可观测**：完整的快照用于开发工具

**位置**：`packages/stage-ui/src/stores/chat/context-store.ts`

---

### 5. 🌐 多平台统一架构

**是什么**：Web、桌面和移动端之间 100% 共享业务逻辑。

```
apps/
├── stage-web/         # Vue 3 (Web)
├── stage-tamagotchi/  # Electron (桌面)
└── stage-pocket/      # Capacitor (iOS/Android)

packages/
├── stage-ui/          # ← 所有核心逻辑在此共享
├── stage-ui-live2d/   # Live2D 集成
├── stage-ui-three/    # Three.js VRM 支持
└── plugin-sdk/        # 插件系统
```

**平台矩阵：**

| 平台 | 技术 | 状态 |
|----------|-----------|--------|
| Web | Vue 3 + Vite | ✅ 稳定 |
| 桌面 | Electron | ✅ 稳定 |
| 移动端 | Capacitor | ✅ 稳定 |

**创新**：最少平台特定代码——只有入口点和适配层。

---

### 6. 🎭 实时角色动画

**是什么**：由 LLM 情感标签和音频分析驱动的多层动画系统。

```
音频流
    ↓
AudioAnalyzer (节拍检测、RMS)
    ↓
动画层：
  ├─ 空闲动画
  ├─ 动作层
  ├─ 表情（来自 <|ACT:...|> 标签）
  └─ 口型同步（音素映射）
    ↓
Live2D / Three.js 渲染器
```

**支持的引擎：**
- **Live2D**：动作、表情、节拍同步
- **Three.js VRM**：口型同步、表情、轮廓、眼球追踪

**位置**：`packages/stage-ui-live2d/`、`packages/stage-ui-three/`

---

## 架构概览

```
AIRI/
├── apps/
│   ├── stage-web/         # Web 应用
│   ├── stage-tamagotchi/  # 桌面应用
│   └── stage-pocket/      # 移动应用
├── packages/
│   ├── stage-ui/          # 核心业务逻辑（共享）
│   ├── plugin-sdk/        # 插件系统
│   ├── stage-ui-live2d/   # Live2D 集成
│   └── stage-ui-three/    # Three.js VRM 支持
└── plugins/               # 内置插件
    ├── airi-plugin-bilibili-laplace/
    ├── airi-plugin-claude-code/
    ├── airi-plugin-homeassistant/
    └── airi-plugin-web-extension/
```

---

## AIRI 能做什么？

### 游戏能力
- [x] 玩 [Minecraft](https://www.minecraft.net)
- [x] 玩 [Factorio](https://www.factorio.com)
- [x] 玩 [坎巴拉太空计划](https://www.kerbalspaceprogram.com/)

### 通信平台
- [x] 在 [Telegram](https://telegram.org) 聊天
- [x] 在 [Discord](https://discord.com) 聊天

### 角色渲染
- [x] VRM 支持及动画
- [x] Live2D 支持及动画
- [x] 自动眨眼、注视、空闲动作

### 智能能力
- [x] 带嵌入搜索的语义记忆
- [x] 用户意图识别
- [x] 多源上下文管理

---

## 快速开始

### 前置要求

- Node.js 18+
- pnpm 10+

### 安装

```bash
# 克隆仓库
git clone https://github.com/moeru-ai/airi.git
cd airi

# 安装依赖
pnpm install

# 运行开发服务器
pnpm dev        # Web
pnpm dev:tamagotchi  # 桌面
```

### 构建

```bash
pnpm build
```

---

## 文档

| 文档 | 描述 |
|----------|-------------|
| [记忆系统对比](./AIRI_Claude_Code_Memory_Comparison.md) | 与 Claude Code 记忆系统的详细对比 |
| [Agent 指南](./AGENTS.md) | 代码库贡献者参考 |
| [部署指南](./DEPLOYMENT.md) | 部署说明 |
| [English](./README.md) | 英文版 |

---

## 支持的 LLM 提供商

由 [xsai](https://github.com/moeru-ai/xsai) 提供支持：

- OpenAI、Anthropic Claude、DeepSeek、Qwen、Google Gemini、xAI
- OpenRouter、vLLM、SGLang、Ollama、Groq、Mistral
- 以及 30+ 更多提供商...

---

## 子项目

AIRI 开发中诞生的项目：

- [@proj-airi](https://github.com/proj-airi) 组织，包含所有 AIRI 相关项目
- [xsai](https://github.com/moeru-ai/xsai) - 通用 LLM 提供商抽象
- [memory-pgvector](https://github.com/moeru-ai/memory-pgvector) - 向量记忆存储

---

## 社区与支持

<p align="center">
  <a href="https://discord.gg/TgQ3Cu2F7A">
    <img src="https://img.shields.io/badge/Discord-7389D8?logo=discord&logoColor=white">
  </a>
  <a href="https://x.com/proj_airi">
    <img src="https://img.shields.io/badge/%40proj__airi-black?logo=x">
  </a>
  <a href="https://github.com/moeru-ai/airi/stargazers">
    <img src="https://img.shields.io/github/stars/moeru-ai/airi?style=social">
  </a>
</p>

---

## 许可证

MIT © [Moeru AI Project](https://github.com/moeru-ai)

---

<details>
<summary>原始 README（备份）</summary>

带有下载按钮和额外信息的原始 README 已备份至 `README.original.backup.md`。
</details>
