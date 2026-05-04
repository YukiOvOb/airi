import type { MemoryRecord } from '../../../database/adapter'
import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import { useMemoryStore } from '../../memory'

const MEMORY_CONTEXT_ID = 'system:memory'
const RELEVANT_MEMORY_THRESHOLD = 30 // Use embedding search when memories exceed this count

// Tool catalog injected into every memory context so the LLM never has to guess
// memory tool names. Without this, models tend to hallucinate plausible-sounding
// tool names like `airi:system:memory:update` or `memory.writeObject`.
const MEMORY_TOOLS_CATALOG = `## 记忆管理工具

如需新增、更新或删除记忆，**只能**调用以下工具（其它名称都不存在，调用会报错）：

- \`builtIn_memoryUpsert\` — 创建或更新一条记忆
  - 必需参数：\`type\` (user | feedback | project | reference), \`name\`, \`content\`
  - 可选参数：\`description\`, \`importance\` (1-5), \`priority\` (low | medium | high | critical)
- \`builtIn_memoryDelete\` — 按 \`id\` 删除一条记忆
- \`builtIn_memoryList\` — 列出当前记忆，可按 \`type\` 或 \`minImportance\` 过滤

不要尝试调用 \`memory.write*\`、\`airi:system:memory:*\` 或任何其它名称的记忆工具。`

// Memory context debug logger
const DEBUG = import.meta.env.DEV || localStorage.getItem('debug:memory') === 'true'
function logDebug(...args: unknown[]) {
  if (DEBUG)
    console.log('[MemoryContext]', ...args)
}

/**
 * Build memory prompt from a specific set of memories (for injection).
 * Prioritizes high-priority and high-importance memories.
 */
function buildPromptFromMemories(memories: MemoryRecord[]): string {
  if (memories.length === 0)
    return ''

  const sections: string[] = []

  // Group by type
  const byType: Record<string, MemoryRecord[]> = {
    user: [],
    feedback: [],
    project: [],
    reference: [],
  }
  for (const r of memories)
    byType[r.type].push(r)

  logDebug('buildPromptFromMemories: memory counts by type:', {
    user: byType.user.length,
    feedback: byType.feedback.length,
    project: byType.project.length,
    reference: byType.reference.length,
  })

  const typeLabels: Record<string, string> = {
    user: '## 用户信息',
    feedback: '## 行为偏好',
    project: '## 项目背景',
    reference: '## 参考资源',
  }

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

  for (const type of ['user', 'feedback', 'project', 'reference'] as const) {
    const group = byType[type]
    if (group.length === 0)
      continue
    sections.push(typeLabels[type])
    // Sort by priority and importance
    const sorted = [...group].sort((a, b) => {
      const priorityA = priorityOrder[a.priority || 'medium'] ?? 2
      const priorityB = priorityOrder[b.priority || 'medium'] ?? 2
      if (priorityA !== priorityB)
        return priorityA - priorityB
      return (b.importance ?? 3) - (a.importance ?? 3)
    })
    for (const r of sorted) {
      const memoryStore = useMemoryStore()
      const note = memoryStore.freshnessNote(r.updatedAt)
      const priorityMark = r.priority === 'critical' ? ' ⚠️' : r.priority === 'high' ? ' 🔥' : ''
      const importanceMark = (r.importance || 3) >= 4 ? ' ⭐' : ''
      sections.push(`### ${r.name}${note ? ` ${note}` : ''}${priorityMark}${importanceMark}`)
      sections.push(r.content)
    }
  }

  return `<memory>
以下是关于用户的持久记忆，请在回复时参考：

${sections.join('\n\n')}

---
${MEMORY_TOOLS_CATALOG}
</memory>`
}

function buildEmptyMemoryPrompt(): string {
  return `<memory>
当前没有持久记忆。当你了解到关于用户、行为偏好、项目背景或参考资源的重要信息时，请使用下方工具保存。

${MEMORY_TOOLS_CATALOG}
</memory>`
}

/**
 * Creates a context message containing the current character's persistent
 * memories. Call this at session start and whenever memories change, then
 * ingest the result into useChatContextStore.
 *
 * When a query is provided and embedding search is configured, retrieves
 * semantically relevant memories instead of all memories (decoupled behavior).
 *
 * @param query - Optional query string for semantic memory retrieval
 * @param latestUserMessage - The latest user message for context (used as query if not provided)
 *
 * Returns null when there are no memories to inject.
 */
export async function createMemoryContext(options?: { query?: string, latestUserMessage?: string }): Promise<ContextMessage | null> {
  const memoryStore = useMemoryStore()
  const { query, latestUserMessage } = options || {}

  // Determine which memories to include
  let memoriesToInject: MemoryRecord[]

  if ((query || latestUserMessage) && memoryStore.records.length > RELEVANT_MEMORY_THRESHOLD) {
    // Use embedding search when available and memory count is high
    const searchQuery = query || latestUserMessage || ''
    logDebug('createMemoryContext: using embedding search for query:', searchQuery.substring(0, 50))

    const relevantMemories = await memoryStore.findRelevantMemories(searchQuery)
    if (relevantMemories.length > 0) {
      memoriesToInject = relevantMemories
      logDebug('createMemoryContext: found', relevantMemories.length, 'relevant memories via embedding search')
    }
    else {
      // Fallback to all memories if embedding search fails or finds nothing
      memoriesToInject = memoryStore.records
      logDebug('createMemoryContext: embedding search returned no results, using all memories')
    }
  }
  else {
    // Use all memories when query not provided or memory count is low
    memoriesToInject = memoryStore.records
    logDebug('createMemoryContext: using all memories, count:', memoriesToInject.length)
  }

  const prompt = memoriesToInject.length === 0
    ? buildEmptyMemoryPrompt()
    : buildPromptFromMemories(memoriesToInject)
  logDebug('createMemoryContext: injecting memory context, length:', prompt.length, 'memories:', memoriesToInject.length)

  return {
    id: nanoid(),
    contextId: MEMORY_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: prompt,
    createdAt: Date.now(),
    metadata: {
      source: {
        id: MEMORY_CONTEXT_ID,
        kind: 'plugin',
        plugin: {
          id: 'airi:system:memory',
        },
      },
    },
  }
}

/**
 * Synchronous version for backward compatibility (uses all memories).
 * Deprecated: Use createMemoryContext() with await instead.
 */
export function createMemoryContextSync(): ContextMessage | null {
  const memoryStore = useMemoryStore()
  const memoriesToInject = memoryStore.records

  const prompt = memoriesToInject.length === 0
    ? buildEmptyMemoryPrompt()
    : buildPromptFromMemories(memoriesToInject)
  logDebug('createMemoryContextSync: injecting memory context, length:', prompt.length, 'memories:', memoriesToInject.length)

  return {
    id: nanoid(),
    contextId: MEMORY_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: prompt,
    createdAt: Date.now(),
    metadata: {
      source: {
        id: MEMORY_CONTEXT_ID,
        kind: 'plugin',
        plugin: {
          id: 'airi:system:memory',
        },
      },
    },
  }
}
