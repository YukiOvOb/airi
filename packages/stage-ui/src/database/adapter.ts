export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export interface MemoryRecord {
  id: string
  characterId: string
  name: string
  description: string
  type: MemoryType
  content: string
  updatedAt: number // unix ms
}

export interface IMemoriesAdapter {
  listByCharacter: (characterId: string) => Promise<MemoryRecord[]>
  getById: (id: string) => Promise<MemoryRecord | null>
  upsert: (record: MemoryRecord) => Promise<void>
  delete: (id: string) => Promise<void>
  /** Returns MEMORY.md index content for a character */
  getIndex: (characterId: string) => Promise<string>
  setIndex: (characterId: string, content: string) => Promise<void>
}

/**
 * Platform-specific database adapter. Inject a concrete implementation at app
 * startup via registerDatabaseAdapter(). Falls back to IndexedDB if none is
 * registered before first use.
 */
export interface IDatabaseAdapter {
  /** Called once at startup; must resolve before any repo call. */
  init: () => Promise<void>
  memories: IMemoriesAdapter
}
