import { errorMessageFrom } from '@moeru/std'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { useMemoryStore } from '../stores/memory'

// NOTICE: OpenAI strict-mode tool schemas require every key in `properties`
// to appear in `required`. We model "optional" via `z.union([..., z.null()])`
// (and `.strict()` on the object) so the LLM passes `null` instead of omitting.
// Mirrors the pattern in tools/character/orchestrator/spark-command-shared.ts.
const memoryTypeSchema = z.enum(['user', 'feedback', 'project', 'reference'])
const memoryPrioritySchema = z.enum(['low', 'medium', 'high', 'critical'])
const memoryImportanceSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
])

const tools = [
  tool({
    name: 'builtIn_memoryUpsert',
    description: 'Create or update a memory record. Use this to store important information about the user, their preferences, project context, or reference resources. Each memory should be concise and focused.',
    execute: async ({ type, name, content, importance, priority, description }) => {
      try {
        const memoryStore = useMemoryStore()
        await memoryStore.upsertMemory({
          type,
          name,
          description: description ?? name,
          content,
          importance: importance ?? undefined,
          priority: priority ?? undefined,
        })
        return `Memory "${name}" (type: ${type}) saved successfully.`
      }
      catch (error) {
        return `Error saving memory: ${errorMessageFrom(error) ?? String(error)}`
      }
    },
    parameters: z.object({
      type: memoryTypeSchema.describe('Memory type: user (user info/role), feedback (behavioral preferences), project (project context), reference (external resources)'),
      name: z.string().describe('Short, descriptive name for the memory (e.g., "User prefers concise responses")'),
      description: z.union([z.string(), z.null()]).describe('One-line description/summary of the memory. Pass null if not applicable.'),
      content: z.string().describe('Full memory content in Markdown format (keep under 200 words)'),
      importance: z.union([memoryImportanceSchema, z.null()]).describe('Importance level 1-5 (5=critical). Pass null to use default (3).'),
      priority: z.union([memoryPrioritySchema, z.null()]).describe('Priority level. Pass null to use default (medium).'),
    }).strict(),
  }),
  tool({
    name: 'builtIn_memoryDelete',
    description: 'Delete a memory record by its ID. Use cautiously - deleted memories cannot be recovered.',
    execute: async ({ id }) => {
      try {
        const memoryStore = useMemoryStore()
        await memoryStore.deleteMemory(id)
        return `Memory "${id}" deleted successfully.`
      }
      catch (error) {
        return `Error deleting memory: ${errorMessageFrom(error) ?? String(error)}`
      }
    },
    parameters: z.object({
      id: z.string().describe('The ID of the memory to delete'),
    }).strict(),
  }),
  tool({
    name: 'builtIn_memoryList',
    description: 'List all memory records with optional filtering. Use this to see what memories are currently stored.',
    execute: async ({ type, minImportance }) => {
      try {
        const memoryStore = useMemoryStore()
        let memories = memoryStore.records

        if (type)
          memories = memories.filter(m => m.type === type)
        if (minImportance != null)
          memories = memories.filter(m => (m.importance ?? 3) >= minImportance)

        if (memories.length === 0)
          return 'No memories found matching the criteria.'

        return memories.map(m =>
          `- [${m.id.slice(0, 8)}] ${m.type}: ${m.name} (importance: ${m.importance ?? 3}, priority: ${m.priority ?? 'medium'})`,
        ).join('\n')
      }
      catch (error) {
        return `Error listing memories: ${errorMessageFrom(error) ?? String(error)}`
      }
    },
    parameters: z.object({
      type: z.union([memoryTypeSchema, z.null()]).describe('Filter by memory type. Pass null for no filter.'),
      minImportance: z.union([memoryImportanceSchema, z.null()]).describe('Filter by minimum importance level (1-5). Pass null for no filter.'),
    }).strict(),
  }),
]

export const memory = async () => Promise.all(tools)
