import type { EmbedProvider } from '@xsai-ext/providers/utils'

import type { MemoryRecord, MemoryType } from '../../database/adapter'

import { embed } from '@xsai/embed'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { memoriesRepo } from '../../database/repos/memories.repo'
import { useAiriCardStore } from '../modules/airi-card'
import { useProvidersStore } from '../providers'

const MAX_INDEX_LINES = 200
const MAX_INDEX_BYTES = 25_000
const TOP_K_MEMORIES = 5 // Number of relevant memories to retrieve

// Memory store debug logger
const DEBUG = import.meta.env.DEV || localStorage.getItem('debug:memory') === 'true'
function logDebug(...args: unknown[]) {
  if (DEBUG)
    console.log('[MemoryStore]', ...args)
}

function logError(...args: unknown[]) {
  console.error('[MemoryStore]', ...args)
}

export { type MemoryRecord, type MemoryType }

export const useMemoryStore = defineStore('memory', () => {
  const { activeCardId } = storeToRefs(useAiriCardStore())
  const providersStore = useProvidersStore()

  const records = ref<MemoryRecord[]>([])
  const indexContent = ref('')
  const ready = ref(false)

  // ── Helpers ──────────────────────────────────────────────────────────────

  function currentCharId(): string {
    return activeCardId.value || 'default'
  }

  /** Days since mtime; 0 = today, 1 = yesterday, etc. */
  function ageDays(updatedAt: number): number {
    return Math.max(0, Math.floor((Date.now() - updatedAt) / 86_400_000))
  }

  function freshnessNote(updatedAt: number): string {
    const d = ageDays(updatedAt)
    if (d === 0)
      return ''
    if (d === 1)
      return '（昨天更新，如涉及具体状态请核实）'
    return `（${d} 天前更新，如涉及具体状态请核实）`
  }

  // ── Embedding Support (decoupled - optional feature) ───────────────────────

  /**
   * Cosine similarity between two vectors. Returns -1 to 1, where 1 is identical.
   */
  function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length)
      return 0
    let dotProduct = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    if (normA === 0 || normB === 0)
      return 0
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  /**
   * Generate embedding for text using the first configured embedding provider.
   * Returns null if no provider is configured or on error (decoupled behavior).
   */
  async function generateEmbedding(text: string): Promise<number[] | null> {
    // Get the first configured embedding provider from providers store
    const configuredEmbedProviders = providersStore.persistedEmbedProvidersMetadata
    if (!configuredEmbedProviders || configuredEmbedProviders.length === 0) {
      logDebug('generateEmbedding: no embedding provider configured, skipping')
      return null
    }

    const providerId = configuredEmbedProviders[0].id
    const models = providersStore.getModelsForProvider(providerId)
    if (!models || models.length === 0) {
      logDebug('generateEmbedding: no models available for provider:', providerId)
      return null
    }

    const modelId = models[0].id

    try {
      const provider = await providersStore.getProviderInstance<EmbedProvider>(providerId)
      if (!provider) {
        logDebug('generateEmbedding: provider not found:', providerId)
        return null
      }

      const embedConfig = provider.embed(modelId)
      const result = await embed({
        ...embedConfig,
        input: text,
      })

      logDebug('generateEmbedding: generated embedding with', result.embedding.length, 'dimensions')
      return result.embedding
    }
    catch (error) {
      logError('generateEmbedding: failed', error)
      // Embedding failure should not block memory operations (decoupled)
      return null
    }
  }

  /**
   * Get current embedding configuration status (for UI display).
   */
  function getEmbeddingConfig(): { configured: boolean, providerId?: string, model?: string } {
    const configuredEmbedProviders = providersStore.persistedEmbedProvidersMetadata
    if (!configuredEmbedProviders || configuredEmbedProviders.length === 0) {
      return { configured: false }
    }

    const providerId = configuredEmbedProviders[0].id
    const models = providersStore.getModelsForProvider(providerId)
    const model = models?.[0]

    return {
      configured: true,
      providerId,
      model: model?.id,
    }
  }

  /**
   * Find memories semantically similar to the query using embedding search.
   * Returns top-K most relevant memories. Falls back to empty array if:
   * - No embedding provider configured
   * - No memories have embeddings
   * - Query embedding generation fails
   */
  async function findRelevantMemories(query: string, k: number = TOP_K_MEMORIES): Promise<MemoryRecord[]> {
    const config = getEmbeddingConfig()
    if (!config.configured) {
      logDebug('findRelevantMemories: no embedding provider configured')
      return []
    }

    const memoriesWithEmbedding = records.value.filter(r => r.embedding && r.embedding.length > 0)
    if (memoriesWithEmbedding.length === 0) {
      logDebug('findRelevantMemories: no memories with embeddings')
      return []
    }

    const queryEmbedding = await generateEmbedding(query)
    if (!queryEmbedding) {
      logDebug('findRelevantMemories: failed to generate query embedding')
      return []
    }

    // Score all memories by similarity
    const scored = memoriesWithEmbedding.map(memory => ({
      memory,
      similarity: cosineSimilarity(queryEmbedding, memory.embedding!),
    }))

    // Sort by similarity descending and take top-K
    scored.sort((a, b) => b.similarity - a.similarity)

    const topK = scored.slice(0, k).map(s => s.memory)
    logDebug('findRelevantMemories: returning', topK.length, 'memories for query:', query.substring(0, 50))
    return topK
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  async function init(): Promise<void> {
    if (ready.value) {
      logDebug('init: already ready, skipping')
      return
    }
    const charId = currentCharId()
    logDebug('init: loading memories for character:', charId)

    try {
      records.value = await memoriesRepo.listByCharacter(charId)
      logDebug(`init: loaded ${records.value.length} memories`, records.value)

      indexContent.value = await memoriesRepo.getIndex(charId)
      if (!indexContent.value && records.value.length > 0) {
        logDebug('init: rebuilding index (missing)')
        indexContent.value = await memoriesRepo.rebuildIndex(charId)
        logDebug('init: index rebuilt, length:', indexContent.value.length)
      }
      else {
        logDebug('init: existing index length:', indexContent.value.length)
      }
    }
    catch (error) {
      logError('init: failed to load memories', error)
      throw error
    }

    ready.value = true
    logDebug('init: complete, ready=true')
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function upsertMemory(
    input: Omit<MemoryRecord, 'id' | 'characterId' | 'updatedAt'> & { id?: string },
  ): Promise<MemoryRecord> {
    const charId = currentCharId()
    logDebug('upsertMemory:', input.type, input.name)

    try {
      // Generate embedding if provider is configured (decoupled - failures don't block)
      let embedding: number[] | undefined
      const config = getEmbeddingConfig()
      if (config.configured) {
        const textToEmbed = `${input.name}\n${input.description}\n${input.content}`
        embedding = await generateEmbedding(textToEmbed) || undefined
      }

      const saved = await memoriesRepo.upsert({ ...input, characterId: charId, embedding })
      const idx = records.value.findIndex(r => r.id === saved.id)
      if (idx >= 0) {
        records.value[idx] = saved
        logDebug('upsertMemory: updated existing memory:', saved.id)
      }
      else {
        records.value.unshift(saved)
        logDebug('upsertMemory: created new memory:', saved.id)
      }

      indexContent.value = await memoriesRepo.rebuildIndex(charId)
      logDebug(`upsertMemory: total memories now: ${records.value.length}`)
      return saved
    }
    catch (error) {
      logError('upsertMemory: failed', error)
      throw error
    }
  }

  async function deleteMemory(id: string): Promise<void> {
    logDebug('deleteMemory:', id)
    try {
      await memoriesRepo.delete(id)
      records.value = records.value.filter(r => r.id !== id)
      indexContent.value = await memoriesRepo.rebuildIndex(currentCharId())
      logDebug('deleteMemory: success, remaining:', records.value.length)
    }
    catch (error) {
      logError('deleteMemory: failed', error)
      throw error
    }
  }

  // ── System Prompt Injection ───────────────────────────────────────────────

  /**
   * Build the <memory> block that gets injected into the system prompt.
   * Keeps index + full content of all memories within the 25 KB budget.
   */
  function buildMemoryPrompt(): string {
    if (records.value.length === 0) {
      logDebug('buildMemoryPrompt: no memories, returning empty')
      return ''
    }

    const sections: string[] = []

    const byType: Record<MemoryType, MemoryRecord[]> = {
      user: [],
      feedback: [],
      project: [],
      reference: [],
    }
    for (const r of records.value)
      byType[r.type].push(r)

    logDebug('buildMemoryPrompt: memory counts by type:', {
      user: byType.user.length,
      feedback: byType.feedback.length,
      project: byType.project.length,
      reference: byType.reference.length,
    })

    const typeLabels: Record<MemoryType, string> = {
      user: '## 用户信息',
      feedback: '## 行为偏好',
      project: '## 项目背景',
      reference: '## 参考资源',
    }

    for (const type of ['user', 'feedback', 'project', 'reference'] as MemoryType[]) {
      const group = byType[type]
      if (group.length === 0)
        continue
      sections.push(typeLabels[type])
      for (const r of group) {
        const note = freshnessNote(r.updatedAt)
        sections.push(`### ${r.name}${note ? ` ${note}` : ''}`)
        sections.push(r.content)
      }
    }

    let prompt = `<memory>\n以下是关于用户的持久记忆，请在回复时参考：\n\n${sections.join('\n\n')}\n</memory>`

    // Enforce byte budget
    const byteSize = new TextEncoder().encode(prompt).length
    if (byteSize > MAX_INDEX_BYTES) {
      logDebug(`buildMemoryPrompt: content too large (${byteSize} bytes), falling back to index-only`)
      // Fall back to index-only when full content is too large
      prompt = `<memory>\n以下是记忆索引（完整内容已超出长度限制，请按需请求具体条目）：\n\n${indexContent.value}\n</memory>`
    }

    const lines = prompt.split('\n')
    if (lines.length > MAX_INDEX_LINES) {
      logDebug(`buildMemoryPrompt: too many lines (${lines.length}), truncating to ${MAX_INDEX_LINES}`)
      prompt = `${lines.slice(0, MAX_INDEX_LINES).join('\n')}\n<!-- 记忆内容已截断 -->`
    }

    logDebug(`buildMemoryPrompt: generated ${byteSize} bytes, ${lines.length} lines`)
    return prompt
  }

  // ── Extraction (call after a session ends, while still in foreground) ─────

  /**
   * Ask the LLM to extract memorable information from a conversation and save
   * it. Pass the generateText function from your LLM integration.
   */
  async function extractFromConversation(
    messages: Array<{ role: string, content: string }>,
    generateText: (prompt: string) => Promise<string>,
  ): Promise<void> {
    const messageCount = messages.length
    logDebug(`extractFromConversation: starting with ${messageCount} messages`)

    const existingSummary = records.value.map(r => `[${r.type}] ${r.name}: ${r.description}`).join('\n')

    const prompt = `以下是一段对话记录。请分析其中值得长期记住的信息，按四类分类输出 JSON：
- user: 用户的角色、背景、偏好、沟通风格
- feedback: 对 AI 行为的纠正或确认（含原因）
- project: 当前话题背景、决策、约束
- reference: 外部链接、资源、频道

已有记忆（可更新，不要重复创建）：
${existingSummary || '（暂无）'}

对话内容：
${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

输出格式（JSON 数组，不要输出任何其他内容）：
[
  {
    "id": "已有记忆的id（更新时填写）或留空",
    "name": "简短名称",
    "description": "一行描述",
    "type": "user|feedback|project|reference",
    "content": "记忆正文（Markdown，100字以内）"
  }
]

规则：
- 无有价值信息时输出空数组 []
- 不存储可从代码/历史推导的内容
- feedback 类必须包含原因`

    let raw: string
    try {
      logDebug('extractFromConversation: calling LLM for extraction...')
      raw = await generateText(prompt)
      logDebug('extractFromConversation: LLM response length:', raw.length)
    }
    catch (error) {
      logError('extractFromConversation: LLM call failed', error)
      return
    }

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\[[\s\S]*\])/)
    if (!jsonMatch) {
      logDebug('extractFromConversation: no JSON found in response')
      return
    }

    let extracted: Array<{
      id?: string
      name: string
      description: string
      type: string
      content: string
    }>

    try {
      extracted = JSON.parse(jsonMatch[1] || jsonMatch[0])
      logDebug('extractFromConversation: parsed JSON, item count:', extracted.length)
    }
    catch (error) {
      logError('extractFromConversation: failed to parse JSON', error)
      return
    }

    if (!Array.isArray(extracted) || extracted.length === 0) {
      logDebug('extractFromConversation: no memories extracted (empty array)')
      return
    }

    let savedCount = 0
    for (const item of extracted) {
      if (!item.name || !item.type || !item.content) {
        logDebug('extractFromConversation: skipping item with missing fields:', item)
        continue
      }
      const validTypes: MemoryType[] = ['user', 'feedback', 'project', 'reference']
      if (!validTypes.includes(item.type as MemoryType)) {
        logDebug('extractFromConversation: skipping item with invalid type:', item.type)
        continue
      }

      await upsertMemory({
        id: item.id || nanoid(),
        name: item.name,
        description: item.description || item.name,
        type: item.type as MemoryType,
        content: item.content,
      })
      savedCount++
    }

    logDebug(`extractFromConversation: complete, saved ${savedCount}/${extracted.length} memories`)
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const byType = computed(() => {
    const result: Record<MemoryType, MemoryRecord[]> = { user: [], feedback: [], project: [], reference: [] }
    for (const r of records.value)
      result[r.type].push(r)
    return result
  })

  return {
    records,
    indexContent,
    ready,
    byType,
    init,
    upsertMemory,
    deleteMemory,
    deleteRecord: deleteMemory,
    loadRecords: init,
    buildMemoryPrompt,
    extractFromConversation,
    findRelevantMemories,
    getEmbeddingConfig,
    ageDays,
    freshnessNote,
  }
})
