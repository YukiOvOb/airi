import type { MemoryRecord } from '@proj-airi/stage-ui/database/adapter'

import { join } from 'node:path'

import Database from 'better-sqlite3'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { app, ipcMain } from 'electron'

// ── Schema (duplicated from stage-pocket to avoid cross-app imports) ─────────

const memoriesTable = sqliteTable('memories', {
  id: text('id').primaryKey(),
  characterId: text('character_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: text('type', { enum: ['user', 'feedback', 'project', 'reference'] }).notNull(),
  content: text('content').notNull(),
  updatedAt: integer('updated_at').notNull(),
  /** Embedding vector stored as JSON array string. NULL for existing records. */
  embedding: text('embedding').$type<string | null>(),
})

const memoryIndexTable = sqliteTable('memory_index', {
  characterId: text('character_id').primaryKey(),
  content: text('content').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

// ── IPC channel names ─────────────────────────────────────────────────────────

export const DB_IPC = {
  MEMORIES_LIST: 'db:memories:list',
  MEMORIES_GET: 'db:memories:get',
  MEMORIES_UPSERT: 'db:memories:upsert',
  MEMORIES_DELETE: 'db:memories:delete',
  MEMORIES_GET_INDEX: 'db:memories:get-index',
  MEMORIES_SET_INDEX: 'db:memories:set-index',
} as const

// ── Service setup ─────────────────────────────────────────────────────────────

export function setupDatabaseService(): void {
  const dbPath = join(app.getPath('userData'), 'airi.db')
  const sqlite = new Database(dbPath)

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL')

  // Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id           TEXT PRIMARY KEY NOT NULL,
      character_id TEXT NOT NULL,
      name         TEXT NOT NULL,
      description  TEXT NOT NULL,
      type         TEXT NOT NULL CHECK(type IN ('user','feedback','project','reference')),
      content      TEXT NOT NULL,
      updated_at   INTEGER NOT NULL,
      embedding    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_memories_char ON memories(character_id);

    CREATE TABLE IF NOT EXISTS memory_index (
      character_id TEXT PRIMARY KEY NOT NULL,
      content      TEXT NOT NULL,
      updated_at   INTEGER NOT NULL
    );
  `)

  const db = drizzle(sqlite, { schema: { memoriesTable, memoryIndexTable } })

  // Register IPC handlers
  ipcMain.handle(DB_IPC.MEMORIES_LIST, async (_, characterId: string) => {
    const rows = db.select().from(memoriesTable).where(eq(memoriesTable.characterId, characterId)).orderBy(memoriesTable.updatedAt).all()
    return rows.map(r => ({
      ...r,
      embedding: r.embedding ? JSON.parse(r.embedding) : undefined,
    })).reverse()
  })

  ipcMain.handle(DB_IPC.MEMORIES_GET, async (_, id: string) => {
    const row = db.select().from(memoriesTable).where(eq(memoriesTable.id, id)).get()
    if (!row)
      return null
    return {
      ...row,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
    }
  })

  ipcMain.handle(DB_IPC.MEMORIES_UPSERT, async (_, record: MemoryRecord) => {
    const values = {
      id: record.id,
      characterId: record.characterId,
      name: record.name,
      description: record.description,
      type: record.type,
      content: record.content,
      updatedAt: record.updatedAt,
      embedding: record.embedding ? JSON.stringify(record.embedding) : null,
    }
    db.insert(memoriesTable).values(values).onConflictDoUpdate({
      target: memoriesTable.id,
      set: {
        name: record.name,
        description: record.description,
        type: record.type,
        content: record.content,
        updatedAt: record.updatedAt,
        embedding: record.embedding ? JSON.stringify(record.embedding) : null,
      },
    }).run()
  })

  ipcMain.handle(DB_IPC.MEMORIES_DELETE, async (_, id: string) => {
    db.delete(memoriesTable).where(eq(memoriesTable.id, id)).run()
  })

  ipcMain.handle(DB_IPC.MEMORIES_GET_INDEX, async (_, characterId: string) => {
    return db.select().from(memoryIndexTable).where(eq(memoryIndexTable.characterId, characterId)).get()?.content ?? ''
  })

  ipcMain.handle(DB_IPC.MEMORIES_SET_INDEX, async (_, characterId: string, content: string) => {
    db.insert(memoryIndexTable)
      .values({ characterId, content, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: memoryIndexTable.characterId,
        set: { content, updatedAt: Date.now() },
      })
      .run()
  })
}
