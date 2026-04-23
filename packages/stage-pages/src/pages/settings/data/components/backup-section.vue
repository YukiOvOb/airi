<script setup lang="ts">
import type { DataSettingsStatusEmits } from '../status'

import { createDataSettingsStatusHelpers } from '../status'

const emit = defineEmits<DataSettingsStatusEmits>()
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit)

function exportSettings() {
  try {
    const data: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key !== null)
        data[key] = localStorage.getItem(key) ?? ''
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `airi-settings-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    emitStatus('Settings exported successfully')
  }
  catch (error) {
    handleActionError(error)
  }
}

function importSettings() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file)
      return
    try {
      const text = await file.text()
      const data = JSON.parse(text) as Record<string, string>
      if (typeof data !== 'object' || Array.isArray(data))
        throw new TypeError('Invalid settings file format')
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string')
          localStorage.setItem(key, value)
      }
      emitStatus('Settings imported — reload the page to apply')
    }
    catch (error) {
      handleActionError(error)
    }
  }
  input.click()
}
</script>

<template>
  <div :class="['border-2 border-neutral-200/50 rounded-xl bg-white/70 p-4 shadow-sm', 'dark:border-neutral-800/60 dark:bg-neutral-900/60']">
    <div :class="['flex flex-col gap-3']">
      <div>
        <div :class="['text-lg font-medium']">
          Backup &amp; Restore
        </div>
        <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
          Export all settings (API keys, character cards, providers) to a JSON file, or import a previously exported file. Useful for syncing settings across devices or browsers on different origins.
        </p>
      </div>

      <div :class="['grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]']">
        <div :class="['flex flex-col gap-1 md:max-w-[560px]']">
          <div :class="['text-sm font-medium']">
            Export Settings
          </div>
          <p :class="['text-xs text-neutral-500 dark:text-neutral-500']">
            Downloads a JSON file containing all your current settings.
          </p>
        </div>
        <div>
          <button
            :class="[
              'rounded-lg border border-neutral-200/80 bg-white px-4 py-2 text-sm font-medium shadow-sm transition',
              'hover:bg-neutral-50 active:scale-95',
              'dark:border-neutral-700/60 dark:bg-neutral-800 dark:hover:bg-neutral-700',
            ]"
            @click="exportSettings"
          >
            Export
          </button>
        </div>
      </div>

      <div :class="['grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]']">
        <div :class="['flex flex-col gap-1 md:max-w-[560px]']">
          <div :class="['text-sm font-medium']">
            Import Settings
          </div>
          <p :class="['text-xs text-neutral-500 dark:text-neutral-500']">
            Load settings from a JSON export file. The page will need a reload after import.
          </p>
        </div>
        <div>
          <button
            :class="[
              'rounded-lg border border-neutral-200/80 bg-white px-4 py-2 text-sm font-medium shadow-sm transition',
              'hover:bg-neutral-50 active:scale-95',
              'dark:border-neutral-700/60 dark:bg-neutral-800 dark:hover:bg-neutral-700',
            ]"
            @click="importSettings"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
