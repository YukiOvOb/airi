/**
 * Streaming Pipeline Transformers
 *
 * This module provides a chain of decorators that process LLM token streams
 * step by step, similar to Open-LLM-VTuber's agent/transformers.py.
 *
 * Pipeline:
 * 1. sentence_divider: tokens → SentenceWithTags
 * 2. actions_extractor: SentenceWithTags → (sentence, actions)
 * 3. display_processor: (sentence, actions) → (sentence, display, actions)
 * 4. tts_filter: (sentence, display, actions) → SentenceOutput
 *
 * Each decorator passes through non-text data (e.g., tool call dictionaries).
 */

import type { ReaderLike } from 'clustr'

import type { Actions, DisplayText, SentenceOutput, SentenceWithTags } from '../types'
import type { SentenceDividerOptions } from './sentence-divider'
import type { TtsFilterOptions } from './tts-preprocessor'

import { createPushStream } from '../stream'
import { createSentenceDividerStream } from './sentence-divider'
import { extractEmotionTags, preprocessForTts } from './tts-preprocessor'

/**
 * Token stream input (from LLM)
 */
export type TextTokenStream = ReaderLike | ReadableStream<string> | AsyncIterable<string>

/**
 * Dict pass-through type (for tool calls, etc.)
 */
export type DictType = Record<string, unknown>

/**
 * Stream output types
 */
export type StreamOutput = SentenceWithTags | DictType | SentenceOutput

/**
 * Options for the complete transformer pipeline
 */
export interface TransformerPipelineOptions {
  /** Sentence divider options */
  sentenceDivider?: SentenceDividerOptions
  /** TTS filter options */
  ttsFilter?: TtsFilterOptions
  /** Whether to extract emotion tags for actions */
  extractEmotions?: boolean
}

/**
 * Stage 1: Sentence Divider Decorator
 *
 * Transforms raw token stream into sentences with tag support.
 * Passes through dictionaries unchanged.
 */
export async function* sentenceDividerTransformer(
  stream: TextTokenStream | AsyncIterable<StreamOutput>,
  options?: SentenceDividerOptions,
): AsyncGenerator<SentenceWithTags | DictType, void, unknown> {
  const sentenceDividerOptions = {
    fasterFirstResponse: true,
    segmentMethod: 'auto' as const,
    validTags: ['think'],
    ...options,
  }

  // Check if input is already a processed stream
  const isProcessed = Symbol.asyncIterator in (stream as AsyncIterable<StreamOutput>)

  if (isProcessed) {
    // Already processed, just filter and yield
    for await (const item of stream as AsyncIterable<StreamOutput>) {
      if (typeof item === 'object' && !('text' in item)) {
        // Dict pass-through
        yield item as DictType
      }
      else {
        yield item as SentenceWithTags
      }
    }
    return
  }

  // Process raw text stream
  let textBuffer = ''
  const textStreamController = createPushStream<string>()

  // Start the sentence divider
  const sentenceStream = createSentenceDividerStream(textStreamController.stream, sentenceDividerOptions)
  const sentenceReader = sentenceStream.getReader()

  // Read from input and process
  const reader = stream instanceof ReadableStream
    ? stream.getReader()
    : (stream as ReaderLike)

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done)
        break

      if (typeof value === 'string') {
        textBuffer += value
        // Write to sentence divider stream
        textStreamController.write(value)
      }
      else if (typeof value === 'object') {
        // Flush any pending text first
        if (textBuffer) {
          textStreamController.close()
          textBuffer = ''
          // Yield any buffered sentences

          while (true) {
            const { value: sentence, done: sentenceDone } = await sentenceReader.read()
            if (sentenceDone)
              break
            if (sentence && typeof sentence === 'object' && 'text' in sentence) {
              yield sentence as SentenceWithTags
            }
          }
        }
        // Pass through dict
        yield value as DictType
      }
    }

    // Close and flush remaining
    if (textBuffer) {
      textStreamController.close()
    }

    // Yield remaining sentences

    while (true) {
      const { value, done } = await sentenceReader.read()
      if (done)
        break
      if (value && typeof value === 'object' && 'text' in value) {
        yield value as SentenceWithTags
      }
    }
  }
  finally {
    if ('releaseLock' in reader && typeof reader.releaseLock === 'function')
      (reader as ReaderLike).releaseLock()
    sentenceReader.releaseLock()
  }
}

/**
 * Stage 2: Actions Extractor Decorator
 *
 * Extracts Live2D actions from sentences (emotion tags).
 * Passes through dictionaries unchanged.
 */
export async function* actionsExtractorTransformer(
  stream: AsyncIterable<SentenceWithTags | DictType>,
  extractEmotions: boolean = true,
): AsyncGenerator<[SentenceWithTags, Actions] | DictType, void, unknown> {
  for await (const item of stream) {
    if (typeof item === 'object' && !('text' in item)) {
      // Dict pass-through
      yield item as DictType
      continue
    }

    const sentence = item as SentenceWithTags
    const actions: Actions = {}

    // Only extract emotions for non-tag text
    if (extractEmotions && (sentence.tags.length === 0 || sentence.tags[0]?.state === 'none')) {
      const emotions = extractEmotionTags(sentence.text)
      if (emotions.length > 0) {
        actions.expressions = emotions
      }
    }

    yield [sentence, actions]
  }
}

/**
 * Stage 3: Display Processor Decorator
 *
 * Converts think tags to parentheses for display.
 * Passes through dictionaries unchanged.
 */
export async function* displayProcessorTransformer(
  stream: AsyncIterable<[SentenceWithTags, Actions] | DictType>,
): AsyncGenerator<[SentenceWithTags, DisplayText, Actions] | DictType, void, unknown> {
  for await (const item of stream) {
    if (typeof item === 'object' && !Array.isArray(item)) {
      // Dict pass-through
      yield item as DictType
      continue
    }

    const [sentence, actions] = item as [SentenceWithTags, Actions]
    let displayText = sentence.text

    // Handle think tag states
    for (const tag of sentence.tags) {
      if (tag.name === 'think') {
        if (tag.state === 'start') {
          displayText = '('
        }
        else if (tag.state === 'end') {
          displayText = ')'
        }
      }
    }

    yield [sentence, { text: displayText, name: 'AI' }, actions]
  }
}

/**
 * Stage 4: TTS Filter Decorator
 *
 * Applies TTS text filtering, skipping think content.
 * Produces final SentenceOutput.
 */
export async function* ttsFilterTransformer(
  stream: AsyncIterable<[SentenceWithTags, DisplayText, Actions] | DictType>,
  options?: TtsFilterOptions,
): AsyncGenerator<SentenceOutput | DictType, void, unknown> {
  for await (const item of stream) {
    if (typeof item === 'object' && !Array.isArray(item)) {
      // Dict pass-through
      yield item as DictType
      continue
    }

    const [sentence, display, actions] = item as [SentenceWithTags, DisplayText, Actions]

    // Check if this is think content (should be silent)
    const hasThinkTag = sentence.tags.some((tag: { name: string }) => tag.name === 'think')

    // Apply TTS filter
    const { ttsText, isSilent } = preprocessForTts(sentence.text, {
      ...options,
      hasThinkTag,
    })

    yield {
      displayText: display,
      ttsText: isSilent ? '' : ttsText,
      actions,
    }
  }
}

/**
 * Complete Pipeline: All transformers in sequence
 *
 * This is the main entry point that chains all transformers together.
 */
export async function* createTransformPipeline(
  stream: TextTokenStream,
  options?: TransformerPipelineOptions,
): AsyncGenerator<SentenceOutput | DictType, void, unknown> {
  const {
    sentenceDivider,
    ttsFilter,
    extractEmotions = true,
  } = options ?? {}

  // Chain all transformers
  const stage1 = sentenceDividerTransformer(stream, sentenceDivider)
  const stage2 = actionsExtractorTransformer(stage1, extractEmotions)
  const stage3 = displayProcessorTransformer(stage2)
  const stage4 = ttsFilterTransformer(stage3, ttsFilter)

  yield* stage4
}

/**
 * Convenience function to process a complete text string
 */
export async function processTextToSentences(
  text: string,
  options?: TransformerPipelineOptions,
): Promise<SentenceOutput[]> {
  const results: SentenceOutput[] = []

  const inputStream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(text)
      controller.close()
    },
  })

  for await (const item of createTransformPipeline(inputStream, options)) {
    if (typeof item === 'object' && 'displayText' in item) {
      results.push(item as SentenceOutput)
    }
  }

  return results
}

/**
 * Create a transform stream for use in pipelines
 */
export function createTransformStream(
  options?: TransformerPipelineOptions,
): TransformStream<string, SentenceOutput | DictType> {
  return new TransformStream({
    async transform(chunk, controller) {
      for await (const item of createTransformPipeline(
        new ReadableStream({
          start(ctrl) {
            ctrl.enqueue(chunk)
            ctrl.close()
          },
        }),
        options,
      )) {
        controller.enqueue(item)
      }
    },
  })
}
