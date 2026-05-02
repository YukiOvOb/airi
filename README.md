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
  <strong>An AI Virtual Character Platform with Unique Technical Innovations</strong>
</p>

<p align="center" style="margin-top: -10px;">
  Re-creating Neuro-sama — a soul container for AI waifu / virtual characters
</p>

<p align="center">
  <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/Discord-7389D8?logo=discord&logoColor=white"></a>
  <a href="https://github.com/moeru-ai/airi/blob/main/LICENSE"><img src="https://img.shields.io/github/license/moeru-ai/airi.svg"></a>
  <a href="https://github.com/moeru-ai/airi/stargazers"><img src="https://img.shields.io/github/stars/moeru-ai/airi"></a>
  <a href="https://airi.moeru.ai"><img src="https://img.shields.io/badge/Try%20It-Online-success"></a>
</p>

---

## What Makes AIRI Different?

> **TL;DR**: AIRI is not just another AI chat interface. It's a **technically innovative platform** with 6 core breakthroughs that enable truly real-time, extensible, and intelligent virtual character interactions.

### Quick Comparison with Other Projects

| Feature | Typical AI Projects | **AIRI** |
|---------|---------------------|----------|
| Response Processing | Wait for complete response | **Zero-latency streaming parsing** |
| Plugin System | Basic hooks | **Full lifecycle state machine + remote plugins** |
| Memory System | Simple key-value | **Semantic embedding search + user intent recognition** |
| Context Management | Single prompt injection | **Multi-source bucket system with strategies** |
| Platform Support | Single platform | **Web + Desktop + Mobile unified** |
| Character Animation | Static or basic | **Multi-layer real-time animation system** |

---

## Six Core Innovations

### 1. 🚀 LLM Marker Streaming Parser

**What it is:** A zero-latency parser that processes LLM streams in real-time, separating text from control markers.

```typescript
// Example: Streaming response with embedded control tokens
"Hello!" <|ACT:{"emotion":"happy"}|> "How are you?"
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         Triggers emotion animation instantly
```

**Why it matters:**
- Other projects wait for the complete response before parsing
- AIRI processes tokens as they arrive, enabling:
  - Instant emotional feedback
  - Live tool call execution
  - Smooth streaming animation

**Location:** `packages/stage-ui/src/composables/llm-marker-parser.ts`

---

### 2. 🔌 Eventa-Driven Plugin System

**What it is:** A state machine-driven plugin architecture with transport-agnostic communication.

```
Plugin Lifecycle (XState):
loading → loaded → authenticating → authenticated
→ announced → preparing → prepared → configured → ready
```

**Why it matters:**
- **Transport abstraction:** Same API for in-memory, WebSocket, and Electron
- **Remote plugins:** Run plugins in separate processes via WebSocket
- **Version negotiation:** Automatic protocol/API compatibility handling
- **Permission system:** Fine-grained apis/resources/capabilities control

**What you can do:**
```typescript
// Define a plugin that works everywhere
definePlugin({
  name: 'my-plugin',
  setup: async ({ channels, apis }) => {
    // Contribute capabilities, register tools, etc.
  }
})
```

**Location:** `packages/plugin-sdk/src/plugin-host/core.ts`

---

### 3. 🧠 Semantic Memory System

**What it is:** An intelligent memory system with embedding-based semantic search.

```typescript
export interface MemoryRecord {
  id: string
  characterId: string      // Per-character isolation
  type: 'user' | 'feedback' | 'project' | 'reference'
  content: string
  importance: 1-5         // Priority grading
  priority: 'low' | 'medium' | 'high' | 'critical'
  embedding?: number[]     // Semantic vector for search
}
```

**Key Features:**

| Feature | Description |
|---------|-------------|
| **User intent triggers** | Recognizes "记住这个" (remember this) to extract memory |
| **Semantic search** | Vector similarity search when memory count > 30 |
| **Decoupled design** | Gracefully falls back when no embedding provider |
| **Local computation** | Zero extra API cost for cosine similarity |
| **Import/Export** | JSON + CSV with merge mode |

**Comparison with Claude Code:**

| Feature | Claude Code | AIRI |
|---------|-------------|------|
| Storage | File system | IndexedDB (cross-platform) |
| User triggers | No | ✅ Phrase detection |
| Priority grading | No | ✅ importance + priority |
| Visual indicators | No | ✅ ⚠️ 🔥 ⭐ markers |
| Import/Export | Manual | ✅ Built-in |

**Location:** `packages/stage-ui/src/stores/memory/index.ts`

**Detailed Comparison:** [AIRI_Claude_Code_Memory_Comparison.md](./AIRI_Claude_Code_Memory_Comparison.md)

---

### 4. 📦 Context Bucket System

**What it is:** A multi-source context injection system with flexible update strategies.

```typescript
// Context buckets by source
const activeContexts = {
  'system:datetime': [...],     // Current time
  'system:memory': [...],       // Persistent memory
  'minecraft:state': [...],     // Game state
  'plugin:custom': [...]        // Plugin-provided
}

// Two update strategies:
ContextUpdateStrategy.ReplaceSelf  // Replace entire context
ContextUpdateStrategy.AppendSelf   // Append to context
```

**Why it matters:**
- **Source isolation:** Each context provider is independent
- **Strategy flexibility:** Choose replace or append per source
- **Debug-friendly:** 400-entry context history for inspection
- **Observable:** Full snapshots for devtools

**Location:** `packages/stage-ui/src/stores/chat/context-store.ts`

---

### 5. 🌐 Multi-Platform Unified Architecture

**What it is:** 100% business logic shared across Web, Desktop, and Mobile.

```
apps/
├── stage-web/         # Vue 3 (Web)
├── stage-tamagotchi/  # Electron (Desktop)
└── stage-pocket/      # Capacitor (iOS/Android)

packages/
├── stage-ui/          # ← All core logic shared here
├── stage-ui-live2d/   # Live2D integration
├── stage-ui-three/    # Three.js VRM support
└── plugin-sdk/        # Plugin system
```

**Platform matrix:**

| Platform | Technology | Status |
|----------|-----------|--------|
| Web | Vue 3 + Vite | ✅ Stable |
| Desktop | Electron | ✅ Stable |
| Mobile | Capacitor | ✅ Stable |

**Innovation:** Minimal platform-specific code — only entry points and adaptations.

---

### 6. 🎭 Real-time Character Animation

**What it is:** Multi-layer animation system driven by LLM emotion tags and audio analysis.

```
Audio Stream
    ↓
AudioAnalyzer (beat detection, RMS)
    ↓
Animation Layers:
  ├─ Idle Animation
  ├─ Motion Layers
  ├─ Expression (from <|ACT:...|> tags)
  └─ Lip Sync (phoneme mapping)
    ↓
Live2D / Three.js Renderer
```

**Supported engines:**
- **Live2D:** Motion, expression, beat-sync
- **Three.js VRM:** Lip-sync, expression, outline, eye-tracking

**Location:** `packages/stage-ui-live2d/`, `packages/stage-ui-three/`

---

## Architecture Overview

```
AIRI/
├── apps/
│   ├── stage-web/         # Web application
│   ├── stage-tamagotchi/  # Desktop application
│   └── stage-pocket/      # Mobile application
├── packages/
│   ├── stage-ui/          # Core business logic (shared)
│   ├── plugin-sdk/        # Plugin system
│   ├── stage-ui-live2d/   # Live2D integration
│   └── stage-ui-three/    # Three.js VRM support
└── plugins/               # Built-in plugins
    ├── airi-plugin-bilibili-laplace/
    ├── airi-plugin-claude-code/
    ├── airi-plugin-homeassistant/
    └── airi-plugin-web-extension/
```

---

## What Can AIRI Do?

### Gaming Capabilities
- [x] Play [Minecraft](https://www.minecraft.net)
- [x] Play [Factorio](https://www.factorio.com)
- [x] Play [Kerbal Space Program](https://www.kerbalspaceprogram.com/)

### Communication Platforms
- [x] Chat in [Telegram](https://telegram.org)
- [x] Chat in [Discord](https://discord.com)

### Character Rendering
- [x] VRM support with animations
- [x] Live2D support with animations
- [x] Auto blink, look at, idle movements

### Intelligence
- [x] Semantic memory with embedding search
- [x] User intent recognition
- [x] Multi-source context management

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 10+

### Installation

```bash
# Clone the repository
git clone https://github.com/moeru-ai/airi.git
cd airi

# Install dependencies
pnpm install

# Run development server
pnpm dev        # Web
pnpm dev:tamagotchi  # Desktop
```

### Build

```bash
pnpm build
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Memory System Comparison](./AIRI_Claude_Code_Memory_Comparison.md) | Detailed comparison with Claude Code's memory system |
| [Agent Guide](./AGENTS.md) | Contributor reference for the codebase |
| [Deployment Guide](./DEPLOYMENT.md) | Deployment instructions |
| [简体中文](./README.zh-CN.md) | Chinese version |

---

## Supported LLM Providers

Powered by [xsai](https://github.com/moeru-ai/xsai):

- OpenAI, Anthropic Claude, DeepSeek, Qwen, Google Gemini, xAI
- OpenRouter, vLLM, SGLang, Ollama, Groq, Mistral
- And 30+ more providers...

---

## Sub-projects

Born from AIRI development:

- [@proj-airi](https://github.com/proj-airi) organization for all AIRI-related projects
- [xsai](https://github.com/moeru-ai/xsai) - Universal LLM provider abstraction
- [memory-pgvector](https://github.com/moeru-ai/memory-pgvector) - Vector memory storage

---

## Community & Support

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

## License

MIT © [Moeru AI Project](https://github.com/moeru-ai)

---

<details>
<summary>Original README (backup)</summary>

The original README with download buttons and additional information has been backed up to `README.original.backup.md`.
</details>
