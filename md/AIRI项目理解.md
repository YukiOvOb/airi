# AIRI 项目理解速查

> 本文档用于在新对话中快速恢复项目上下文，避免重复探索。最后更新：2026-04-25

---

## 项目定位

**AIRI** 是一个开源的 AI 虚拟伴侣/数字角色播放器，灵感来自 Neuro-sama（AI VTuber）。核心目标是让用户在自己的设备上运行一个有记忆、有个性的 AI 角色。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | Vue 3 + TypeScript + Vite + Pinia |
| 样式 | UnoCSS |
| 3D/动画 | Three.js + Live2D + VRM |
| 桌面端 | Electron |
| **移动端** | **Capacitor（iOS + Android）** ← 主要目标平台 |
| 后端 | Hono + Node.js |
| 浏览器存储 | **IndexedDB**（unstorage）+ DuckDB WASM |
| 服务端数据库 | PostgreSQL + Drizzle ORM + PgVector |
| LLM 集成 | @xsai/* 流式生成 |
| IPC | Eventa（类型安全事件系统） |
| 依赖注入 | injeca |

---

## 目录结构

```
AIRI/
├── apps/
│   ├── stage-web           # Web 应用
│   ├── stage-tamagotchi    # 桌面（Electron）
│   ├── stage-pocket        # 移动端（Capacitor，iOS/Android）← 重点
│   └── server              # 后端服务器
├── packages/
│   ├── stage-ui            # 核心 UI 组件库（含 stores）
│   ├── stage-ui-three      # Three.js 3D 渲染
│   ├── stage-shared        # 跨平台共享逻辑
│   ├── memory-pgvector     # 服务端向量记忆（PostgreSQL）
│   └── ...（47个包）
└── services/               # Discord/Telegram/Twitter/Minecraft 机器人
```

---

## 已有记忆/上下文相关代码

| 模块 | 路径 | 功能 |
|------|------|------|
| Context Store | `packages/stage-ui/src/stores/chat/context-store.ts` | 动态上下文管理，支持 Replace/Append 策略，**是注入 System Prompt 的入口** |
| Session Store | `packages/stage-ui/src/stores/chat/session-store.ts` | 对话历史持久化，最多 400 条 |
| Context Providers | `packages/stage-ui/src/stores/chat/context-providers/` | 日期时间、Minecraft 状态等动态注入 |
| Memory PgVector | `packages/memory-pgvector/` | 服务端向量搜索（RAG），离线时不可用 |

**关键接口**：`context-store` 的 ContextProvider 机制支持往 System Prompt 动态注入任意内容块，这是接入记忆系统的天然入口。

---

## 数据存储层（移动端视角）

```
移动端（stage-pocket / Capacitor）
  ├── IndexedDB            ← 主要本地存储，key: "airi-local"
  ├── DuckDB WASM          ← 本地查询/分析
  └── 同步队列（Outbox）   ← 联网时同步到服务端

服务端（可选）
  └── PostgreSQL + PgVector ← 向量搜索，离线时不可用
```

---

## 移动端特殊约束

- **无真正文件系统**：Capacitor 封装了 WebView，没有 Node.js fs，存储必须走 IndexedDB 或 Capacitor 插件
- **资源受限**：不能跑本地 embedding 模型（2GB+），电池/流量敏感
- **延迟敏感**：不应在每条消息前额外触发一次 LLM 调用
- **离线优先**：网络不稳定，记忆系统必须能在离线下工作

---

## 版本状态

v0.9.0-beta.6，具备完整 DevTools、测试框架（Vitest）、i18n 支持。
