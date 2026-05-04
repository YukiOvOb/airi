import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { useBroadcastChannel } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

type BroadcastChannelEvents
  = | BroadcastChannelEventShouldUpdateView

interface BroadcastChannelEventShouldUpdateView {
  type: 'live2d-should-update-view'
}

/**
 * 场景状态管理
 * 负责 UI 相关的状态（位置、缩放等），与角色内部状态分离
 */
export const useLive2DSceneState = defineStore('live2d-scene', () => {
  const { post, data } = useBroadcastChannel<BroadcastChannelEvents, BroadcastChannelEvents>({ name: 'airi-stores-stage-ui-live2d-scene' })
  const shouldUpdateViewHooks = ref(new Set<() => void>())

  const onShouldUpdateView = (hook: () => void) => {
    shouldUpdateViewHooks.value.add(hook)
    return () => {
      shouldUpdateViewHooks.value.delete(hook)
    }
  }

  function shouldUpdateView() {
    post({ type: 'live2d-should-update-view' })
    shouldUpdateViewHooks.value.forEach(hook => hook())
  }

  watch(data, (event) => {
    if (event?.type === 'live2d-should-update-view') {
      shouldUpdateViewHooks.value.forEach(hook => hook())
    }
  })

  // 位置状态（相对于屏幕中心的百分比）
  const position = useLocalStorageManualReset<{ x: number, y: number }>('settings/live2d/position', { x: 0, y: 0 })
  const positionInPercentageString = computed(() => ({
    x: `${position.value.x}%`,
    y: `${position.value.y}%`,
  }))

  // 缩放状态
  const scale = useLocalStorageManualReset('settings/live2d/scale', 1)

  // 当前播放的动作（由角色模块更新）
  const currentMotion = useLocalStorageManualReset<{ group: string, index?: number }>('settings/live2d/current-motion', () => ({ group: 'Idle', index: 0 }))

  // 可用动作列表（由角色模块更新）
  const availableMotions = useLocalStorageManualReset<{ motionName: string, motionIndex: number, fileName: string }[]>('settings/live2d/available-motions', () => [])

  // 动作映射（情绪到动作的映射）
  const motionMap = useLocalStorageManualReset<Record<string, string>>('settings/live2d/motion-map', {})

  function resetState() {
    position.reset()
    currentMotion.reset()
    availableMotions.reset()
    motionMap.reset()
    scale.reset()
    shouldUpdateView()
  }

  return {
    position,
    positionInPercentageString,
    currentMotion,
    availableMotions,
    motionMap,
    scale,

    onShouldUpdateView,
    shouldUpdateView,
    resetState,
  }
})
