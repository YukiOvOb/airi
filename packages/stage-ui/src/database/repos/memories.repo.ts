import type { MemoryRecord, MemoryType } from '../adapter'

import { nanoid } from 'nanoid'

import { getDatabaseAdapter } from '../registry'

// Memories repo debug logger
const DEBUG = import.meta.env.DEV || localStorage.getItem('debug:memory') === 'true'
function logDebug(...args: unknown[]) {
  if (DEBUG)
    console.log('[MemoriesRepo]', ...args)
}

function logError(...args: unknown[]) {
  console.error('[MemoriesRepo]', ...args)
}

export const memoriesRepo = {
  async listByCharacter(characterId: string): Promise<MemoryRecord[]> {
    logDebug('listByCharacter:', characterId)
    try {
      const db = await getDatabaseAdapter()
      const result = await db.memories.listByCharacter(characterId)
      logDebug('listByCharacter: returned', result.length, 'records')
      return result
    }
    catch (error) {
      logError('listByCharacter: failed', error)
      throw error
    }
  },

  async getById(id: string): Promise<MemoryRecord | null> {
    logDebug('getById:', id)
    try {
      const db = await getDatabaseAdapter()
      const result = await db.memories.getById(id)
      logDebug('getById:', result ? 'found' : 'not found')
      return result
    }
    catch (error) {
      logError('getById: failed', error)
      throw error
    }
  },

  async upsert(record: Omit<MemoryRecord, 'id' | 'updatedAt'> & { id?: string }): Promise<MemoryRecord> {
    logDebug('upsert:', record.type, record.name)
    try {
      const db = await getDatabaseAdapter()
      const full: MemoryRecord = {
        ...record,
        id: record.id ?? nanoid(),
        updatedAt: Date.now(),
      }
      await db.memories.upsert(full)
      logDebug('upsert: success, id:', full.id)
      return full
    }
    catch (error) {
      logError('upsert: failed', error)
      throw error
    }
  },

  async delete(id: string): Promise<void> {
    logDebug('delete:', id)
    try {
      const db = await getDatabaseAdapter()
      await db.memories.delete(id)
      logDebug('delete: success')
    }
    catch (error) {
      logError('delete: failed', error)
      throw error
    }
  },

  async getIndex(characterId: string): Promise<string> {
    logDebug('getIndex:', characterId)
    try {
      const db = await getDatabaseAdapter()
      const result = await db.memories.getIndex(characterId)
      logDebug('getIndex: length', result.length)
      return result
    }
    catch (error) {
      logError('getIndex: failed', error)
      throw error
    }
  },

  async setIndex(characterId: string, content: string): Promise<void> {
    logDebug('setIndex:', characterId, 'length:', content.length)
    try {
      const db = await getDatabaseAdapter()
      await db.memories.setIndex(characterId, content)
      logDebug('setIndex: success')
    }
    catch (error) {
      logError('setIndex: failed', error)
      throw error
    }
  },

  /** Rebuild the MEMORY.md index from current records. */
  async rebuildIndex(characterId: string): Promise<string> {
    logDebug('rebuildIndex:', characterId)
    try {
      const db = await getDatabaseAdapter()
      const records = await db.memories.listByCharacter(characterId)
      if (records.length === 0) {
        await db.memories.setIndex(characterId, '')
        logDebug('rebuildIndex: no records, empty index')
        return ''
      }

      const lines = [
        '# Memory Index',
        '',
        ...records.map(r => `- [${r.name}](memory/${r.id}.md) — ${r.description}`),
      ]

      // Enforce 200-line / 25 KB limit matching Claude Code's MEMORY.md rules
      let content = lines.join('\n')
      const MAX_BYTES = 25_000
      const MAX_LINES = 200
      const contentLines = content.split('\n')
      if (contentLines.length > MAX_LINES || new TextEncoder().encode(content).length > MAX_BYTES) {
        const trimmed = contentLines.slice(0, MAX_LINES).join('\n')
        content = `${trimmed}\n\n<!-- Index truncated: ${records.length} total memories -->`
        logDebug('rebuildIndex: truncated to', MAX_LINES, 'lines')
      }

      await db.memories.setIndex(characterId, content)
      logDebug('rebuildIndex: success, total records:', records.length)
      return content
    }
    catch (error) {
      logError('rebuildIndex: failed', error)
      throw error
    }
  },

  /** Return all memory records of a specific type for a character. */
  async listByType(characterId: string, type: MemoryType): Promise<MemoryRecord[]> {
    logDebug('listByType:', characterId, type)
    try {
      const all = await this.listByCharacter(characterId)
      return all.filter(r => r.type === type)
    }
    catch (error) {
      logError('listByType: failed', error)
      throw error
    }
  },
}
