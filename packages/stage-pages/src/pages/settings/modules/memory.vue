<script setup lang="ts">
import type { MemoryPriority, MemoryRecord, MemoryType } from '@proj-airi/stage-ui/database/adapter'

import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const memoryStore = useMemoryStore()

const { records, ready, filterImportance, filterPriority } = storeToRefs(memoryStore)

// Memory type filter
const selectedType = ref<MemoryType | 'all'>('all')
const searchQuery = ref('')

// Modal states
const showCreateModal = ref(false)
const showImportModal = ref(false)
const showExportMenu = ref(false)

// Import state
const importJson = ref('')
const importMerge = ref(false)
const importResult = ref<{ imported: number, skipped: number, errors: string[] } | null>(null)
const isImporting = ref(false)

// Create/Edit form state
const editingId = ref<string | null>(null)
const editForm = ref({
  name: '',
  description: '',
  content: '',
  type: 'user' as MemoryType,
  importance: 3 as 1 | 2 | 3 | 4 | 5,
  priority: 'medium' as MemoryPriority,
})

// Get unique memory types
const memoryTypes = computed(() => {
  const types = new Set<MemoryType>()
  records.value.forEach(record => types.add(record.type))
  return Array.from(types)
})

// Combined filtered records (type filter + search + store filters)
const displayRecords = computed(() => {
  // Get the filtered records from the store (filtered by importance/priority)
  let filtered = memoryStore.filteredRecords as MemoryRecord[]

  if (selectedType.value !== 'all') {
    filtered = filtered.filter(r => r.type === selectedType.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(r =>
      r.content.toLowerCase().includes(query)
      || r.name.toLowerCase().includes(query)
      || r.description.toLowerCase().includes(query),
    )
  }

  return filtered
})

// Group records by date
const groupedRecords = computed(() => {
  const groups: Record<string, MemoryRecord[]> = {}
  displayRecords.value.forEach((record) => {
    const date = new Date(record.updatedAt)
    const dateKey = formatDate(date)
    if (!groups[dateKey]) {
      groups[dateKey] = []
    }
    groups[dateKey].push(record)
  })
  return groups
})

function formatDate(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const recordDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (recordDate.getTime() === today.getTime()) {
    return t('settings.memory.today')
  }
  if (recordDate.getTime() === yesterday.getTime()) {
    return t('settings.memory.yesterday')
  }
  return date.toLocaleDateString()
}

function getRecordIcon(type: MemoryType): string {
  switch (type) {
    case 'user':
      return 'i-carbon-user'
    case 'feedback':
      return 'i-carbon-feedback'
    case 'project':
      return 'i-carbon-project'
    case 'reference':
      return 'i-carbon-document'
    default:
      return 'i-carbon-text'
  }
}

function getRecordTypeLabel(type: MemoryType): string {
  switch (type) {
    case 'user':
      return t('settings.memory.typeUser')
    case 'feedback':
      return t('settings.memory.typeFeedback')
    case 'project':
      return t('settings.memory.typeProject')
    case 'reference':
      return t('settings.memory.typeReference')
    default:
      return type
  }
}

function getRecordTypeColor(type: MemoryType): string {
  switch (type) {
    case 'user':
      return 'text-blue-500'
    case 'feedback':
      return 'text-yellow-500'
    case 'project':
      return 'text-green-500'
    case 'reference':
      return 'text-purple-500'
    default:
      return 'text-gray-500'
  }
}

function getImportanceColor(importance: number): string {
  switch (importance) {
    case 1:
      return 'text-gray-400'
    case 2:
      return 'text-green-400'
    case 3:
      return 'text-yellow-400'
    case 4:
      return 'text-orange-400'
    case 5:
      return 'text-red-500'
    default:
      return 'text-gray-400'
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'low':
      return 'text-gray-400 bg-gray-100'
    case 'medium':
      return 'text-blue-400 bg-blue-100'
    case 'high':
      return 'text-orange-400 bg-orange-100'
    case 'critical':
      return 'text-red-500 bg-red-100'
    default:
      return 'text-gray-400 bg-gray-100'
  }
}

function getPriorityLabel(priority: string): string {
  switch (priority) {
    case 'low':
      return '低'
    case 'medium':
      return '中'
    case 'high':
      return '高'
    case 'critical':
      return '紧急'
    default:
      return '中'
  }
}

function viewRecord(record: MemoryRecord) {
  // Navigate to memory detail view
  router.push({
    name: 'settings-memory-detail',
    params: { id: record.id },
  })
}

function deleteRecord(record: MemoryRecord) {
  memoryStore.deleteRecord(record.id)
}

// Start editing a record
function startEdit(record: MemoryRecord) {
  editingId.value = record.id
  editForm.value = {
    name: record.name,
    description: record.description,
    content: record.content,
    type: record.type,
    importance: record.importance ?? 3,
    priority: record.priority ?? 'medium',
  }
}

// Open create modal
function openCreateModal() {
  editingId.value = null
  editForm.value = {
    name: '',
    description: '',
    content: '',
    type: 'user',
    importance: 3,
    priority: 'medium',
  }
  showCreateModal.value = true
}

// Cancel editing
function cancelEdit() {
  editingId.value = null
  showCreateModal.value = false
  editForm.value = {
    name: '',
    description: '',
    content: '',
    type: 'user',
    importance: 3,
    priority: 'medium',
  }
}

// Save edits or create new
async function saveMemory() {
  if (editingId.value) {
    // Update existing
    const record = records.value.find(r => r.id === editingId.value)
    if (record) {
      await memoryStore.upsertMemory({
        id: record.id,
        name: editForm.value.name,
        description: editForm.value.description,
        type: editForm.value.type,
        content: editForm.value.content,
        importance: editForm.value.importance,
        priority: editForm.value.priority,
      })
    }
  }
  else {
    // Create new
    await memoryStore.upsertMemory({
      name: editForm.value.name,
      description: editForm.value.description,
      type: editForm.value.type,
      content: editForm.value.content,
      importance: editForm.value.importance,
      priority: editForm.value.priority,
    })
  }
  showCreateModal.value = false
  editingId.value = null
}

// Save edits (inline mode)
async function saveEdit(record: MemoryRecord) {
  await memoryStore.upsertMemory({
    id: record.id,
    name: editForm.value.name,
    description: editForm.value.description,
    type: record.type,
    content: editForm.value.content,
    importance: editForm.value.importance,
    priority: editForm.value.priority,
  })
  editingId.value = null
}

// Refresh records
function refresh() {
  memoryStore.loadRecords()
}

// Export memories
async function exportMemories(format: 'json' | 'csv' = 'json') {
  const data = await memoryStore.exportMemories(format)
  const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `memories_${new Date().toISOString().split('T')[0]}.${format}`
  a.click()
  URL.revokeObjectURL(url)
  showExportMenu.value = false
}

// Import memories
async function importMemories() {
  if (!importJson.value.trim()) {
    return
  }

  isImporting.value = true
  importResult.value = null

  try {
    const result = await memoryStore.importMemories(importJson.value, importMerge.value)
    importResult.value = result
    if (result.imported > 0) {
      // Close modal on success
      showImportModal.value = false
      importJson.value = ''
      importMerge.value = false
      importResult.value = null
    }
  }
  catch (error) {
    importResult.value = {
      imported: 0,
      skipped: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
  finally {
    isImporting.value = false
  }
}

// Clear filters
function clearFilters() {
  memoryStore.clearFilters()
}

onMounted(() => {
  memoryStore.loadRecords()
})
</script>

<template>
  <div class="h-full flex flex-col bg-gray-50">
    <!-- Header -->
    <div class="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
      <button
        class="flex items-center justify-center text-gray-600 hover:text-gray-900"
        @click="router.back()"
      >
        <div class="i-carbon-arrow-left text-xl" />
      </button>
      <h1 class="text-lg text-gray-900 font-semibold">
        {{ t('settings.memory.title') }}
      </h1>
      <div class="ml-auto flex items-center gap-2">
        <!-- Import Button -->
        <button
          class="flex items-center justify-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
          @click="showImportModal = true"
        >
          <div class="i-carbon-upload mr-1" />
          导入
        </button>
        <!-- Export Dropdown -->
        <div class="relative">
          <button
            class="flex items-center justify-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
            @click="showExportMenu = !showExportMenu"
          >
            <div class="i-carbon-download mr-1" />
            导出
          </button>
          <div
            v-if="showExportMenu"
            class="absolute right-0 top-full z-10 mt-1 border border-gray-200 rounded-lg bg-white shadow-lg"
          >
            <button
              class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              @click="exportMemories('json')"
            >
              导出为 JSON
            </button>
            <button
              class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              @click="exportMemories('csv')"
            >
              导出为 CSV
            </button>
          </div>
        </div>
        <!-- Create Button -->
        <button
          class="flex items-center justify-center rounded-lg bg-pink-500 px-3 py-1.5 text-sm text-white hover:bg-pink-600"
          @click="openCreateModal"
        >
          <div class="i-carbon-add mr-1" />
          新建记忆
        </button>
        <!-- Refresh Button -->
        <button
          class="flex items-center justify-center rounded-full p-2 text-gray-600 hover:bg-gray-100"
          :title="t('settings.memory.refresh')"
          @click="refresh"
        >
          <div class="i-carbon-refresh text-xl" />
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="border-b border-gray-200 bg-white px-4 py-3">
      <div class="mb-3 flex items-center gap-2 overflow-x-auto">
        <button
          class="whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors"
          :class="selectedType === 'all' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
          @click="selectedType = 'all'"
        >
          {{ t('settings.memory.allTypes') }}
        </button>
        <button
          v-for="type in memoryTypes"
          :key="type"
          class="whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors"
          :class="selectedType === type ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
          @click="selectedType = type"
        >
          {{ getRecordTypeLabel(type) }}
        </button>
      </div>
      <!-- Importance and Priority Filters -->
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span class="text-xs text-gray-500">重要性:</span>
        <button
          v-for="imp in [1, 2, 3, 4, 5]"
          :key="imp"
          class="rounded-full px-2 py-0.5 text-xs transition-colors"
          :class="filterImportance === imp ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="filterImportance = filterImportance === imp ? null : imp"
        >
          {{ '★'.repeat(imp) }}{{ '☆'.repeat(5 - imp) }}
        </button>
        <span class="ml-2 text-xs text-gray-500">优先级:</span>
        <button
          v-for="prio in ['critical', 'high', 'medium', 'low']"
          :key="prio"
          class="rounded-full px-2 py-0.5 text-xs transition-colors"
          :class="filterPriority === prio ? `bg-${getPriorityColor(prio).split(' ')[0]}-100 text-${getPriorityColor(prio).split(' ')[0]}-600` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="filterPriority = filterPriority === prio ? null : prio"
        >
          {{ getPriorityLabel(prio) }}
        </button>
        <button
          v-if="filterImportance !== null || filterPriority !== null"
          class="text-xs text-blue-500 hover:text-blue-700"
          @click="clearFilters"
        >
          清除筛选
        </button>
      </div>
      <div class="relative">
        <div class="i-carbon-search absolute left-3 top-1/2 text-gray-400 -translate-y-1/2" />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('settings.memory.searchPlaceholder')"
          class="w-full border border-gray-200 rounded-lg bg-gray-50 py-2 pl-10 pr-4 text-sm outline-none transition-colors focus:border-pink-300 focus:bg-white"
        >
      </div>
    </div>

    <!-- Memory Index List -->
    <div class="flex-1 overflow-y-auto p-4">
      <!-- Empty State -->
      <div
        v-if="ready && displayRecords.length === 0"
        class="flex flex-col items-center justify-center py-16 text-gray-500"
      >
        <div class="i-carbon-text-link-analysis text-6xl text-gray-300" />
        <p class="mt-4 text-sm">
          {{ searchQuery ? t('settings.memory.noResults') : t('settings.memory.noMemories') }}
        </p>
      </div>

      <!-- Loading State -->
      <div
        v-else-if="!ready"
        class="flex items-center justify-center py-16"
      >
        <div class="i-carbon-circle-dash animate-spin text-4xl text-pink-500" />
      </div>

      <!-- Records by Date Groups -->
      <div v-else class="space-y-6">
        <div
          v-for="(groupRecords, dateKey) in groupedRecords"
          :key="dateKey"
        >
          <h3 class="mb-3 text-xs text-gray-500 font-medium">
            {{ dateKey }}
          </h3>
          <div class="space-y-2">
            <div
              v-for="record in groupRecords"
              :key="record.id"
              class="group relative border border-gray-200 rounded-lg bg-white p-3 shadow-sm transition-all hover:shadow-md"
              :class="{ 'ring-2 ring-pink-500': editingId === record.id }"
            >
              <!-- View Mode -->
              <div
                v-if="editingId !== record.id"
                class="flex items-start gap-3"
                @click="viewRecord(record)"
              >
                <!-- Type Icon -->
                <div
                  class="mt-0.5 flex-shrink-0 rounded-full p-1.5"
                  :class="getRecordTypeColor(record.type)"
                  :style="{ backgroundColor: `${getRecordTypeColor(record.type).replace('text-', '').replace('-500', '')}15` }"
                >
                  <div :class="[getRecordIcon(record.type), 'text-lg']" />
                </div>

                <!-- Content -->
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      class="text-xs font-medium uppercase"
                      :class="getRecordTypeColor(record.type)"
                    >
                      {{ getRecordTypeLabel(record.type) }}
                    </span>
                    <!-- Priority Badge -->
                    <span
                      class="rounded px-1.5 py-0.5 text-xs font-medium"
                      :class="getPriorityColor(record.priority || 'medium')"
                    >
                      {{ getPriorityLabel(record.priority || 'medium') }}
                    </span>
                    <!-- Importance Stars -->
                    <span
                      class="text-xs"
                      :class="getImportanceColor(record.importance || 3)"
                    >
                      {{ '★'.repeat(record.importance || 3) }}{{ '☆'.repeat(5 - (record.importance || 3)) }}
                    </span>
                    <span class="text-xs text-gray-400">
                      {{ new Date(record.updatedAt).toLocaleTimeString() }}
                    </span>
                  </div>
                  <p class="mt-1 text-sm text-gray-900 font-medium">
                    {{ record.name }}
                  </p>
                  <p class="line-clamp-2 mt-0.5 text-sm text-gray-600">
                    {{ record.description }}
                  </p>
                  <p class="line-clamp-2 mt-1 text-sm text-gray-700">
                    {{ record.content }}
                  </p>
                </div>

                <!-- Chevron -->
                <div class="flex-shrink-0 text-gray-400 group-hover:text-gray-600">
                  <div class="i-carbon-chevron-right text-lg" />
                </div>
              </div>

              <!-- Edit Mode -->
              <div v-else class="space-y-3">
                <div class="flex items-center gap-2">
                  <div
                    class="rounded-full p-1"
                    :class="getRecordTypeColor(record.type)"
                  >
                    <div :class="[getRecordIcon(record.type), 'text-sm']" />
                  </div>
                  <span class="text-xs font-medium" :class="getRecordTypeColor(record.type)">
                    {{ getRecordTypeLabel(record.type) }}
                  </span>
                </div>

                <!-- Name Input -->
                <div>
                  <label class="mb-1 block text-xs text-gray-600">名称</label>
                  <input
                    v-model="editForm.name"
                    type="text"
                    class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-500"
                    placeholder="输入记忆名称"
                  >
                </div>

                <!-- Description Input -->
                <div>
                  <label class="mb-1 block text-xs text-gray-600">描述</label>
                  <input
                    v-model="editForm.description"
                    type="text"
                    class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-500"
                    placeholder="简短描述"
                  >
                </div>

                <!-- Content Textarea -->
                <div>
                  <label class="mb-1 block text-xs text-gray-600">内容</label>
                  <textarea
                    v-model="editForm.content"
                    rows="3"
                    class="w-full resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-500"
                    placeholder="记忆内容"
                  />
                </div>

                <!-- Importance and Priority -->
                <div class="flex gap-3">
                  <div class="flex-1">
                    <label class="mb-1 block text-xs text-gray-600">重要性 (1-5)</label>
                    <div class="flex gap-1">
                      <button
                        v-for="i in 5"
                        :key="i"
                        class="rounded px-2 py-1 text-sm transition-colors"
                        :class="editForm.importance >= i ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-400'"
                        @click.stop="editForm.importance = i as 1 | 2 | 3 | 4 | 5"
                      >
                        ★
                      </button>
                    </div>
                  </div>
                  <div class="flex-1">
                    <label class="mb-1 block text-xs text-gray-600">优先级</label>
                    <select
                      v-model="editForm.priority"
                      class="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-pink-500"
                    >
                      <option value="low">
                        低
                      </option>
                      <option value="medium">
                        中
                      </option>
                      <option value="high">
                        高
                      </option>
                      <option value="critical">
                        紧急
                      </option>
                    </select>
                  </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex items-center justify-end gap-2">
                  <button
                    class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    @click.stop="cancelEdit"
                  >
                    取消
                  </button>
                  <button
                    class="rounded-lg bg-pink-500 px-3 py-1.5 text-sm text-white hover:bg-pink-600"
                    @click.stop="saveEdit(record)"
                  >
                    保存
                  </button>
                </div>
              </div>

              <!-- Action Buttons (shown on hover, but always visible when editing) -->
              <div
                class="absolute right-3 top-3 flex items-center gap-1"
                :class="{ 'opacity-100': editingId === record.id, 'opacity-0 group-hover:opacity-100': editingId !== record.id }"
                @click.stop
              >
                <!-- Edit Button (only show in view mode) -->
                <button
                  v-if="editingId !== record.id"
                  class="rounded-lg bg-white p-1.5 shadow-sm transition-opacity hover:bg-gray-50"
                  title="编辑"
                  @click="startEdit(record)"
                >
                  <div class="i-carbon-edit text-lg text-blue-500" />
                </button>
                <!-- Delete Button -->
                <button
                  class="rounded-lg bg-white p-1.5 shadow-sm transition-opacity hover:bg-gray-50"
                  :title="t('settings.memory.delete')"
                  @click="deleteRecord(record)"
                >
                  <div class="i-carbon-trash-can text-lg text-red-500" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer Status -->
    <div class="border-t border-gray-200 bg-white px-4 py-2 text-center">
      <p class="text-xs text-gray-500">
        {{ t('settings.memory.totalCount', { count: records.length }) }}
      </p>
    </div>
  </div>

  <!-- Create/Edit Modal -->
  <div
    v-if="showCreateModal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="cancelEdit"
  >
    <div class="mx-4 max-h-[90vh] max-w-lg w-full overflow-y-auto rounded-lg bg-white shadow-xl">
      <div class="border-b border-gray-200 px-6 py-4">
        <h2 class="text-lg font-semibold">
          {{ editingId ? '编辑记忆' : '新建记忆' }}
        </h2>
      </div>
      <div class="p-6 space-y-4">
        <!-- Type Selection -->
        <div>
          <label class="mb-1 block text-sm text-gray-700 font-medium">类型</label>
          <div class="flex gap-2">
            <button
              v-for="type in ['user', 'feedback', 'project', 'reference'] as MemoryType[]"
              :key="type"
              class="flex-1 rounded-lg px-3 py-2 text-sm transition-colors"
              :class="editForm.type === type ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
              @click="editForm.type = type"
            >
              {{ getRecordTypeLabel(type) }}
            </button>
          </div>
        </div>

        <!-- Name -->
        <div>
          <label class="mb-1 block text-sm text-gray-700 font-medium">名称</label>
          <input
            v-model="editForm.name"
            type="text"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-pink-500"
            placeholder="输入记忆名称"
          >
        </div>

        <!-- Description -->
        <div>
          <label class="mb-1 block text-sm text-gray-700 font-medium">描述</label>
          <input
            v-model="editForm.description"
            type="text"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-pink-500"
            placeholder="简短描述"
          >
        </div>

        <!-- Content -->
        <div>
          <label class="mb-1 block text-sm text-gray-700 font-medium">内容</label>
          <textarea
            v-model="editForm.content"
            rows="5"
            class="w-full resize-none border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-pink-500"
            placeholder="记忆详细内容"
          />
        </div>

        <!-- Importance and Priority -->
        <div class="flex gap-4">
          <div class="flex-1">
            <label class="mb-1 block text-sm text-gray-700 font-medium">重要性 (1-5)</label>
            <div class="flex gap-1">
              <button
                v-for="i in 5"
                :key="i"
                class="rounded px-2 py-1 text-sm transition-colors"
                :class="editForm.importance >= i ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-400'"
                @click="editForm.importance = i as 1 | 2 | 3 | 4 | 5"
              >
                ★
              </button>
            </div>
          </div>
          <div class="flex-1">
            <label class="mb-1 block text-sm text-gray-700 font-medium">优先级</label>
            <select
              v-model="editForm.priority"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-pink-500"
            >
              <option value="low">
                低
              </option>
              <option value="medium">
                中
              </option>
              <option value="high">
                高
              </option>
              <option value="critical">
                紧急
              </option>
            </select>
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
        <button
          class="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          @click="cancelEdit"
        >
          取消
        </button>
        <button
          class="rounded-lg bg-pink-500 px-4 py-2 text-sm text-white hover:bg-pink-600"
          :disabled="!editForm.name || !editForm.content"
          :class="(!editForm.name || !editForm.content) ? 'opacity-50 cursor-not-allowed' : ''"
          @click="saveMemory"
        >
          保存
        </button>
      </div>
    </div>
  </div>

  <!-- Import Modal -->
  <div
    v-if="showImportModal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="showImportModal = false"
  >
    <div class="mx-4 max-h-[90vh] max-w-lg w-full overflow-y-auto rounded-lg bg-white shadow-xl">
      <div class="border-b border-gray-200 px-6 py-4">
        <h2 class="text-lg font-semibold">
          导入记忆
        </h2>
      </div>
      <div class="p-6 space-y-4">
        <p class="text-sm text-gray-600">
          粘贴之前导出的 JSON 格式的记忆数据。
        </p>
        <textarea
          v-model="importJson"
          rows="8"
          class="w-full resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-pink-500"
          placeholder="粘贴 JSON 数据，例如: {&quot;version&quot;: 1, &quot;memories&quot;: [...]}"
        />
        <label class="flex items-center gap-2">
          <input
            v-model="importMerge"
            type="checkbox"
            class="border-gray-300 rounded"
          >
          <span class="text-sm text-gray-700">合并模式（更新现有记忆而不是跳过）</span>
        </label>
        <!-- Import Result -->
        <div
          v-if="importResult"
          class="border rounded-lg p-3 text-sm"
          :class="importResult.errors.length > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'"
        >
          <p v-if="importResult.imported > 0" class="text-green-700">
            ✓ 成功导入 {{ importResult.imported }} 条记忆
          </p>
          <p v-if="importResult.skipped > 0" class="text-gray-600">
            - 跳过 {{ importResult.skipped }} 条记忆
          </p>
          <ul v-if="importResult.errors.length > 0" class="mt-2 text-red-600">
            <li v-for="(error, i) in importResult.errors" :key="i">
              {{ error }}
            </li>
          </ul>
        </div>
      </div>
      <div class="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
        <button
          class="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          @click="showImportModal = false"
        >
          取消
        </button>
        <button
          class="rounded-lg bg-pink-500 px-4 py-2 text-sm text-white hover:bg-pink-600"
          :disabled="!importJson.trim() || isImporting"
          :class="(!importJson.trim() || isImporting) ? 'opacity-50 cursor-not-allowed' : ''"
          @click="importMemories"
        >
          {{ isImporting ? '导入中...' : '导入' }}
        </button>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.memory.title
  icon: i-carbon-text-link-analysis
  settingsEntry: true
  order: 6
</route>
