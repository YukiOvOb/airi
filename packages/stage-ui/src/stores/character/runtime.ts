import type { Emotion, EmotionPayload } from '../../constants/emotions'
import type { AiriCard } from '../modules'

import { defineStore, storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'

import { parseActEmotionToken } from '../../composables/queues'
import { EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value } from '../../constants/emotions'
import { useAiriCardStore } from '../modules'

export interface CharacterRenderDirective {
  emotion: Emotion
  intensity: number
  live2dMotionGroup?: string
  vrmExpression?: string
}

export interface CharacterRuntimeProfile {
  name: string
  personality: string
  replyStyle: string
}

const MAX_MEMORY_NOTES = 200
const TSUNDERE_STYLE_PATTERN = /傲娇|tsundere/i
const SHARP_STYLE_PATTERN = /毒舌|sharp|sarcastic/i
const ENERGETIC_STYLE_PATTERN = /元气|energetic|genki/i
const FATIGUE_NOTE_PATTERN = /累|疲惫|好烦|压力|通勤/

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function deriveReplyStyle(personality: string) {
  if (!personality.trim())
    return 'warm-supportive'

  if (TSUNDERE_STYLE_PATTERN.test(personality))
    return 'tsundere-soft'
  if (SHARP_STYLE_PATTERN.test(personality))
    return 'sharp-but-caring'
  if (ENERGETIC_STYLE_PATTERN.test(personality))
    return 'energetic-positive'

  return 'warm-supportive'
}

function syncProfileFromCard(card: AiriCard | undefined): CharacterRuntimeProfile {
  const personality = card?.personality ?? ''
  return {
    name: card?.name ?? 'Airi',
    personality,
    replyStyle: deriveReplyStyle(personality),
  }
}

export const useCharacterRuntimeStore = defineStore('character-runtime', () => {
  const { activeCard } = storeToRefs(useAiriCardStore())

  const profile = shallowRef<CharacterRuntimeProfile>(syncProfileFromCard(activeCard.value))
  const emotion = shallowRef<Emotion>('neutral' as Emotion)
  const mood = shallowRef(72)
  const relationshipLevel = shallowRef(35)
  const memory = shallowRef<string[]>([])
  const lastUserMessage = shallowRef('')
  const lastAssistantReply = shallowRef('')

  watch(activeCard, (nextCard) => {
    profile.value = syncProfileFromCard(nextCard)
  }, { immediate: true })

  function remember(note: string) {
    const normalized = note.trim()
    if (!normalized)
      return

    if (!memory.value.includes(normalized)) {
      memory.value = [...memory.value, normalized].slice(-MAX_MEMORY_NOTES)
    }
  }

  function applyEmotionPayload(payload: EmotionPayload): CharacterRenderDirective {
    emotion.value = payload.name

    const intensity = clamp(payload.intensity, 0, 1)
    const moodDelta = Math.round((intensity * 8) - 2)
    mood.value = clamp(mood.value + moodDelta, 0, 100)

    return {
      emotion: payload.name,
      intensity,
      live2dMotionGroup: EMOTION_EmotionMotionName_value[payload.name],
      vrmExpression: EMOTION_VRMExpressionName_value[payload.name],
    }
  }

  function applySpecialToken(special: string): CharacterRenderDirective | null {
    const parsed = parseActEmotionToken(special)
    if (!parsed.ok || !parsed.emotion)
      return null

    return applyEmotionPayload(parsed.emotion)
  }

  function onBeforeSend(userMessage: string): CharacterRenderDirective {
    lastUserMessage.value = userMessage
    relationshipLevel.value = clamp(relationshipLevel.value + 1, 0, 100)

    return applyEmotionPayload({
      name: 'think' as Emotion,
      intensity: 1,
    })
  }

  function onAssistantResponseEnd(message: string) {
    lastAssistantReply.value = message

    if (FATIGUE_NOTE_PATTERN.test(lastUserMessage.value)) {
      remember('用户最近更容易疲惫，回应时应优先安抚与减压建议。')
    }
  }

  return {
    profile,
    emotion,
    mood,
    relationshipLevel,
    memory,
    lastUserMessage,
    lastAssistantReply,

    snapshot: computed(() => ({
      profile: profile.value,
      emotion: emotion.value,
      mood: mood.value,
      relationshipLevel: relationshipLevel.value,
      memory: memory.value,
      lastUserMessage: lastUserMessage.value,
      lastAssistantReply: lastAssistantReply.value,
    })),

    remember,
    applyEmotionPayload,
    applySpecialToken,
    onBeforeSend,
    onAssistantResponseEnd,
  }
})
