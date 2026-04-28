import type { IDatabaseAdapter, IMemoriesAdapter, MemoryRecord } from '@proj-airi/stage-ui/database/adapter'

import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/sqlite-proxy'

import { memoriesTable, memoryIndexTable } from './schema'

type DrizzleDB = ReturnType<typeof drizzle<typeof import('./schema')>>

const DB_NAME = 'airi'
const DB_VERSION = 1

const DDL = `
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
`

class SQLiteMemoriesAdapter implements IMemoriesAdapter {
  constructor(private db: DrizzleDB) {}

  async listByCharacter(characterId: string): Promise<MemoryRecord[]> {
    const rows = await this.db
      .select()
      .from(memoriesTable)
      .where(eq(memoriesTable.characterId, characterId))
      .orderBy(memoriesTable.updatedAt)
    return rows.map(r => ({
      id: r.id,
      characterId: r.characterId,
      name: r.name,
      description: r.description,
      type: r.type as MemoryRecord['type'],
      content: r.content,
      updatedAt: r.updatedAt,
      embedding: r.embedding ? JSON.parse(r.embedding) : undefined,
    })).reverse() // newest first
  }

  async getById(id: string): Promise<MemoryRecord | null> {
    const rows = await this.db
      .select()
      .from(memoriesTable)
      .where(eq(memoriesTable.id, id))
    if (!rows[0])
      return null
    const r = rows[0]
    return {
      id: r.id,
      characterId: r.characterId,
      name: r.name,
      description: r.description,
      type: r.type as MemoryRecord['type'],
      content: r.content,
      updatedAt: r.updatedAt,
      embedding: r.embedding ? JSON.parse(r.embedding) : undefined,
    }
  }

  async upsert(record: MemoryRecord): Promise<void> {
    await this.db
      .insert(memoriesTable)
      .values({
        id: record.id,
        characterId: record.characterId,
        name: record.name,
        description: record.description,
        type: record.type,
        content: record.content,
        updatedAt: record.updatedAt,
        embedding: record.embedding ? JSON.stringify(record.embedding) : null,
      })
      .onConflictDoUpdate({
        target: memoriesTable.id,
        set: {
          name: record.name,
          description: record.description,
          type: record.type,
          content: record.content,
          updatedAt: record.updatedAt,
          embedding: record.embedding ? JSON.stringify(record.embedding) : null,
        },
      })
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(memoriesTable).where(eq(memoriesTable.id, id))
  }

  async getIndex(characterId: string): Promise<string> {
    const rows = await this.db
      .select()
      .from(memoryIndexTable)
      .where(eq(memoryIndexTable.characterId, characterId))
    return rows[0]?.content ?? ''
  }

  async setIndex(characterId: string, content: string): Promise<void> {
    await this.db
      .insert(memoryIndexTable)
      .values({ characterId, content, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: memoryIndexTable.characterId,
        set: { content, updatedAt: Date.now() },
      })
  }
}

/**
 * Mobile-native SQLite adapter using @capacitor-community/sqlite + drizzle.
 * Only used when running inside a native Capacitor context (iOS / Android).
 */
export class CapacitorSQLiteDatabaseAdapter implements IDatabaseAdapter {
  memories!: IMemoriesAdapter
  private connection!: Awaited<ReturnType<SQLiteConnection['createConnection']>>

  async init(): Promise<void> {
    const sqlite = new SQLiteConnection(CapacitorSQLite)

    // Ensure the engine is consistent (required on some platforms)
    const consistency = await sqlite.checkConnectionsConsistency()
    if (!consistency.result) {
      await sqlite.closeAllConnections()
    }

    this.connection = await sqlite.createConnection(
      DB_NAME,
      false,
      'no-encryption',
      DB_VERSION,
      false,
    )
    await this.connection.open()

    // Run DDL (idempotent)
    for (const stmt of DDL.split(';').map(s => s.trim()).filter(Boolean)) {
      await this.connection.execute(`${stmt};`)
    }

    // Wire drizzle to the open connection
    const conn = this.connection
    const db = drizzle(
      async (sql, params, method) => {
        if (method === 'run') {
          await conn.run(sql, params as unknown[])
          return { rows: [] }
        }
        const result = await conn.query(sql, params as unknown[])
        return { rows: result.values ?? [] }
      },
      { schema: { memoriesTable, memoryIndexTable } },
    )

    this.memories = new SQLiteMemoriesAdapter(db as unknown as DrizzleDB)
  }
}
