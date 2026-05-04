import type { IntentHandle } from '@proj-airi/pipelines-audio'

import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, reactive, ref } from 'vue'

import { useLlmmarkerParser } from '../../composables/llm-marker-parser'
import { categorizeResponse } from '../../composables/response-categoriser'
import { useAiriCardStore } from '../modules'
import { useSpeechRuntimeStore } from '../speech-runtime'

export * from './notebook'
export * from './orchestrator'
export * from './runtime'

export interface CharacterSparkNotifyReaction {
  id: string
  message: string
  createdAt: number
  sourceEventId?: string
  metadata?: Record<string, unknown>
}

interface StreamingReactionState {
  reaction: CharacterSparkNotifyReaction
  intent: IntentHandle
  parser: ReturnType<ParserFactory>
}

const MAX_REACTIONS = 200
type ParserFactory = typeof useLlmmarkerParser
let parserFactory: ParserFactory = useLlmmarkerParser

export function setCharacterLlmMarkerParserFactoryForTest(factory: ParserFactory | null) {
  parserFactory = factory ?? useLlmmarkerParser
}

export const useCharacterStore = defineStore('character', () => {
  const { activeCard, systemPrompt } = storeToRefs(useAiriCardStore())

  const name = computed(() => activeCard.value?.name ?? '')
  const ownerId = computed(() => activeCard.value?.name ?? 'default')

  const reactions = ref<CharacterSparkNotifyReaction[]>([])
  const streamingReactions = ref<Map<string, StreamingReactionState>>(new Map())
  const speechRuntimeStore = useSpeechRuntimeStore()

  async function emitTextOutput(text: string) {
    // Extract only speech text from the response, filtering out JSON keys, reasoning tags, etc.
    // This prevents TTS from reading things like {"reply": "...", "emotion": "..."}
    const categorized = categorizeResponse(text)
    const speechText = categorized.speech

    // If no speech text after filtering, don't emit anything
    if (!speechText.trim()) {
      return
    }

    const intent = speechRuntimeStore.openIntent({
      ownerId: ownerId.value,
      priority: 'normal',
      behavior: 'queue',
    })

    const parser = parserFactory({
      onLiteral: async (literal) => {
        if (literal)
          intent.writeLiteral(literal)
      },
      onSpecial: async (special) => {
        if (special)
          intent.writeSpecial(special)
      },
    })

    await parser.consume(speechText)
    await parser.end()

    intent.writeFlush()
    intent.end()
  }

  function onSparkNotifyReactionStreamEvent(sparkEventId: string, chunk: string, options?: { metadata?: Record<string, unknown> }) {
    if (!streamingReactions.value.has(sparkEventId)) {
      const newReaction = reactive({
        id: nanoid(),
        message: '',
        createdAt: Date.now(),
        sourceEventId: sparkEventId,
        metadata: options?.metadata,
      }) satisfies CharacterSparkNotifyReaction

      const intent = speechRuntimeStore.openIntent({
        intentId: `spark:${sparkEventId}`,
        ownerId: ownerId.value,
        priority: 'high',
        behavior: 'interrupt',
      })

      const parser = parserFactory({
        onLiteral: async (literal) => {
          if (literal)
            intent.writeLiteral(literal)
        },
        onSpecial: async (special) => {
          if (special)
            intent.writeSpecial(special)
        },
      })

      streamingReactions.value.set(sparkEventId, { reaction: newReaction, intent, parser })
    }

    const state = streamingReactions.value.get(sparkEventId)!
    state.reaction.message += chunk

    // Extract speech text for TTS, filtering out JSON keys and reasoning content
    const categorized = categorizeResponse(state.reaction.message)
    const speechText = categorized.speech

    // Only send filtered speech text to TTS
    if (speechText.trim()) {
      void state.parser.consume(speechText)
    }
  }

  function onSparkNotifyReactionStreamEnd(sparkEventId: string, fullText: string, options?: { metadata?: Record<string, unknown> }) {
    const state = streamingReactions.value.get(sparkEventId)
    if (!state)
      return

    state.reaction.message = fullText
    recordSparkNotifyReaction(sparkEventId, fullText, { metadata: options?.metadata })

    // Extract speech text for final TTS output
    const categorized = categorizeResponse(fullText)
    const speechText = categorized.speech

    // Only process speech text for TTS
    if (speechText.trim()) {
      void state.parser.end().then(() => {
        state.intent.writeFlush()
        state.intent.end()
        streamingReactions.value.delete(sparkEventId)
      })
    }
    else {
      // No speech text, end immediately
      state.intent.end()
      streamingReactions.value.delete(sparkEventId)
    }
  }

  function recordSparkNotifyReaction(sparkEventId: string, message: string, options?: { metadata?: Record<string, unknown> }) {
    const newReaction = {
      id: nanoid(),
      message,
      createdAt: Date.now(),
      sourceEventId: sparkEventId,
      metadata: options?.metadata,
    } satisfies CharacterSparkNotifyReaction

    reactions.value.push(newReaction)

    if (reactions.value.length > MAX_REACTIONS) {
      reactions.value.splice(0, reactions.value.length - MAX_REACTIONS)
    }
  }

  function clearReactions() {
    reactions.value = []
  }

  return {
    name,
    reactions,
    systemPrompt,

    recordSparkNotifyReaction,
    onSparkNotifyReactionStreamEvent,
    onSparkNotifyReactionStreamEnd,
    clearReactions,

    emitTextOutput,
  }
})
