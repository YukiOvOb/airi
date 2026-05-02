# Technical Innovations

<p align="center">
  <a href="./README.md">English</a> |
  <a href="./TECH_INNOVATIONS.zh-CN.md">简体中文</a>
</p>

---

> **Project AIRI** is an LLM-powered virtual character platform that re-creates the experience of AI waifu/virtual characters. This document highlights the core technical innovations that make AIRI unique.

---

## Table of Contents

- [Core Architecture](#core-architecture)
- [1. LLM Marker Streaming Parser](#1-llm-marker-streaming-parser)
- [2. Eventa-Driven Plugin System](#2-eventa-driven-plugin-system)
- [3. Context Bucket System](#3-context-bucket-system)
- [4. Semantic Memory System](#4-semantic-memory-system)
- [5. Multi-Platform Unified Architecture](#5-multi-platform-unified-architecture)
- [6. Real-time Character Animation](#6-real-time-character-animation)

---

## Core Architecture

```
AIRI/
├── apps/
│   ├── stage-web/         # Vue 3 Web Application
│   ├── stage-tamagotchi/  # Electron Desktop Application
│   └── stage-pocket/      # Capacitor Mobile (iOS/Android)
├── packages/
│   ├── stage-ui/          # Core Business Logic (Shared)
│   ├── plugin-sdk/        # Plugin System
│   ├── stage-ui-live2d/   # Live2D Integration
│   └── stage-ui-three/    # Three.js VRM Support
└── plugins/               # Built-in Plugins
```

---

## 1. LLM Marker Streaming Parser

**Location:** `packages/stage-ui/src/composables/llm-marker-parser.ts`

### Overview

A zero-latency streaming parser that separates literal text from special control markers in LLM responses, enabling real-time streaming interaction.

### Key Features

```typescript
// Marker syntax: <|...|>
const TAG_OPEN = '<|'
const TAG_CLOSE = '|>'

// Example output:
// "Hello!" <|ACT:{"emotion":"happy"}|> "How are you?"
//            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//            Special token (emotion trigger)
```

### Technical Highlights

| Feature | Description |
|---------|-------------|
| **Zero-latency parsing** | Parse while streaming, no waiting for complete response |
| **Dual-stream separation** | Literal (text) vs Special (control tokens) |
| **Configurable emission** | `minLiteralEmitLength` controls output frequency |
| **Escape support** | `<{\'|\'}{\'|\'}>` for literal markers |

### Innovation

Unlike traditional approaches that wait for complete LLM responses before parsing, AIRI's parser processes tokens in real-time, enabling:
- Instant emotional feedback
- Live tool call execution
- Smooth streaming animation triggers

---

## 2. Eventa-Driven Plugin System

**Location:** `packages/plugin-sdk/src/plugin-host/core.ts`

### Overview

A state machine-driven plugin architecture with transport-agnostic communication, supporting local and remote plugins through unified APIs.

### Lifecycle State Machine

```typescript
const pluginLifecycleMachine = createMachine({
  states: {
    loading → loaded → authenticating → authenticated
    → announced → preparing → prepared → configured → ready
  }
})
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Transport abstraction** | In-memory / WebSocket / Electron support |
| **Protocol negotiation** | Automatic version compatibility handling |
| **Capability discovery** | Plugins declare and depend on capabilities |
| **Fine-grained permissions** | apis / resources / capabilities layers |
| **Remote plugin support** | WebSocket transport for cross-process plugins |

### Plugin Communication

```typescript
// Type-safe IPC via Eventa
const hostChannel = createPluginContext(transport)

// Permission-checked operations
defineInvokeHandler(hostChannel, protocolCapabilityWait, async (payload) => {
  assertPermission(session, { area: 'capabilities', action: 'wait', key: payload.key })
  return await waitForCapability(payload.key)
})
```

### Innovation

- **Unified surface**: Same API for local and remote plugins
- **Isolated contexts**: Each plugin has its own Eventa context
- **Version-safe**: Protocol/API version negotiation prevents breakage

---

## 3. Context Bucket System

**Location:** `packages/stage-ui/src/stores/chat/context-store.ts`

### Overview

A multi-source context injection system that manages disparate context sources with different update strategies.

### Architecture

```typescript
// Context buckets by source
const activeContexts = ref<Record<string, ContextMessage[]>>({})

// Two update strategies:
ContextUpdateStrategy.ReplaceSelf // Replace entire context
ContextUpdateStrategy.AppendSelf // Append to context
```

### Context Sources

| Source | Description | Strategy |
|--------|-------------|----------|
| `system:datetime` | Current time | ReplaceSelf |
| `system:memory` | Persistent memory | ReplaceSelf |
| `minecraft:state` | Game state | AppendSelf |
| `plugin:*` | Plugin-provided | Variable |

### Key Features

- **Source isolation**: Each context source managed independently
- **Strategy-based updates**: Flexible Replace vs Append control
- **History tracking**: 400-entry context history for debugging
- **Snapshot support**: Full context state capture for observability

### Innovation

Separation of context management from chat logic enables:
- Pluggable context providers
- Debug-friendly context inspection
- Flexible context merging strategies

---

## 4. Semantic Memory System

**Location:** `packages/stage-ui/src/stores/memory/index.ts`

### Overview

An embedding-powered semantic memory system with user intent recognition, priority grading, and cross-platform IndexedDB storage.

### Memory Types

```typescript
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export interface MemoryRecord {
  id: string
  characterId: string      // Per-character isolation
  name: string
  description: string
  type: MemoryType
  content: string
  importance: 1-5         // 5 = most important
  priority: 'low' | 'medium' | 'high' | 'critical'
  updatedAt: number
  embedding?: number[]     // Semantic vector
}
```

### Extraction Triggers

```typescript
// 1. User phrase triggers
const TRIGGER_PHRASES = [
  '记住我说的话',
  '记住这个',
  '把这句话记住',
  '你把我说的话记住了',
  '记住了吗',
  '记录下来'
]

// 2. Session switch triggers
watch(activeSessionId, (newId, oldId) => {
  if (oldMessages.length >= 3)
    await extractFromConversation(oldMessages)
})
```

### Semantic Retrieval

```typescript
// Decoupled embedding search (optional feature)
async function findRelevantMemories(query: string, k: number = 5) {
  const queryEmbedding = await generateEmbedding(query)
  const scored = memories.map(memory => ({
    memory,
    similarity: cosineSimilarity(queryEmbedding, memory.embedding!)
  }))
  return scored.slice(0, k).map(s => s.memory)
}
```

### Comparison with Claude Code

| Feature | Claude Code | AIRI |
|---------|-------------|------|
| Storage | File system | IndexedDB |
| Semantic search | AI model selection | Vector similarity |
| User intent triggers | No | ✅ Yes (phrase detection) |
| Priority system | No | ✅ importance + priority |
| Import/Export | Manual | ✅ JSON + CSV |

### Innovation

- **Decoupled design**: Graceful fallback when no embedding provider
- **Local computation**: Zero extra API cost for cosine similarity
- **User intent recognition**: Active extraction trigger phrases
- **Visual indicators**: ⚠️ (critical), 🔥 (high), ⭐ (importance ≥ 4)

---

## 5. Multi-Platform Unified Architecture

### Platform Support

| Platform | Technology | Status |
|----------|-----------|--------|
| **Web** | Vue 3 + Vite | ✅ Stable |
| **Desktop** | Electron | ✅ Stable |
| **Mobile** | Capacitor (iOS/Android) | ✅ Stable |

### Shared Core

```typescript
// 100% business logic shared across platforms
packages/
├── stage-ui/          # Core stores, composables, components
├── stage-ui-live2d/   # Live2D bindings
├── stage-ui-three/    # Three.js VRM support
└── plugin-sdk/        # Plugin system
```

### Innovation

- **Complete logic sharing**: `stage-ui` contains all core business logic
- **Minimal platform layer**: Only entry points and platform adaptations
- **Monorepo management**: pnpm workspace + Turbo
- **Type-safe IPC**: Eventa for cross-platform communication

---

## 6. Real-time Character Animation

### Animation Stack

```
Audio Stream
    ↓
AudioAnalyzer (beat detection, RMS)
    ↓
┌───────────────────────────────────┐
│  Animation Layering               │
│  ┌─────────────────────────────┐  │
│  │ Idle Animation             │  │
│  ├─────────────────────────────┤  │
│  │ Motion Layers              │  │
│  ├─────────────────────────────┤  │
│  │ Expression (emotion tags)  │  │
│  ├─────────────────────────────┤  │
│  │ Lip Sync (phoneme mapping) │  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
    ↓
Live2D / Three.js Renderer
```

### Supported Engines

| Engine | Package | Features |
|--------|---------|----------|
| **Live2D** | `stage-ui-live2d` | Motion, expression, beat-sync |
| **Three.js VRM** | `stage-ui-three` | Lip-sync, expression, outline, eye-tracking |

### Emotion Mapping

```typescript
// LLM output: <|ACT:{"emotion":"happy"}|>
//          → Triggers expression controller
//          → Updates Live2D/VRM model
```

### Innovation

- **Multi-layer composition**: Idle + Motion + Expression + LipSync
- **Audio-driven**: Real-time beat detection via AudioAnalyzer
- **Emotion tag mapping**: `<|ACT:...|>` directly triggers expressions
- **Dual rendering**: Simultaneous Live2D and Three.js VRM support

---

## Innovation Summary

| Rank | Innovation | Difficulty | Value |
|------|-----------|-----------|-------|
| 🥇 | LLM Marker Streaming Parser | ⭐⭐⭐⭐⭐ | True real-time streaming conversation |
| 🥈 | Eventa Plugin System | ⭐⭐⭐⭐ | Cross-process, cross-language plugin ecosystem |
| 🥉 | Semantic Memory System | ⭐⭐⭐ | Zero-cost local intelligent retrieval |

---

## Related Documentation

- [Memory System Comparison](./AIRI_Claude_Code_Memory_Comparison.md) - Detailed comparison with Claude Code's memory system
- [Agent Guide](./AGENTS.md) - Contributor reference for the codebase
- [Deployment Guide](./DEPLOYMENT.md) - Deployment instructions

---

<p align="center">
  <a href="https://github.com/moeru-ai/airi">Project AIRI</a> •
  <a href="https://discord.gg/TgQ3Cu2F7A">Discord</a> •
  <a href="https://airi.moeru.ai">Try it</a>
</p>
