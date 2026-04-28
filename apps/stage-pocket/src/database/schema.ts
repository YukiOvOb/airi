import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const memoriesTable = sqliteTable('memories', {
  id: text('id').primaryKey(),
  characterId: text('character_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  // NOTICE: drizzle enum check is compile-time only; the CHECK constraint is added via migrations
  type: text('type', { enum: ['user', 'feedback', 'project', 'reference'] }).notNull(),
  content: text('content').notNull(),
  updatedAt: integer('updated_at').notNull(),
  /** Embedding vector stored as JSON array string (e.g. "[0.1, -0.2, ...]"). NULL for existing records without embedding. */
  embedding: text('embedding').$type<string | null>(),
})

export const memoryIndexTable = sqliteTable('memory_index', {
  characterId: text('character_id').primaryKey(),
  content: text('content').notNull(),
  updatedAt: integer('updated_at').notNull(),
})
