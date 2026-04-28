<script setup lang="ts">
import type { MemoryRecord, MemoryType } from '@proj-airi/stage-ui/database/adapter'

import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const memoryStore = useMemoryStore()

const { records } = storeToRefs(memoryStore)

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
      <div class="ml-auto">
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
        <!-- Type & Status -->
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <span
            class="rounded-full px-3 py-1 text-sm font-medium"
            :class="getRecordTypeColor(memory.type)"
          >
            {{ getRecordTypeLabel(memory.type) }}
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
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
