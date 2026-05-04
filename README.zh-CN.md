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
  <strong>YukiOvOb 的个人分支 - 带有自定义记忆系统增强</strong>
</p>

<p align="center" style="margin-top: -10px;">
  这是 <a href="https://github.com/moeru-ai/airi">moeru-ai/airi</a> 的个人开发分支，我在这里实现记忆系统的改进和其他功能。
</p>

---

## ⚠️ 关于此分支

这**不是**官方 AIRI 仓库。这是我的个人开发分支，我正在实现记忆系统的增强功能和其他特性。

**上游项目:** https://github.com/moeru-ai/airi

**我的专注:** 记忆系统改进、LLM 工具集成、语音中断功能

---

## 📋 我的开发日志

### ✅ 已完成的增强

#### 1. LLM 记忆工具系统
**日期:** 2026-04-30
**新增文件:**
- `packages/stage-ui/src/tools/memory.ts` (新建)

**我添加了什么:**

创建了完整的工具系统，允许 LLM 通过函数调用直接操作记忆：

```typescript
// 我实现的工具：
builtIn_memoryUpsert // 创建/更新记忆（支持重要性和优先级）
builtIn_memoryDelete // 按 ID 删除记忆
builtIn_memoryList // 列出记忆（支持过滤）
```

**为什么重要:**
LLM 现在可以在对话过程中主动管理自己的记忆，而不必仅依赖被动的提取。这实现了：
- LLM 认为信息重要时主动创建记忆
- 在对话流中更新记忆
- 带过滤的结构化记忆查询

**代码位置:** [`packages/stage-ui/src/tools/memory.ts`](./packages/stage-ui/src/tools/memory.ts)

---

#### 2. 用户意图记忆提取
**日期:** 2026-04-30
**修改文件:**
- `packages/stage-ui/src/stores/chat.ts` (第 124-207 行)

**我添加了什么:**

实现了短语触发的记忆提取，当用户明确要求 AI 记住某事时进行识别：

```typescript
// 我添加的触发短语：
const TRIGGER_PHRASES = [
  '你把我说的话记住了', // You remembered what I said
  '记住我说的话', // Remember what I said
  '记住了吗', // Did you remember
  '把这句话记住', // Remember this sentence
  '记住这个', // Remember this
  '记录下来', // Record it
  '你记住了', // You remembered
]

// 当用户说这些话时，立即触发记忆提取
```

**工作原理:**
1. 用户发送包含触发短语的消息
2. 系统在 `shouldTriggerMemoryExtraction()` 中检测到短语
3. 记忆提取运行，并带有增强的上下文突出用户的请求
4. LLM 优先提取最近的对话内容

**代码位置:** [`packages/stage-ui/src/stores/chat.ts:124-207`](./packages/stage-ui/src/stores/chat.ts)

---

#### 3. 记忆优先级与重要性系统
**日期:** 2026-04-30
**修改文件:**
- `packages/stage-ui/src/stores/memory/index.ts`
- `packages/stage-ui/src/database/adapter.ts`

**我添加了什么:**

为记忆系统扩展了两个新的元数据字段：

```typescript
export interface MemoryRecord {
  // ... 原有字段

  // 新增：重要性等级 (1-5)
  importance: 1-5  // 5 = 最重要，默认 3

  // 新增：优先级
  priority: 'low' | 'medium' | 'high' | 'critical'

  // ... 接口其余部分
}
```

**我添加的视觉指示器:**
- ⚠️ 表示 `critical` 优先级
- 🔥 表示 `high` 优先级
- ⭐ 表示 `importance >= 4`

**为什么重要:**
- 关键信息（如用户偏好）可以被标记
- 高优先级记忆在检索时优先显示
- 视觉指示器帮助一眼识别重要记忆

**代码位置:** [`packages/stage-ui/src/stores/memory/index.ts`](./packages/stage-ui/src/stores/memory/index.ts)

---

#### 4. 记忆导入/导出系统
**日期:** 2026-04-30
**修改文件:**
- `packages/stage-ui/src/stores/memory/index.ts` (第 543-627 行)

**我添加了什么:**

完整的记忆数据备份和恢复功能：

```typescript
// 我实现的导出格式：
exportMemories(format: 'json' | 'csv')  // 选择格式

// 带合并模式的导入：
importMemories(jsonData, merge: boolean)
  // merge: true  - 更新已存在的，添加新的
  // merge: false - 跳过已存在的，只添加新的
```

**JSON 导出格式:**
```json
{
  "version": 1,
  "characterId": "my-character",
  "exportedAt": "2026-04-30T...",
  "memories": [...]
}
```

**为什么重要:**
- 更换角色前备份重要记忆
- 在不同角色间共享记忆配置
- 在不同安装间迁移记忆

**代码位置:** [`packages/stage-ui/src/stores/memory/index.ts:543-627`](./packages/stage-ui/src/stores/memory/index.ts)

---

#### 5. 记忆过滤系统
**日期:** 2026-04-30
**修改文件:**
- `packages/stage-ui/src/stores/memory/index.ts` (第 504-541 行)
- `packages/stage-pages/src/pages/settings/modules/memory.vue`

**我添加了什么:**

UI 和存储级别的记忆管理过滤：

```typescript
// 我添加的过滤状态：
filterImportance: ref<number | null>(null) // 按重要性 1-5 过滤
filterPriority: ref<string | null>(null) // 按优先级过滤

// 计算过滤后的记录：
filteredRecords = computed(() => {
  let filtered = [...records.value]

  // 应用重要性过滤
  if (filterImportance.value !== null)
    filtered = filtered.filter(r => r.importance === filterImportance.value)

  // 应用优先级过滤
  if (filterPriority.value !== null)
    filtered = filtered.filter(r => r.priority === filterPriority.value)

  // 按优先级、重要性、更新时间排序
  filtered.sort((a, b) => {
    // 优先级: critical > high > medium > low
    // 然后重要性: 5 > 4 > 3 > 2 > 1
    // 然后最新的在前
  })

  return filtered
})
```

**代码位置:** [`packages/stage-ui/src/stores/memory/index.ts:504-541`](./packages/stage-ui/src/stores/memory/index.ts)

---

#### 6. LLM 记忆工具目录
**日期:** 2026-04-30
**修改文件:**
- `packages/stage-ui/src/stores/chat/context-providers/memory.ts` (第 12-25 行)

**我添加了什么:**

一个防止 LLM 幻觉不存在记忆工具名称的工具目录：

```typescript
const MEMORY_TOOLS_CATALOG = `## 记忆管理工具

如需新增、更新或删除记忆，**只能**调用以下工具（其它名称都不存在，调用会报错）：

- \`builtIn_memoryUpsert\` — 创建或更新一条记忆
  - 必需参数：\`type\`, \`name\`, \`content\`
  - 可选参数：\`description\`, \`importance\` (1-5), \`priority\`
- \`builtIn_memoryDelete\` — 按 \`id\` 删除一条记忆
- \`builtIn_memoryList\` — 列出当前记忆，可按 \`type\` 或 \`minImportance\` 过滤

不要尝试调用 \`memory.write*\`、\`airi:system:memory:*\` 或任何其它名称的记忆工具。`
```

**为什么重要:**
LLM 经常尝试调用听起来合理但不存在的工具名称。这个目录明确告诉 LLM 有哪些工具，减少 API 错误。

**代码位置:** [`packages/stage-ui/src/stores/chat/context-providers/memory.ts:12-25`](./packages/stage-ui/src/stores/chat/context-providers/memory.ts)

---

### 🚧 进行中

#### 语音中断管理器
**日期:** 2026-04-30
**新增文件:**
- `packages/stage-ui/src/services/speech/interrupt-manager.ts` (新建)

**我正在构建:**

基于 VAD (语音活动检测) 的中断系统，与 Open-LLM-VTuber 设置兼容：

```typescript
// 我使用的 VAD 设置（与 Open-LLM-VTuber 兼容）：
speechThreshold: 0.5 // 稍高一些以提高抗噪能力
minSilenceDurationMs: 800 // 与 Open-LLM-VTuber 相同
minSpeechDurationMs: 100 // 与 Open-LLM-VTuber 相同
```

**目的:**
检测用户在 AI 回复时开始说话并触发中断。这实现了自然的对话流程，用户可以在 AI 说话时打断。

**状态:** 已实现，集成进行中

**代码位置:** [`packages/stage-ui/src/services/speech/interrupt-manager.ts`](./packages/stage-ui/src/services/speech/interrupt-manager.ts)

---

## 📊 与上游项目的记忆系统对比

| 功能 | 上游 AIRI | 我的分支 |
|---------|-----------|---------|
| LLM 工具访问 | ❌ 无 | ✅ 已实现 3 个工具 |
| 用户意图触发 | ❌ 无 | ✅ 7 个触发短语 |
| 重要性/优先级 | ❌ 无 | ✅ 两级系统 |
| 视觉指示器 | ❌ 无 | ✅ ⚠️ 🔥 ⭐ 标记 |
| 导入/导出 | ❌ 无 | ✅ JSON + CSV |
| 过滤功能 | ❌ 无 | ✅ 按重要性/优先级 |
| 工具目录 | ❌ 无 | ✅ 防止幻觉 |

---

## 🛠️ 安装

```bash
# 克隆我的分支
git clone https://github.com/YukiOvOb/airi.git
cd airi

# 安装依赖
pnpm install

# 运行开发
pnpm dev              # Web 版本
pnpm dev:tamagotchi   # 桌面版本
```

---

## 📝 技术文档

| 文档 | 描述 |
|----------|-------------|
| [记忆系统对比](./AIRI_Claude_Code_Memory_Comparison.md) | 我对 AIRI 与 Claude Code 记忆系统的分析 |
| [上游 README](./README.original.backup.md) | 原始 AIRI README (已备份) |
| [English](./README.md) | 英文版页面 |

---

## 🔍 我修改的文件

```
packages/stage-ui/src/
├── tools/memory.ts                                    # 新建 - LLM 记忆工具
├── services/speech/interrupt-manager.ts              # 新建 - VAD 中断系统
├── stores/
│   ├── memory/index.ts                               # 修改 - 优先级、导入导出、过滤
│   ├── chat.ts                                       # 修改 - 用户意图触发
│   └── chat/context-providers/memory.ts              # 修改 - 工具目录
├── database/adapter.ts                               # 修改 - 记忆模式扩展
└── components/scenes/Stage.vue                       # 修改 - UI 集成
```

---

## 🤝 贡献

这是个人开发分支。如果你想为官方 AIRI 项目做贡献，请访问 https://github.com/moeru-ai/airi

---

## 📄 许可证

MIT (与上游相同)

---

<p align="center">
  <strong>上游项目:</strong> <a href="https://github.com/moeru-ai/airi">moeru-ai/airi</a>
</p>
