import type { IDatabaseAdapter } from './adapter'

let _adapter: IDatabaseAdapter | null = null
let _initPromise: Promise<void> | null = null

/**
 * Register a platform-specific adapter. Call this before any store uses the
 * database. The adapter's init() begins immediately in the background.
 */
export function registerDatabaseAdapter(adapter: IDatabaseAdapter): void {
  _adapter = adapter
  _initPromise = adapter.init()
}

/**
 * Returns the active adapter, lazily initialising the default IndexedDB adapter
 * if none has been registered yet. Always awaits init() completion.
 */
export async function getDatabaseAdapter(): Promise<IDatabaseAdapter> {
  if (!_adapter) {
    // Lazy import avoids circular dependency at module load time
    const { IndexedDBDatabaseAdapter } = await import('./adapters/indexeddb')
    _adapter = new IndexedDBDatabaseAdapter()
    _initPromise = _adapter.init()
  }
  await _initPromise
  return _adapter
}
