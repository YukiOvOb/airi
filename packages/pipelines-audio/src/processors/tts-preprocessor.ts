/**
 * TTS Text Preprocessor
 */

export interface TtsFilterOptions {
  removeSpecialChar?: boolean
  ignoreBrackets?: boolean
  ignoreParentheses?: boolean
  ignoreAsterisks?: boolean
  ignoreAngleBrackets?: boolean
}

export function removeSpecialCharacters(text: string): string {
  const normalized = text.normalize('NFKC')
  return normalized.replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, '').replace(/\s+/g, ' ').trim()
}

function filterNested(text: string, left: string, right: string): string {
  if (!text)
    return text

  const result: string[] = []
  let depth = 0

  for (const char of text) {
    if (char === left) {
      depth++
    }
    else if (char === right) {
      if (depth > 0)
        depth--
    }
    else {
      if (depth === 0)
        result.push(char)
    }
  }

  return result.join('').replace(/\s+/g, ' ').trim()
}

export function filterBrackets(text: string): string {
  return filterNested(text, '[', ']')
}

export function filterParentheses(text: string): string {
  return filterNested(text, '(', ')')
}

export function filterAngleBrackets(text: string): string {
  return filterNested(text, '<', '>')
}

export function filterAsterisks(text: string): string {
  return text.replace(/\*{1,}[^*]+?\*{1,}/g, '').replace(/\s+/g, ' ').trim()
}

export function ttsFilter(text: string, options: TtsFilterOptions = {}): string {
  let result = text

  const {
    removeSpecialChar = false,
    ignoreBrackets = true,
    ignoreParentheses = true,
    ignoreAsterisks = true,
    ignoreAngleBrackets = true,
  } = options

  try {
    if (ignoreAsterisks)
      result = filterAsterisks(result)
  }
  catch (e) {
    console.warn('Error filtering asterisks:', e)
  }

  try {
    if (ignoreBrackets)
      result = filterBrackets(result)
  }
  catch (e) {
    console.warn('Error filtering brackets:', e)
  }

  try {
    if (ignoreParentheses)
      result = filterParentheses(result)
  }
  catch (e) {
    console.warn('Error filtering parentheses:', e)
  }

  try {
    if (ignoreAngleBrackets)
      result = filterAngleBrackets(result)
  }
  catch (e) {
    console.warn('Error filtering angle brackets:', e)
  }

  try {
    if (removeSpecialChar)
      result = removeSpecialCharacters(result)
  }
  catch (e) {
    console.warn('Error removing special characters:', e)
  }

  return result
}

export function processThinkTagsForDisplay(text: string): string {
  return text
    .replace(/(text: string,
  options?: TtsFilterOptions & { hasThinkTag?: boolean },
): TtsPreprocessResult {
  const displayText = processThinkTagsForDisplay(text)

  if (options?.hasThinkTag) {
    return {
      displayText,
      ttsText: '',
      isSilent: true,
    }
  }

  const ttsText = ttsFilter(text, options)

  return {
    displayText,
    ttsText,
    isSilent: ttsText.trim().length === 0,
  }
}

export function extractEmotionTags(text: string): string[] {
  const emotions: string[] = []
  const pattern = /\[([a-zA-Z_]+)\]/g

  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    emotions.push(match[1])
  }

  return emotions
}

export function removeEmotionTags(text: string): string {
  return text.replace(/\[([a-zA-Z_]+)\]/g, '').trim()
}

export function hasThinkTags(text: string): boolean {
  return text.includes('<think') || text.includes('>')
}
