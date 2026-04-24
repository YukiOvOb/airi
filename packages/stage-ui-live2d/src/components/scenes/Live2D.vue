<script setup lang="ts">
import { Screen } from '@proj-airi/ui'
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, ref, watch } from 'vue'

import Live2DCanvas from './live2d/Canvas.vue'
import Live2DModel from './live2d/Model.vue'

import { useLive2d } from '../../stores/live2d'

import '../../utils/live2d-zip-loader'
import '../../utils/live2d-opfs-registration'

withDefaults(defineProps<{
  modelSrc?: string
  modelId?: string

  paused?: boolean
  mouthOpenSize?: number
  focusAt?: { x: number, y: number }
  disableFocusAt?: boolean
  scale?: number
  themeColorsHue?: number
  themeColorsHueDynamic?: boolean
  live2dIdleAnimationEnabled?: boolean
  live2dAutoBlinkEnabled?: boolean
  live2dForceAutoBlinkEnabled?: boolean
  live2dExpressionEnabled?: boolean
  live2dShadowEnabled?: boolean
  live2dMaxFps?: number
  live2dRenderScale?: number
}>(), {
  paused: false,
  focusAt: () => ({ x: 0, y: 0 }),
  mouthOpenSize: 0,
  scale: 1,
  themeColorsHue: 220.44,
  themeColorsHueDynamic: false,
  live2dIdleAnimationEnabled: true,
  live2dAutoBlinkEnabled: true,
  live2dForceAutoBlinkEnabled: false,
  live2dExpressionEnabled: true,
  live2dShadowEnabled: true,
  live2dMaxFps: 0,
  live2dRenderScale: 2,
})
// px of movement before a pointer-down is treated as a drag
const DRAG_THRESHOLD_PX = 5
// Multiplier so the character follows the pointer more responsively
const DRAG_SENSITIVITY = 5.0
const SCALE_MIN = 0.2
const SCALE_MAX = 5.0

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })
const componentStateCanvas = defineModel<'pending' | 'loading' | 'mounted'>('canvasState', { default: 'pending' })
const componentStateModel = defineModel<'pending' | 'loading' | 'mounted'>('modelState', { default: 'pending' })

const live2dCanvasRef = ref<InstanceType<typeof Live2DCanvas>>()
const live2dModelRef = ref<InstanceType<typeof Live2DModel>>()

const live2d = useLive2d()
const { position, scale } = storeToRefs(live2d)

// ---- Multi-pointer tracking (shared by drag and pinch-to-zoom) ----
// Maps pointerId → current client position; populated on pointerdown on the canvas.
const activePointers = new Map<number, { x: number, y: number }>()
let pinchStartDistance = 0
let scaleAtPinchStart = 1

function pinchDistance() {
  const pts = [...activePointers.values()]
  if (pts.length < 2)
    return 0
  const [a, b] = pts as [{ x: number, y: number }, { x: number, y: number }]
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// ---- Drag & click state ----
const isDragging = ref(false)
const isPointerDown = ref(false)
const dragStartClient = { x: 0, y: 0 }
const positionAtDragStart = { x: 0, y: 0 }

// NOTICE: pointerdown is attached directly to the canvas element (not an overlay div)
// so it fires regardless of which part of the model is clicked — including transparent
// areas and non-hit-area regions. pointermove/pointerup are on document so dragging
// continues smoothly even when the pointer leaves the canvas bounds.
function onPointerDown(event: PointerEvent) {
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (activePointers.size >= 2) {
    // Second finger arrived — switch from drag to pinch-to-zoom
    isPointerDown.value = false
    isDragging.value = false
    pinchStartDistance = pinchDistance()
    scaleAtPinchStart = scale.value
    return
  }

  // Single pointer: start drag (mouse requires left button; touch/pen button is always 0)
  if (event.pointerType === 'mouse' && event.button !== 0)
    return

  isPointerDown.value = true
  isDragging.value = false
  dragStartClient.x = event.clientX
  dragStartClient.y = event.clientY
  positionAtDragStart.x = position.value.x
  positionAtDragStart.y = position.value.y
}

function onPointerMove(event: PointerEvent) {
  if (activePointers.has(event.pointerId))
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  // Two-finger pinch-to-zoom takes priority over single-finger drag
  if (activePointers.size >= 2 && pinchStartDistance > 0) {
    const dist = pinchDistance()
    scale.value = Math.max(SCALE_MIN, Math.min(SCALE_MAX, scaleAtPinchStart * (dist / pinchStartDistance)))
    return
  }

  if (!isPointerDown.value)
    return

  const dx = event.clientX - dragStartClient.x
  const dy = event.clientY - dragStartClient.y

  if (!isDragging.value && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX)
    isDragging.value = true

  if (!isDragging.value)
    return

  const canvas = live2dCanvasRef.value?.canvasElement()
  if (!canvas)
    return
  const rect = canvas.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0)
    return

  position.value = {
    x: positionAtDragStart.x + (dx / rect.width) * 100 * DRAG_SENSITIVITY,
    y: positionAtDragStart.y + (dy / rect.height) * 100 * DRAG_SENSITIVITY,
  }
}

function onPointerUp(event: PointerEvent) {
  activePointers.delete(event.pointerId)

  if (activePointers.size < 2)
    pinchStartDistance = 0

  if (!isPointerDown.value)
    return

  if (!isDragging.value) {
    // Treat as click/tap — run hit test in model coordinates
    const canvas = live2dCanvasRef.value?.canvasElement()
    if (canvas && live2dModelRef.value) {
      const rect = canvas.getBoundingClientRect()
      live2dModelRef.value.handleTap(
        event.clientX - rect.left,
        event.clientY - rect.top,
      )
    }
  }

  isPointerDown.value = false
  isDragging.value = false
}

function onPointerCancel(event: PointerEvent) {
  activePointers.delete(event.pointerId)
  if (activePointers.size < 2)
    pinchStartDistance = 0
  isPointerDown.value = false
  isDragging.value = false
}

// ---- Mouse-wheel zoom ----
function onWheel(event: WheelEvent) {
  // NOTICE: preventDefault stops the page from scrolling while zooming the model.
  // The listener is registered as non-passive (see canvasEl watcher) to allow this call.
  event.preventDefault()
  const delta = -event.deltaY * 0.001
  scale.value = Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale.value + delta))
}

const canvasEl = computed(() => live2dCanvasRef.value?.canvasElement())

watch(canvasEl, (el, prev) => {
  prev?.removeEventListener('pointerdown', onPointerDown)
  prev?.removeEventListener('wheel', onWheel)
  if (el) {
    el.addEventListener('pointerdown', onPointerDown, { passive: true })
    // NOTICE: passive:false required so onWheel can call preventDefault() to suppress page scroll.
    el.addEventListener('wheel', onWheel, { passive: false })
  }
})

onUnmounted(() => {
  canvasEl.value?.removeEventListener('pointerdown', onPointerDown)
  canvasEl.value?.removeEventListener('wheel', onWheel)
})

useEventListener(document, 'pointermove', onPointerMove, { passive: true })
useEventListener(document, 'pointerup', onPointerUp)
useEventListener(document, 'pointercancel', onPointerCancel)

watch([componentStateModel, componentStateCanvas], () => {
  componentState.value = (componentStateModel.value === 'mounted' && componentStateCanvas.value === 'mounted')
    ? 'mounted'
    : 'loading'
})

defineExpose({
  canvasElement: () => {
    return live2dCanvasRef.value?.canvasElement()
  },
})
</script>

<template>
  <Screen v-slot="{ width, height }" relative>
    <Live2DCanvas
      ref="live2dCanvasRef"
      v-slot="{ app }"
      v-model:state="componentStateCanvas"
      :width="width"
      :height="height"
      :resolution="live2dRenderScale"
      :max-fps="live2dMaxFps"
      :class="[isDragging ? 'cursor-grabbing' : 'cursor-grab']"
      max-h="100dvh"
    >
      <Live2DModel
        ref="live2dModelRef"
        v-model:state="componentStateModel"
        :model-src="modelSrc"
        :model-id="modelId"
        :app="app"
        :mouth-open-size="mouthOpenSize"
        :width="width"
        :height="height"
        :paused="paused"
        :focus-at="focusAt"
        :x-offset="position.x"
        :y-offset="position.y"
        :scale="scale"
        :disable-focus-at="disableFocusAt"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-expression-enabled="live2dExpressionEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
      />
    </Live2DCanvas>
  </Screen>
</template>
