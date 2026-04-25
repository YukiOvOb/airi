import type { IDatabaseAdapter, IMemoriesAdapter, MemoryRecord } from '../adapter'

import { storage } from '../storage'

// Key scheme (all under the existing "local" IndexedDB mount):
//   local:memory:records:{id}            → MemoryRecord
//   local:memory:char-idx:{characterId}  → string[]  (list of ids)
//   local:memory:index:{characterId}     → string    (MEMORY.md content)

class IndexedDBMemoriesAdapter implements IMemoriesAdapter {
  async listByCharacter(characterId: string): Promise<MemoryRecord[]> {
    const ids = await storage.getItemRaw<string[]>(`local:memory:char-idx:${characterId}`) ?? []
    const records: MemoryRecord[] = []
    for (const id of ids) {
      const r = await storage.getItemRaw<MemoryRecord>(`local:memory:records:${id}`)
      if (r)
        records.push(r)
    }
    return records.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async getById(id: string): Promise<MemoryRecord | null> {
    return await storage.getItemRaw<MemoryRecord>(`local:memory:records:${id}`) ?? null
  }

  async upsert(record: MemoryRecord): Promise<void> {
    await storage.setItemRaw(`local:memory:records:${record.id}`, record)
    const ids = await storage.getItemRaw<string[]>(`local:memory:char-idx:${record.characterId}`) ?? []
    if (!ids.includes(record.id)) {
      ids.push(record.id)
      await storage.setItemRaw(`local:memory:char-idx:${record.characterId}`, ids)
    }
  }

  async delete(id: string): Promise<void> {
    const record = await this.getById(id)
    if (!record)
      return
    await storage.removeItem(`local:memory:records:${id}`)
    const ids = await storage.getItemRaw<string[]>(`local:memory:char-idx:${record.characterId}`) ?? []
    await storage.setItemRaw(
      `local:memory:char-idx:${record.characterId}`,
      ids.filter(i => i !== id),
    )
  }

  async getIndex(characterId: string): Promise<string> {
    return await storage.getItemRaw<string>(`local:memory:index:${characterId}`) ?? ''
  }

  async setIndex(characterId: string, content: string): Promise<void> {
    await storage.setItemRaw(`local:memory:index:${characterId}`, content)
  }
}

/**
 * Default adapter: uses the existing unstorage + IndexedDB setup.
 * Works on Web, Android WebView, iOS WKWebView, and Electron renderer.
 */
export class IndexedDBDatabaseAdapter implements IDatabaseAdapter {
  memories: IMemoriesAdapter = new IndexedDBMemoriesAdapter()

  async init(): Promise<void> {
    // unstorage initialises IndexedDB lazily on first access; nothing to do here.
  }
}
