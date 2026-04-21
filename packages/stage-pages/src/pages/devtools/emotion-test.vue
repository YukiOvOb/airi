<script setup lang="ts">
import { Live2DScene, useLive2d } from '@proj-airi/stage-ui-live2d'
import { Emotion, EMOTION_EmotionMotionName_value } from '@proj-airi/stage-ui/constants/emotions'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

const settingsStore = useSettings()
const {
  stageModelRenderer,
  stageModelSelectedUrl,
  stageModelSelected,
  themeColorsHue,
  themeColorsHueDynamic,
  live2dIdleAnimationEnabled,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dExpressionEnabled,
  live2dShadowEnabled,
  live2dMaxFps,
  live2dRenderScale,
} = storeToRefs(settingsStore)

const live2dStore = useLive2d()
const { currentMotion, availableMotions } = storeToRefs(live2dStore)

onMounted(async () => {
  await settingsStore.updateStageModel()
})

// Group available motions by their group name (e.g. "Idle", "TapBody", "Happy"…)
const motionGroups = computed(() => {
  const groups = new Map<string, number>()
  for (const m of availableMotions.value) {
    if (!groups.has(m.motionName))
      groups.set(m.motionName, 0)
  }
  return [...groups.keys()]
})

const emotions = Object.values(Emotion)
const emotionEmoji: Record<Emotion, string> = {
  [Emotion.Happy]: '😄',
  [Emotion.Sad]: '😢',
  [Emotion.Angry]: '😠',
  [Emotion.Think]: '🤔',
  [Emotion.Surprise]: '😲',
  [Emotion.Awkward]: '😅',
  [Emotion.Question]: '❓',
  [Emotion.Curious]: '🧐',
  [Emotion.Neutral]: '😐',
  [Emotion.Cute]: '🥰',
}

function triggerMotion(group: string, index?: number) {
  currentMotion.value = { group, index }
}

function triggerEmotion(emotion: Emotion) {
  currentMotion.value = { group: EMOTION_EmotionMotionName_value[emotion] }
}
</script>

<template>
  <div :class="['flex flex-row gap-3', 'h-[calc(100dvh-120px)] min-h-0']">
    <!-- Left: Live2D viewer -->
    <div :class="['relative flex-1 min-w-0 min-h-0 rounded-xl overflow-hidden', 'bg-neutral-100 dark:bg-neutral-900']">
      <Live2DScene
        v-if="stageModelRenderer === 'live2d' && stageModelSelectedUrl"
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :focus-at="{ x: 0, y: 0 }"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-expression-enabled="live2dExpressionEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
        :live2d-max-fps="live2dMaxFps"
        :live2d-render-scale="live2dRenderScale"
        class="h-full w-full"
      />
      <div
        v-else
        :class="['h-full w-full flex flex-col items-center justify-center gap-2', 'text-sm text-neutral-400']"
      >
        <span v-if="stageModelRenderer !== 'live2d'">渲染器：{{ stageModelRenderer || '未设置' }}</span>
        <span v-else>模型加载中…</span>
        <span class="text-xs text-neutral-500">请先在设置中选择一个 Live2D 模型</span>
      </div>

      <!-- current motion badge -->
      <div
        v-if="stageModelRenderer === 'live2d'"
        :class="[
          'absolute bottom-2 left-2',
          'rounded-lg px-2 py-1',
          'bg-black/40 text-white text-xs',
        ]"
      >
        {{ currentMotion.group }}{{ currentMotion.index !== undefined ? ` #${currentMotion.index}` : '' }}
      </div>
    </div>

    <!-- Right: controls -->
    <div :class="['flex flex-col gap-3 w-56 shrink-0 overflow-y-auto scrollbar-none pb-2']">
      <!-- Section: model's actual motions -->
      <div>
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400 mb-1 font-medium']">
          模型实际动作（{{ motionGroups.length }} 组）
        </div>
        <div
          v-if="motionGroups.length === 0"
          :class="['text-xs text-neutral-400 italic']"
        >
          {{ stageModelRenderer === 'live2d' ? '等待模型加载…' : '未加载 Live2D 模型' }}
        </div>
        <div v-else :class="['grid grid-cols-2 gap-1.5']">
          <button
            v-for="group in motionGroups"
            :key="group"
            :class="[
              'rounded-lg px-2 py-2 text-xs',
              'bg-green-50 dark:bg-green-950/30',
              'border border-green-300 dark:border-green-700',
              'hover:bg-green-100 dark:hover:bg-green-900/40',
              'transition-all duration-150 cursor-pointer',
              currentMotion.group === group ? 'ring-2 ring-green-400' : '',
            ]"
            @click="triggerMotion(group)"
          >
            {{ group }}
          </button>
        </div>
      </div>

      <div :class="['border-t border-neutral-200 dark:border-neutral-700']" />

      <!-- Section: emotion → motion mapping -->
      <div>
        <div :class="['text-xs text-neutral-500 dark:text-neutral-400 mb-1 font-medium']">
          情感映射（需模型支持）
        </div>
        <div :class="['grid grid-cols-2 gap-1.5']">
          <button
            v-for="emotion in emotions"
            :key="emotion"
            :class="[
              'flex flex-col items-center gap-0.5',
              'rounded-lg p-2',
              'bg-neutral-50 dark:bg-neutral-900',
              'border border-neutral-200 dark:border-neutral-700',
              'hover:border-primary-400 hover:bg-primary-50 dark:hover:border-primary-600 dark:hover:bg-primary-900/30',
              'transition-all duration-150 cursor-pointer',
            ]"
            @click="triggerEmotion(emotion)"
          >
            <span class="text-xl">{{ emotionEmoji[emotion] }}</span>
            <span :class="['text-[9px] text-neutral-500 dark:text-neutral-400']">
              → {{ EMOTION_EmotionMotionName_value[emotion] }}
            </span>
          </button>
        </div>
      </div>

      <!-- reset -->
      <button
        :class="[
          'rounded-xl px-4 py-2 mt-auto',
          'bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600',
          'text-sm text-neutral-700 dark:text-neutral-300 font-medium',
          'transition-all duration-150 cursor-pointer',
        ]"
        @click="triggerMotion('Idle', 0)"
      >
        🔄 重置 Idle
      </button>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: 表情测试
  subtitle: DevTools
</route>
