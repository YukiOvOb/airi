import type { IDatabaseAdapter, IMemoriesAdapter, MemoryRecord } from '@proj-airi/stage-ui/database/adapter'

import { DB_IPC } from '../../main/services/airi/database'

// window.electron.ipcRenderer is exposed by @electron-toolkit/preload
declare const window: Window & {
  electron: {
    ipcRenderer: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
  }
}

class IpcMemoriesAdapter implements IMemoriesAdapter {
  private invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    return window.electron.ipcRenderer.invoke(channel, ...args) as Promise<T>
  }

  listByCharacter(characterId: string): Promise<MemoryRecord[]> {
    return this.invoke(DB_IPC.MEMORIES_LIST, characterId)
  }

  getById(id: string): Promise<MemoryRecord | null> {
    return this.invoke(DB_IPC.MEMORIES_GET, id)
  }

  upsert(record: MemoryRecord): Promise<void> {
    return this.invoke(DB_IPC.MEMORIES_UPSERT, record)
  }

  delete(id: string): Promise<void> {
    return this.invoke(DB_IPC.MEMORIES_DELETE, id)
  }

  getIndex(characterId: string): Promise<string> {
    return this.invoke(DB_IPC.MEMORIES_GET_INDEX, characterId)
  }

  setIndex(characterId: string, content: string): Promise<void> {
    return this.invoke(DB_IPC.MEMORIES_SET_INDEX, characterId, content)
  }
}

/**
 * Desktop adapter: calls into the Electron main process via IPC.
 * The main process owns the better-sqlite3 connection.
 */
export class IpcDatabaseAdapter implements IDatabaseAdapter {
  memories: IMemoriesAdapter = new IpcMemoriesAdapter()

  async init(): Promise<void> {
    // Main process database is set up in setupDatabaseService(); nothing to
    // initialise on the renderer side.
  }
}
