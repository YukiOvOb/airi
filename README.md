<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> |
  <strong>English</strong>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./docs/content/public/banner-dark-1280x640.avif">
  <source media="(prefers-color-scheme: light)" srcset="./docs/content/public/banner-light-1280x640.avif">
  <img width="100%" src="./docs/content/public/banner-light-1280x640.avif">
</picture>

<h1 align="center">Project AIRI</h1>

<p align="center">
  <strong>YukiOvOb's Fork with Custom Memory System Enhancements</strong>
</p>

<p align="center" style="margin-top: -10px;">
  This is a personal fork of <a href="https://github.com/moeru-ai/airi">moeru-ai/airi</a> with memory system improvements and additional features I've developed.
</p>

---

## ⚠️ About This Fork

This is **not** the official AIRI repository. This is my personal development fork where I'm implementing enhancements to the memory system and other features.

**Upstream:** https://github.com/moeru-ai/airi

**My Focus:** Memory system improvements, LLM tool integration, and speech interrupt capabilities

---

## 📋 My Development Log

### ✅ Completed Enhancements

#### 1. Memory Tool System for LLM
**Date:** 2026-04-30
**Files Added:**
- `packages/stage-ui/src/tools/memory.ts` (NEW)

**What I Added:**

Created a complete tool system that allows the LLM to directly manipulate memory through function calls:

```typescript
// Tools I implemented:
builtIn_memoryUpsert // Create/update memory with importance & priority
builtIn_memoryDelete // Delete memory by ID
builtIn_memoryList // List memories with filtering
```

**Why This Matters:**
The LLM can now actively manage its own memory during conversations instead of relying solely on passive extraction. This enables:
- Proactive memory creation when the LLM deems information important
- Memory updates during conversation flow
- Structured memory queries with filters

**Code Location:** [`packages/stage-ui/src/tools/memory.ts`](./packages/stage-ui/src/tools/memory.ts)

---

#### 2. User Intent Memory Extraction
**Date:** 2026-04-30
**Files Modified:**
- `packages/stage-ui/src/stores/chat.ts` (lines 124-207)

**What I Added:**

Implemented phrase-triggered memory extraction that recognizes when users explicitly ask the AI to remember something:

```typescript
// Trigger phrases I added:
const TRIGGER_PHRASES = [
  '你把我说的话记住了', // You remembered what I said
  '记住我说的话', // Remember what I said
  '记住了吗', // Did you remember
  '把这句话记住', // Remember this sentence
  '记住这个', // Remember this
  '记录下来', // Record it
  '你记住了', // You remembered
]

// When user says these, memory extraction is triggered immediately
```

**How It Works:**
1. User sends a message containing a trigger phrase
2. System detects the phrase in `shouldTriggerMemoryExtraction()`
3. Memory extraction runs with enhanced context highlighting the user's request
4. LLM prioritizes recent conversation for extraction

**Code Location:** [`packages/stage-ui/src/stores/chat.ts:124-207`](./packages/stage-ui/src/stores/chat.ts)

---

#### 3. Memory Priority & Importance System
**Date:** 2026-04-30
**Files Modified:**
- `packages/stage-ui/src/stores/memory/index.ts`
- `packages/stage-ui/src/database/adapter.ts`

**What I Added:**

Extended the memory system with two new metadata fields:

```typescript
export interface MemoryRecord {
  // ... existing fields

  // NEW: Importance level (1-5)
  importance: 1-5  // 5 = most important, default 3

  // NEW: Priority level
  priority: 'low' | 'medium' | 'high' | 'critical'

  // ... rest of interface
}
```

**Visual Indicators I Added:**
- ⚠️ for `critical` priority
- 🔥 for `high` priority
- ⭐ for `importance >= 4`

**Why This Matters:**
- Critical information (like user preferences) can be flagged
- High-priority memories surface first in retrieval
- Visual indicators help identify important memories at a glance

**Code Location:** [`packages/stage-ui/src/stores/memory/index.ts`](./packages/stage-ui/src/stores/memory/index.ts)

---

#### 4. Memory Import/Export System
**Date:** 2026-04-30
**Files Modified:**
- `packages/stage-ui/src/stores/memory/index.ts` (lines 543-627)

**What I Added:**

Full backup and restore capabilities for memory data:

```typescript
// Export formats I implemented:
exportMemories(format: 'json' | 'csv')  // Choose format

// Import with merge mode:
importMemories(jsonData, merge: boolean)
  // merge: true  - Update existing, add new
  // merge: false - Skip existing, only add new
```

**JSON Export Format:**
```json
{
  "version": 1,
  "characterId": "my-character",
  "exportedAt": "2026-04-30T...",
  "memories": [...]
}
```

**Why This Matters:**
- Backup important memories before character changes
- Share memory configurations across characters
- Migrate memories between different installations

**Code Location:** [`packages/stage-ui/src/stores/memory/index.ts:543-627`](./packages/stage-ui/src/stores/memory/index.ts)

---

#### 5. Memory Filtering System
**Date:** 2026-04-30
**Files Modified:**
- `packages/stage-ui/src/stores/memory/index.ts` (lines 504-541)
- `packages/stage-pages/src/pages/settings/modules/memory.vue`

**What I Added:**

UI and store-level filtering for memory management:

```typescript
// Filter states I added:
filterImportance: ref<number | null>(null) // Filter by importance 1-5
filterPriority: ref<string | null>(null) // Filter by priority level

// Computed filtered records:
filteredRecords = computed(() => {
  let filtered = [...records.value]

  // Apply importance filter
  if (filterImportance.value !== null)
    filtered = filtered.filter(r => r.importance === filterImportance.value)

  // Apply priority filter
  if (filterPriority.value !== null)
    filtered = filtered.filter(r => r.priority === filterPriority.value)

  // Sort by priority, then importance, then update time
  filtered.sort((a, b) => {
    // Priority: critical > high > medium > low
    // Then importance: 5 > 4 > 3 > 2 > 1
    // Then newest first
  })

  return filtered
})
```

**Code Location:** [`packages/stage-ui/src/stores/memory/index.ts:504-541`](./packages/stage-ui/src/stores/memory/index.ts)

---

#### 6. Memory Tools Catalog for LLM
**Date:** 2026-04-30
**Files Modified:**
- `packages/stage-ui/src/stores/chat/context-providers/memory.ts` (lines 12-25)

**What I Added:**

A tool catalog that prevents the LLM from hallucinating non-existent memory tool names:

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

**Why This Matters:**
LLMs often try to call plausible-sounding but non-existent tool names. This catalog explicitly tells the LLM what tools exist, reducing API errors.

**Code Location:** [`packages/stage-ui/src/stores/chat/context-providers/memory.ts:12-25`](./packages/stage-ui/src/stores/chat/context-providers/memory.ts)

---

### 🚧 In Progress

#### Speech Interrupt Manager
**Date:** 2026-04-30
**Files Added:**
- `packages/stage-ui/src/services/speech/interrupt-manager.ts` (NEW)

**What I'm Building:**

A VAD (Voice Activity Detection) based interrupt system compatible with Open-LLM-VTuber settings:

```typescript
// VAD settings I'm using (compatible with Open-LLM-VTuber):
speechThreshold: 0.5 // Slightly higher for noise immunity
minSilenceDurationMs: 800 // Same as Open-LLM-VTuber
minSpeechDurationMs: 100 // Same as Open-LLM-VTuber
```

**Purpose:**
Detect when user starts speaking during AI response and trigger interrupt. This enables natural conversation flow where users can cut in when the AI is talking.

**Status:** Implemented, integration in progress

**Code Location:** [`packages/stage-ui/src/services/speech/interrupt-manager.ts`](./packages/stage-ui/src/services/speech/interrupt-manager.ts)

---

## 📊 Memory System Comparison with Upstream

| Feature | Upstream AIRI | My Fork |
|---------|---------------|---------|
| LLM Tool Access | ❌ None | ✅ 3 tools implemented |
| User Intent Triggers | ❌ None | ✅ 7 trigger phrases |
| Importance/Priority | ❌ None | ✅ 2-level system |
| Visual Indicators | ❌ None | ✅ ⚠️ 🔥 ⭐ markers |
| Import/Export | ❌ None | ✅ JSON + CSV |
| Filtering | ❌ None | ✅ By importance/priority |
| Tool Catalog | ❌ None | ✅ Prevents hallucinations |

---

## 🛠️ Installation

```bash
# Clone my fork
git clone https://github.com/YukiOvOb/airi.git
cd airi

# Install dependencies
pnpm install

# Run development
pnpm dev              # Web version
pnpm dev:tamagotchi   # Desktop version
```

---

## 📝 Technical Documentation

| Document | Description |
|----------|-------------|
| [Memory System Comparison](./AIRI_Claude_Code_Memory_Comparison.md) | My analysis of AIRI vs Claude Code memory systems |
| [Upstream README](./README.original.backup.md) | Original AIRI README (backed up) |
| [简体中文](./README.zh-CN.md) | Chinese version of this page |

---

## 🔍 Files I've Modified

```
packages/stage-ui/src/
├── tools/memory.ts                                    # NEW - LLM memory tools
├── services/speech/interrupt-manager.ts              # NEW - VAD interrupt system
├── stores/
│   ├── memory/index.ts                               # MODIFIED - Priority, import/export, filter
│   ├── chat.ts                                       # MODIFIED - User intent triggers
│   └── chat/context-providers/memory.ts              # MODIFIED - Tool catalog
├── database/adapter.ts                               # MODIFIED - Memory schema extensions
└── components/scenes/Stage.vue                       # MODIFIED - UI integration
```

---

## 🤝 Contributing

This is a personal development fork. If you want to contribute to the official AIRI project, please visit https://github.com/moeru-ai/airi

---

## 📄 License

MIT (same as upstream)

---

<p align="center">
  <strong>Upstream Project:</strong> <a href="https://github.com/moeru-ai/airi">moeru-ai/airi</a>
</p>
