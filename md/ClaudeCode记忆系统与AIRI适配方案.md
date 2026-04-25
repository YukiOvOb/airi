# Claude Code 记忆系统理解 & AIRI 适配方案

> 参考来源：YukiOvOb/claude-code-2.1.88（泄露的 Claude Code TypeScript 源码）
> 最后更新：2026-04-25

---

## 一、Claude Code 记忆系统原理

### 核心文件结构

```
~/.claude/projects/{sanitized-git-root}/
└── memory/
    ├── MEMORY.md              ← 索引文件，每次会话注入 System Prompt
    ├── user_role.md           ← type: user
    ├── feedback_testing.md    ← type: feedback
    ├── project_deadline.md    ← type: project
    └── reference_grafana.md   ← type: reference
```

### 四类记忆分类法（核心设计）

每个记忆文件带 frontmatter：

```markdown
---
name: 记忆名称
description: 一行描述（用于索引检索判断）
type: user | feedback | project | reference
---

记忆正文内容
```

| 类型 | 存什么 | 不存什么 |
|------|--------|----------|
| `user` | 用户角色、技术背景、个人偏好、沟通风格 | 可从代码/git 推导的 |
| `feedback` | 纠正过的行为 + 已验证的好做法（含 Why） | 临时任务状态 |
| `project` | 截止日期、业务决策、外部约束（含 Why） | 架构、文件路径 |
| `reference` | 外部系统指针（URL、频道、看板位置） | 已在 CLAUDE.md 的内容 |

### MEMORY.md 索引规则

- 限制：200 行 / 25KB，超限自动截断并追加警告
- 格式：每条一行，`- [Title](file.md) — 一行 hook`
- 作用：每次会话启动时全量注入 System Prompt，让 AI 知道"有哪些记忆文件存在"

### 记忆检索机制（findRelevantMemories）

1. `memoryScan.ts` 扫描所有 `.md` 文件，读取前 30 行提取 frontmatter
2. 把文件列表（name + description + mtime）传给 Claude Sonnet
3. Sonnet 判断"最多选 5 个与当前查询相关的文件"
4. **精准优先策略**：宁可漏掉也不污染上下文
5. 本轮已出现的工具文档自动跳过

### 新鲜度感知（memoryAge）

- 计算记忆文件距今天数
- 超过 1 天自动附加 staleness 警告：
  > "代码行号引用可能已过时，使用前请验证"

### 记忆写入时机

- **手动**：用户明确要求 "记住这件事"
- **自动**：后台提取 Agent（`isExtractModeActive()`）在会话结束/压缩前扫描对话，提取有价值的信息写入对应类型文件
- **纠正捕获**：用户说"不对，不要这样做"时，立即写入 feedback 类记忆

---

## 二、原版与 AIRI 移动端的差距

| 原版机制 | 移动端问题 | 解决思路 |
|----------|------------|----------|
| 文件系统存储（fs） | Capacitor 无 Node.js fs | 换用已有的 unstorage + IndexedDB（`local:memory/xxx` 前缀） |
| findRelevantMemories（额外 LLM 调用） | 延迟+费用，移动端不划算 | 静态注入，量小全量，量大只注入索引 |
| 后台提取 Agent（App 进后台触发） | **iOS WKWebView 进后台 5 秒内 JS 被挂起，LLM 调用会被中断；Android 电池优化同样会杀进程** | 改为**前台空闲触发**（见 3.3 节） |
| 本地 embedding / QMD（2GB 模型） | 手机存储/内存不允许 | 完全跳过，不用向量搜索 |
| Team Memory | 单用户伴侣 App 不需要 | 跳过 |

**iOS IndexedDB 说明**：Capacitor 的 WKWebView 把 IndexedDB 存在 App 私有容器 `Library/Application Support/` 下，不是缓存目录，系统不会自动清除，可以放心使用。AIRI 现有 `airi-local` 聊天历史就是这么存的，记忆文件直接加 `local:memory/` 前缀进同一个 unstorage 实例即可。

---

## 三、AIRI 适配方案（落地设计）

### 3.1 存储结构（IndexedDB 映射）

```
IndexedDB key: "airi-memory"
  ├── "MEMORY.md"               ← 索引，字符串
  ├── "memory/user_profile.md"  ← 用户偏好记忆
  ├── "memory/feedback_tone.md" ← AI 行为纠正记忆
  ├── "memory/project_*.md"     ← 当前话题/角色设定
  └── "memory/reference_*.md"   ← 常用链接/资源
```

每条 IndexedDB 记录：
```typescript
interface MemoryEntry {
  key: string // 相对路径，如 "memory/user_profile.md"
  content: string // 含 frontmatter 的 Markdown 全文
  mtime: number // 毫秒时间戳（用于新鲜度计算）
  type: 'user' | 'feedback' | 'project' | 'reference'
  description: string // frontmatter 里的 description，用于索引展示
}
```

### 3.2 System Prompt 注入流程

在 `context-store` 里新增一个 `MemoryContextProvider`：

```
会话启动
  ↓
读取 IndexedDB["airi-memory/MEMORY.md"]
  ↓
全量注入（< 200 行 / 25KB）或只注入索引摘要（超限时）
  ↓
附加新鲜度警告（mtime > 1 天的记忆文件）
  ↓
System Prompt = [原有 prompt] + [记忆块]
```

注入格式示例：
```
<memory>
以下是关于用户的持久记忆，请在回复中参考这些信息：

# 用户画像
[user_profile.md 内容]

# 行为纠正记录
[feedback_tone.md 内容]（⚠️ 3 天前，请核实是否仍适用）
</memory>
```

### 3.3 记忆写入时机

**触发条件一：用户明确要求**
- 识别 "记住"、"别忘了"、"下次不要这样" 等关键词
- 立即写入对应类型文件，更新 MEMORY.md 索引

**触发条件二：前台空闲触发（不能用后台触发）**

> ⚠️ iOS WKWebView 进后台约 5 秒内 JS 被系统挂起，LLM 调用会直接中断。Android 电池优化也会杀进程。必须在前台执行。

三种前台触发时机（任选其一或组合）：
- 用户点击"新对话"按钮 → 在创建新会话之前，提取上一条会话
- 对话空闲超过 N 分钟（用 VueUse `useIdle`，仍在前台时触发）
- 消息达到一定数量（每 20 条自动滚动提取一次）

触发后执行一次 LLM 调用，Prompt：
```
分析本次对话，提取值得长期记住的信息，按四类分类（user/feedback/project/reference）。
对于已有记忆文件，判断是否需要更新。输出 JSON。
```
解析 JSON，写入/更新 IndexedDB（`local:memory/`），更新 MEMORY.md 索引

**触发条件三：纠正捕获**
- 用户表达不满或纠正（"不对"、"不要这样"、"我说过..."）
- 立即追加到 `feedback` 类记忆文件

### 3.4 新鲜度感知

```typescript
function memoryFreshnessWarning(mtime: number): string | null {
  const days = Math.floor((Date.now() - mtime) / 86400000)
  if (days === 0)
    return null
  if (days === 1)
    return '（昨天的记忆，如涉及具体状态请核实）'
  return `（${days} 天前的记忆，如涉及具体状态请核实）`
}
```

### 3.5 需要新增的模块

| 模块 | 位置建议 | 功能 |
|------|----------|------|
| `MemoryStore` | `packages/stage-ui/src/stores/memory/` | IndexedDB 读写，MEMORY.md 维护 |
| `MemoryContextProvider` | `packages/stage-ui/src/stores/chat/context-providers/` | 注入记忆到 System Prompt |
| `MemoryExtractor` | `packages/stage-ui/src/stores/memory/` | 会话结束时 LLM 提取记忆 |
| `MemoryManager UI` | `packages/stage-ui/src/components/` | 可选：让用户查看/编辑记忆 |

---

## 四、不采用的方案及原因

| 方案 | 排除原因 |
|------|----------|
| OpenClaw 全套（SQLite + QMD + 向量搜索） | 移动端基础设施太重，需要额外服务进程 |
| Active Memory 前置子 Agent | 每条消息多一次 LLM 调用，延迟和成本不可接受 |
| claude-code-python-rewrite | memdir 是未实现的存根，无参考价值 |
| PgVector（已有的 memory-pgvector 包） | 服务端依赖，离线时不可用 |

---

## 五、关键参考源码位置

均在 `YukiOvOb/claude-code-2.1.88/source/src/memdir/`：

- `memdir.ts` — 核心调度，`loadMemoryPrompt()`、`buildMemoryLines()`、`truncateEntrypointContent()`
- `memoryTypes.ts` — 四类分类法定义，`parseMemoryType()`
- `findRelevantMemories.ts` — LLM 选择相关记忆（移动端跳过此步）
- `memoryScan.ts` — 扫描记忆目录，提取 frontmatter
- `memoryAge.ts` — 新鲜度计算与警告文本
- `paths.ts` — 路径解析与安全校验（移动端换成 IndexedDB key）
