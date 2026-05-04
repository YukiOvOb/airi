import { createPushStream } from '../stream'

/**
 * Punctuation categories for sentence splitting
 */
const COMMAS = [
  ',',
  '،',
  '，',
  '、',
  '፣',
  '၊',
  ';',
  '΄',
  '‛',
  '।',
  '﹐',
  '꓾',
  '⹁',
  '︐',
  '﹑',
  '､',
]

const END_PUNCTUATIONS = [
  '.',
  '!',
  '?',
  '。',
  '！',
  '？',
  '…',
  '⋯',
  '～',
  '~',
  '\n',
  '\t',
  '\r',
]

const ABBREVIATIONS = new Set([
  'Mr.',
  'Mrs.',
  'Dr.',
  'Prof.',
  'Inc.',
  'Ltd.',
  'Jr.',
  'Sr.',
  'e.g.',
  'i.e.',
  'vs.',
  'St.',
  'Rd.',
])

const KEPT_PUNCTUATIONS = new Set(['?', '？', '!', '！'])

/**
 * Check if text contains any comma
 */
export function containsComma(text: string): boolean {
  return COMMAS.some(comma => text.includes(comma))
}

/**
 * Split text at the first comma found
 */
export function commaSplitter(text: string): [string, string] {
  for (const comma of COMMAS) {
    const index = text.indexOf(comma)
    if (index !== -1) {
      return [text.slice(0, index + 1).trim(), text.slice(index + 1).trim()]
    }
  }
  return [text, '']
}

/**
 * Check if text contains any end punctuation
 */
export function containsEndPunctuation(text: string): boolean {
  return END_PUNCTUATIONS.some(punct => text.includes(punct))
}

/**
 * Check if text is a complete sentence (ends with punctuation and not abbreviation)
 */
export function isCompleteSentence(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed)
    return false

  if (ABBREVIATIONS.has(trimmed))
    return false

  return END_PUNCTUATIONS.some(punct => trimmed.endsWith(punct))
}

/**
 * Segment text by regex pattern (fallback for unsupported languages)
 */
export function segmentTextByRegex(text: string): [string[], string] {
  if (!text)
    return [[], '']

  const completeSentences: string[] = []
  let remaining = text.trim()

  // Create pattern for matching sentences ending with any end punctuation
  const escapedPuncts = END_PUNCTUATIONS.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(.*?(?:[${escapedPuncts.join('')}]))`)

  while (remaining) {
    const match = remaining.match(pattern)
    if (!match)
      break

    const potentialSentence = match[1].trim()

    // Skip if sentence ends with abbreviation
    if (ABBREVIATIONS.has(potentialSentence)) {
      remaining = remaining.slice(match[1].length).trimStart()
      continue
    }

    completeSentences.push(potentialSentence)
    remaining = remaining.slice(match[1].length).trimStart()
  }

  return [completeSentences, remaining]
}

/**
 * Supported languages for Intl.Segmenter (pysbd equivalent)
 */
const SUPPORTED_LANGUAGES = new Set([
  'am',
  'ar',
  'bg',
  'da',
  'de',
  'el',
  'en',
  'es',
  'fa',
  'fr',
  'hi',
  'hy',
  'it',
  'ja',
  'kk',
  'mr',
  'my',
  'nl',
  'pl',
  'ru',
  'sk',
  'ur',
  'zh',
])

/**
 * Detect language from text (simplified - uses browser API)
 */
export function detectLanguage(text: string): string | null {
  try {
    // Use Intl.Segmenter as a hint for language support
    // In a real implementation, you'd use a proper language detection library
    // For now, default to English or detect from character ranges
    if (/[一-鿿]/.test(text))
      return 'zh'
    if (/[぀-ゟ゠-ヿ]/.test(text))
      return 'ja'
    if (/[Ѐ-ӿ]/.test(text))
      return 'ru'
    if (/[؀-ۿ]/.test(text))
      return 'ar'
    return 'en'
  }
  catch {
    return 'en'
  }
}

/**
 * Segment text using Intl.Segmenter (browser-native pysbd equivalent)
 */
export function segmentTextBySegmenter(text: string, lang: string): [string[], string] {
  if (!text)
    return [[], '']

  try {
    const segmenter = new Intl.Segmenter(lang, { granularity: 'sentence' })
    const segments = [...segmenter.segment(text)]

    if (segments.length === 0)
      return [[], text]

    const completeSentences: string[] = []

    // Process all but the last segment
    for (let i = 0; i < segments.length - 1; i++) {
      const sentence = segments[i].segment.trim()
      if (sentence)
        completeSentences.push(sentence)
    }

    // Handle the last segment
    const lastSegment = segments.at(-1).segment.trim()
    if (isCompleteSentence(lastSegment)) {
      completeSentences.push(lastSegment)
      return [completeSentences, '']
    }

    return [completeSentences, lastSegment]
  }
  catch {
    // Fallback to regex if segmenter fails
    return segmentTextByRegex(text)
  }
}

/**
 * Tag state for nested tag handling
 */
export enum TagState {
  NONE = 'none',
  START = 'start',
  INSIDE = 'inside',
  END = 'end',
  SELF_CLOSING = 'self',
}

/**
 * Tag information
 */
export interface TagInfo {
  name: string
  state: TagState
}

/**
 * Sentence with associated tags
 */
export interface SentenceWithTags {
  text: string
  tags: TagInfo[]
}

/**
 * Segment stream into sentences with tag support
 */
export interface SentenceDividerOptions {
  /**
   * Enable faster first response by splitting at first comma
   * @default true
   */
  fasterFirstResponse?: boolean
  /**
   * Method to use for sentence segmentation
   * @default 'auto'
   */
  segmentMethod?: 'auto' | 'regex' | 'segmenter'
  /**
   * Valid tag names to detect (e.g., ['think'])
   * @default ['think']
   */
  validTags?: string[]
  /**
   * Minimum words before splitting at comma
   * @default 2
   */
  minimumWords?: number
}

/**
 * Create a sentence divider processor
 *
 * This processor splits streaming text into sentences while handling:
 * - Nested tags (e.g., <think>...</think>)
 * - Faster first response (split at comma for first sentence)
 * - Multi-language support via Intl.Segmenter
 * - Fallback to regex for unsupported languages
 */
export function createSentenceDividerStream(
  tokens: ReadableStream<string>,
  options?: SentenceDividerOptions,
): ReadableStream<SentenceWithTags | string> {
  const {
    fasterFirstResponse = true,
    segmentMethod = 'auto',
    validTags = ['think'],
    minimumWords = 2,
  } = options ?? {}

  const { stream, write, close, error } = createPushStream<SentenceWithTags | string>()

  const tagStack: TagInfo[] = []
  let buffer = ''
  let isFirstSentence = true
  let detectedLang: string | null = null

  function getCurrentTags(): TagInfo[] {
    return tagStack.map(tag => ({ ...tag, state: TagState.INSIDE }))
  }

  function extractTag(text: string): { tag: TagInfo | null, remaining: string } {
    for (const tagName of validTags) {
      // Check for self-closing tags
      const selfClosingPattern = new RegExp(`^<${tagName}\\s*/>`)
      const selfClosingMatch = text.match(selfClosingPattern)
      if (selfClosingMatch) {
        return {
          tag: { name: tagName, state: TagState.SELF_CLOSING },
          remaining: text.slice(selfClosingMatch[0].length).trimStart(),
        }
      }

      // Check for opening tags
      const openPattern = new RegExp(`^<${tagName}>`)
      const openMatch = text.match(openPattern)
      if (openMatch) {
        tagStack.push({ name: tagName, state: TagState.START })
        return {
          tag: { name: tagName, state: TagState.START },
          remaining: text.slice(openMatch[0].length).trimStart(),
        }
      }

      // Check for closing tags
      const closePattern = new RegExp(`^</${tagName}>`)
      const closeMatch = text.match(closePattern)
      if (closeMatch) {
        if (tagStack.length > 0 && tagStack.at(-1).name === tagName) {
          tagStack.pop()
        }
        return {
          tag: { name: tagName, state: TagState.END },
          remaining: text.slice(closeMatch[0].length).trimStart(),
        }
      }
    }

    return { tag: null, remaining: text }
  }

  function segmentText(text: string): [string[], string] {
    if (!detectedLang) {
      detectedLang = detectLanguage(text)
    }

    if (segmentMethod === 'regex' || (segmentMethod === 'auto' && !SUPPORTED_LANGUAGES.has(detectedLang))) {
      return segmentTextByRegex(text)
    }

    return segmentTextBySegmenter(text, detectedLang)
  }

  function countWords(text: string): number {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
    return [...segmenter.segment(text)].filter(s => s.isWordLike).length
  }

  function processBuffer(): (SentenceWithTags | string)[] {
    const results: (SentenceWithTags | string)[] = []
    let processed = true

    while (processed && buffer.length > 0) {
      processed = false

      // Check for tag at start
      const tagCheck = extractTag(buffer)
      if (tagCheck.tag && buffer.trimStart().startsWith('<')) {
        buffer = tagCheck.remaining
        results.push({ text: '', tags: [tagCheck.tag] })
        processed = true
        continue
      }

      // Find next tag position
      let nextTagPos = buffer.length
      for (const tagName of validTags) {
        const patterns = [`<${tagName}>`, `</${tagName}>`, `<${tagName}\\s*/>`]
        for (const pattern of patterns) {
          const pos = buffer.search(new RegExp(pattern))
          if (pos !== -1 && pos < nextTagPos) {
            nextTagPos = pos
          }
        }
      }

      // Process text before tag (or entire buffer if no tag)
      const textToProcess = nextTagPos === 0 ? '' : buffer.slice(0, nextTagPos)
      const currentTags = getCurrentTags()

      if (textToProcess.length > 0) {
        // Check for faster first response (comma split)
        if (
          isFirstSentence
          && fasterFirstResponse
          && containsComma(textToProcess)
          && countWords(textToProcess) >= minimumWords
        ) {
          const [firstPart, remaining] = commaSplitter(textToProcess)
          if (firstPart) {
            results.push({ text: firstPart, tags: currentTags.length > 0 ? currentTags : [{ name: '', state: TagState.NONE }] })
            buffer = remaining + buffer.slice(firstPart.length)
            isFirstSentence = false
            processed = true
            continue
          }
        }

        // Check for sentence end punctuation
        if (containsEndPunctuation(textToProcess)) {
          const [sentences, remaining] = segmentText(textToProcess)
          for (const sentence of sentences) {
            if (sentence.trim()) {
              results.push({ text: sentence.trim(), tags: currentTags.length > 0 ? currentTags : [{ name: '', state: TagState.NONE }] })
            }
          }
          buffer = remaining + buffer.slice(textToProcess.length - remaining.length)
          isFirstSentence = false
          processed = true
          continue
        }
      }

      // If no sentence boundary found, wait for more input
      if (!processed)
        break
    }

    return results
  }

  // Start processing
  void (async () => {
    const reader = tokens.getReader()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done)
          break

        if (!value)
          continue

        buffer += value

        // Process buffer and emit results
        const results = processBuffer()
        for (const result of results) {
          write(result)
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        const currentTags = getCurrentTags()
        write({
          text: buffer.trim(),
          tags: currentTags.length > 0 ? currentTags : [{ name: '', state: TagState.NONE }],
        })
      }

      close()
    }
    catch (err) {
      error(err)
    }
    finally {
      reader.releaseLock()
    }
  })()

  return stream
}

/**
 * Convenience function to create a sentence divider from a string
 */
export async function* divideSentences(
  text: string,
  options?: SentenceDividerOptions,
): AsyncGenerator<SentenceWithTags, void, unknown> {
  const stream = createSentenceDividerStream(
    new ReadableStream({
      start(controller) {
        controller.enqueue(text)
        controller.close()
      },
    }),
    options,
  )

  const reader = stream.getReader()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done)
        break
      if (value)
        yield value as SentenceWithTags
    }
  }
  finally {
    reader.releaseLock()
  }
}
