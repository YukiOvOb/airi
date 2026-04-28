<script setup lang="ts">
import type { MemoryRecord, MemoryType } from '@proj-airi/stage-ui/database/adapter'

import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const memoryStore = useMemoryStore()

const { records, ready } = storeToRefs(memoryStore)

// Memory type filter
const selectedType = ref<MemoryType | 'all'>('all')
const searchQuery = ref('')

// Get unique memory types
const memoryTypes = computed(() => {
  const types = new Set<MemoryType>()
  records.value.forEach(record => types.add(record.type))
  return Array.from(types)
})

// Filtered records
const filteredRecords = computed(() => {
  let filtered = records.value

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

  return filtered.sort((a, b) => b.updatedAt - a.updatedAt)
})

// Group records by date
const groupedRecords = computed(() => {
  const groups: Record<string, MemoryRecord[]> = {}
  filteredRecords.value.forEach((record) => {
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

// Refresh records
function refresh() {
  memoryStore.loadRecords()
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
        <button
          class="flex items-center justify-center rounded-full p-2 text-gray-600 hover:bg-gray-100"
          :title="t('settings.memory.refresh')"
          @click="refresh"
        >
          <div class="i-carbon-refresh text-xl" />
        </button>
      </div>
    </div>

    <!-- Search and Filter -->
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
        v-if="ready && filteredRecords.length === 0"
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
              @click="viewRecord(record)"
            >
              <div class="flex items-start gap-3">
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
                  <div class="flex items-center gap-2">
                    <span
                      class="text-xs font-medium uppercase"
                      :class="getRecordTypeColor(record.type)"
                    >
                      {{ getRecordTypeLabel(record.type) }}
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

              <!-- Delete Button (shown on hover) -->
              <button
                class="absolute right-12 top-3 rounded-lg bg-white p-1.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                :title="t('settings.memory.delete')"
                @click.stop="deleteRecord(record)"
              >
                <div class="i-carbon-trash-can text-lg text-red-500" />
              </button>
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
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.memory.title
  icon: i-carbon-text-link-analysis
  settingsEntry: true
  order: 6
</route>
