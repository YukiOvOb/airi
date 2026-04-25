import { Capacitor } from '@capacitor/core'
import { registerDatabaseAdapter } from '@proj-airi/stage-ui/database/registry'

/**
 * Registers the appropriate database adapter for the current runtime:
 * - Native iOS/Android  → CapacitorSQLiteDatabaseAdapter (native SQLite)
 * - Web / dev server    → IndexedDBDatabaseAdapter (default, auto-registered)
 *
 * Call this once at the very top of main.ts before createApp().mount().
 * The adapter's init() runs in the background; all repo calls await it
 * automatically via getDatabaseAdapter().
 */
export async function setupDatabase(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    // On web / dev server, let the registry fall back to IndexedDB automatically.
    return
  }

  // Lazy-import keeps the SQLite bundle out of the web build entirely.
  const { CapacitorSQLiteDatabaseAdapter } = await import('../database/sqlite-adapter')
  registerDatabaseAdapter(new CapacitorSQLiteDatabaseAdapter())
}
