import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import { useMemoryStore } from '../../memory'

const MEMORY_CONTEXT_ID = 'system:memory'

// Memory context debug logger
const DEBUG = import.meta.env.DEV || localStorage.getItem('debug:memory') === 'true'
function logDebug(...args: unknown[]) {
  if (DEBUG)
    console.log('[MemoryContext]', ...args)
}

/**
 * Creates a context message containing the current character's persistent
 * memories. Call this at session start and whenever memories change, then
 * ingest the result into useChatContextStore.
 *
 * Returns null when there are no memories to inject.
 */
export function createMemoryContext(): ContextMessage | null {
  const memoryStore = useMemoryStore()

  const prompt = memoryStore.buildMemoryPrompt()
  if (!prompt) {
    logDebug('createMemoryContext: no memories to inject')
    return null
  }

  logDebug('createMemoryContext: injecting memory context, length:', prompt.length)

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
