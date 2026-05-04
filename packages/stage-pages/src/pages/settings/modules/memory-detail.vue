<script setup lang="ts">
import type { MemoryPriority, MemoryRecord, MemoryType } from '@proj-airi/stage-ui/database/adapter'

import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const memoryStore = useMemoryStore()

const { records } = storeToRefs(memoryStore)

// Edit mode
const isEditing = ref(false)
const editForm = ref({
  name: '',
  description: '',
  content: '',
  importance: 3 as 1 | 2 | 3 | 4 | 5,
  priority: 'medium' as MemoryPriority,
})

// Get memory ID from route params
const memoryId = computed(() => route.params.id as string)

// Find the memory record
const memory = computed(() => records.value.find(r => r.id === memoryId.value))

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
      return 'text-blue-500 bg-blue-50'
    case 'feedback':
      return 'text-yellow-500 bg-yellow-50'
    case 'project':
      return 'text-green-500 bg-green-50'
    case 'reference':
      return 'text-purple-500 bg-purple-50'
    default:
      return 'text-gray-500 bg-gray-50'
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

function hasEmbedding(record: MemoryRecord): boolean {
  return !!(record.embedding && record.embedding.length > 0)
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString()
}

function goBack() {
  router.back()
}

async function deleteMemory() {
  if (!memory.value)
    return
  if (confirm(t('settings.memory.detail.deleteConfirm'))) {
    await memoryStore.deleteRecord(memory.value.id)
    goBack()
  }
}

function startEdit() {
  if (!memory.value)
    return
  editForm.value = {
    name: memory.value.name,
    description: memory.value.description,
    content: memory.value.content,
    importance: memory.value.importance ?? 3,
    priority: memory.value.priority ?? 'medium',
  }
  isEditing.value = true
}

function cancelEdit() {
  isEditing.value = false
}

async function saveEdit() {
  if (!memory.value)
    return
  await memoryStore.upsertMemory({
    id: memory.value.id,
    name: editForm.value.name,
    description: editForm.value.description,
    type: memory.value.type,
    content: editForm.value.content,
    importance: editForm.value.importance,
    priority: editForm.value.priority,
  })
  isEditing.value = false
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
        @click="goBack"
      >
        <div class="i-carbon-arrow-left text-xl" />
      </button>
      <h1 class="text-lg text-gray-900 font-semibold">
        {{ t('settings.memory.detail.title') }}
      </h1>
      <div class="ml-auto flex items-center gap-2">
        <button
          v-if="!isEditing"
          class="rounded-lg bg-blue-50 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100"
          @click="startEdit"
        >
          编辑
        </button>
        <button
          class="rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-600 hover:bg-red-100"
          @click="deleteMemory"
        >
          {{ t('settings.memory.delete') }}
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4">
      <!-- Not Found -->
      <div
        v-if="!memory"
        class="flex flex-col items-center justify-center py-16 text-gray-500"
      >
        <div class="i-carbon-text-link-analysis text-6xl text-gray-300" />
        <p class="mt-4 text-sm">
          {{ t('settings.memory.noMemories') }}
        </p>
      </div>

      <!-- Memory Detail -->
      <div v-else class="border border-gray-200 rounded-lg bg-white p-4 shadow-sm">
        <!-- View Mode -->
        <div v-if="!isEditing">
          <!-- Type & Status -->
          <div class="mb-4 flex flex-wrap items-center gap-2">
            <span
              class="rounded-full px-3 py-1 text-sm font-medium"
              :class="getRecordTypeColor(memory.type)"
            >
              {{ getRecordTypeLabel(memory.type) }}
            </span>
            <!-- Priority Badge -->
            <span
              class="rounded-full px-3 py-1 text-sm font-medium"
              :class="getPriorityColor(memory.priority || 'medium')"
            >
              {{ getPriorityLabel(memory.priority || 'medium') }}
            </span>
            <!-- Importance Stars -->
            <span
              class="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium"
              :class="getImportanceColor(memory.importance || 3)"
            >
              {{ '★'.repeat(memory.importance || 3) }}{{ '☆'.repeat(5 - (memory.importance || 3)) }}
            </span>
            <span
              v-if="hasEmbedding(memory)"
              class="rounded-full bg-green-50 px-3 py-1 text-sm text-green-600 font-medium"
            >
              {{ t('settings.memory.detail.indexed') }}
            </span>
            <span
              v-else
              class="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-500 font-medium"
            >
              {{ t('settings.memory.detail.notIndexed') }}
            </span>
          </div>

          <!-- Timestamp -->
          <div class="mb-4 text-sm text-gray-500">
            <span class="font-medium">{{ t('settings.memory.detail.createdAt') }}:</span>
            {{ formatTimestamp(memory.updatedAt) }}
          </div>

          <!-- Name & Description -->
          <div class="mb-4">
            <h2 class="text-xl text-gray-900 font-bold">
              {{ memory.name }}
            </h2>
            <p class="text-sm text-gray-600">
              {{ memory.description }}
            </p>
          </div>

          <!-- Content -->
          <div class="border-t border-gray-200 pt-4">
            <h3 class="mb-2 text-sm text-gray-700 font-medium">
              {{ t('settings.memory.detail.content') }}
            </h3>
            <div class="rounded-lg bg-gray-50 p-4">
              <p class="whitespace-pre-wrap text-sm text-gray-800">
                {{ memory.content }}
              </p>
            </div>
          </div>

          <!-- Embedding Info -->
          <div
            v-if="hasEmbedding(memory)"
            class="mt-4 rounded-lg bg-blue-50 p-3"
          >
            <div class="flex items-start gap-2">
              <div class="i-carbon-information mt-0.5 text-blue-600" />
              <div class="flex-1 text-xs text-blue-800">
                <p class="font-medium">
                  {{ t('settings.memory.detail.embeddingStatus') }}
                </p>
                <p class="mt-1">
                  {{ t('settings.memory.detail.indexed') }} - {{ memory.embedding?.length }} dimensions
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Edit Mode -->
        <div v-else class="space-y-4">
          <!-- Name -->
          <div>
            <label class="mb-1 block text-sm text-gray-700 font-medium">名称</label>
            <input
              v-model="editForm.name"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-pink-500"
            >
          </div>

          <!-- Description -->
          <div>
            <label class="mb-1 block text-sm text-gray-700 font-medium">描述</label>
            <input
              v-model="editForm.description"
              type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-pink-500"
            >
          </div>

          <!-- Content -->
          <div>
            <label class="mb-1 block text-sm text-gray-700 font-medium">内容</label>
            <textarea
              v-model="editForm.content"
              rows="6"
              class="w-full resize-none border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-pink-500"
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

          <!-- Action Buttons -->
          <div class="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button
              class="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              @click="cancelEdit"
            >
              取消
            </button>
            <button
              class="rounded-lg bg-pink-500 px-4 py-2 text-sm text-white hover:bg-pink-600"
              @click="saveEdit"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
