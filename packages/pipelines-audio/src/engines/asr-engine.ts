/**
 * ASR (Automatic Speech Recognition) Engine Interface
 *
 * This module provides a unified interface for speech recognition engines,
 * similar to Open-LLM-VTuber's ASR architecture.
 *
 * Supported engines:
 * - Web Speech API (browser-native, free)
 * - Whisper API (OpenAI, Groq)
 * - Custom ASR endpoints
 */

// Type declarations for Web Speech API
declare global {

  var SpeechRecognition: typeof SpeechRecognition | undefined

  var webkitSpeechRecognition: typeof SpeechRecognition | undefined
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: (event: SpeechRecognitionEvent) => void
  onerror: (event: SpeechRecognitionErrorEvent) => void
  onend: () => void
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionResultList {
  readonly length: number
  item: (index: number) => SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  readonly length: number
  item: (index: number) => SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
  isFinal: boolean
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

/**
 * ASR engine configuration
 */
export interface AsrEngineConfig {
  /** Language code (e.g., 'en-US', 'zh-CN') */
  language?: string
  /** Whether to use ITN (Inverse Text Normalization) */
  useItn?: boolean
  /** Hotwords for better recognition */
  hotwords?: string[]
  /** Engine-specific options */
  options?: Record<string, unknown>
}

/**
 * ASR result
 */
export interface AsrResult {
  /** Recognized text */
  text: string
  /** Confidence score (0-1) */
  confidence?: number
  /** Language detected */
  language?: string
  /** Duration in seconds */
  duration?: number
}

/**
 * ASR engine interface
 */
export interface AsrEngine {
  /**
   * Engine name
   */
  readonly name: string

  /**
   * Recognize speech from audio data
   *
   * @param audioData - PCM audio data (Float32Array, mono)
   * @param sampleRate - Sample rate in Hz
   * @param config - ASR configuration
   * @param signal - Abort signal for cancellation
   * @returns Recognition result
   */
  recognize: (
    audioData: Float32Array,
    sampleRate: number,
    config?: AsrEngineConfig,
    signal?: AbortSignal,
  ) => Promise<AsrResult>

  /**
   * Stream recognition (for real-time ASR)
   *
   * @param audioStream - Stream of audio chunks
   * @param sampleRate - Sample rate in Hz
   * @param config - ASR configuration
   * @returns Async iterator of partial results
   */
  recognizeStream?: (
    audioStream: ReadableStream<Float32Array>,
    sampleRate: number,
    config?: AsrEngineConfig,
  ) => AsyncIterator<AsrResult>

  /**
   * Check if engine is available
   */
  isAvailable?: () => Promise<boolean>

  /**
   * Get supported languages
   */
  getLanguages?: () => Promise<string[]>
}

/**
 * Web Speech API ASR Engine
 *
 * Uses browser's built-in speech recognition.
 * Free, works offline in some browsers.
 */
export class WebSpeechAsrEngine implements AsrEngine {
  readonly name = 'web-speech'

  private recognition: typeof SpeechRecognition | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition()
        this.recognition.continuous = true
        this.recognition.interimResults = true
        this.recognition.maxAlternatives = 1
      }
    }
  }

  async recognize(
    audioData: Float32Array,
    sampleRate: number,
    config?: AsrEngineConfig,
  ): Promise<AsrResult> {
    if (!this.recognition) {
      throw new Error('Speech recognition not available in this browser')
    }

    // Web Speech API doesn't support direct audio input
    // This is a limitation of the browser API
    throw new Error('Web Speech API requires microphone input, not audio buffer. Use recognizeStream() instead.')
  }

  async* recognizeStream(
    audioStream: ReadableStream<Float32Array>,
    sampleRate: number,
    config?: AsrEngineConfig,
  ): AsyncIterator<AsrResult> {
    if (!this.recognition) {
      throw new Error('Speech recognition not available in this browser')
    }

    const language = config?.language || 'en-US'
    this.recognition.lang = language

    // Web Speech API works with microphone, not audio stream
    // This is a browser limitation
    // For real streaming, use a different engine
    throw new Error('Web Speech API requires microphone access. Use browser-native SpeechRecognition directly.')
  }

  async isAvailable(): Promise<boolean> {
    return this.recognition !== null
  }

  async getLanguages(): Promise<string[]> {
    // Common languages
    return [
      'en-US',
      'en-GB',
      'zh-CN',
      'ja-JP',
      'ko-KR',
      'es-ES',
      'fr-FR',
      'de-DE',
    ]
  }
}

/**
 * Whisper API ASR Engine
 *
 * Uses OpenAI Whisper API (or compatible endpoints like Groq).
 */
export class WhisperAsrEngine implements AsrEngine {
  readonly name = 'whisper-api'

  constructor(
    private apiKey: string,
    private baseUrl: string = 'https://api.openai.com/v1',
    private model: string = 'whisper-1',
  ) {}

  async recognize(
    audioData: Float32Array,
    sampleRate: number,
    config?: AsrEngineConfig,
    signal?: AbortSignal,
  ): Promise<AsrResult> {
    // Convert to WAV format
    const wavBuffer = this.floatToWav(audioData, sampleRate)
    const blob = new Blob([wavBuffer], { type: 'audio/wav' })

    const formData = new FormData()
    formData.append('file', blob, 'audio.wav')
    formData.append('model', this.model)
    if (config?.language) {
      formData.append('language', config.language)
    }

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
      signal,
    })

    if (!response.ok) {
      throw new Error(`Whisper API request failed: ${response.statusText}`)
    }

    const data = await response.json()

    return {
      text: data.text,
      language: data.language || config?.language,
    }
  }

  private floatToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const numChannels = 1
    const bitsPerSample = 16
    const byteRate = sampleRate * numChannels * bitsPerSample / 8
    const blockAlign = numChannels * bitsPerSample / 8
    const dataSize = samples.length * 2
    const bufferSize = 44 + dataSize

    const buffer = new ArrayBuffer(bufferSize)
    const view = new DataView(buffer)

    // WAV header
    const writeString = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++)
        view.setUint8(offset + i, s.charCodeAt(i))
    }

    writeString(0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitsPerSample, true)
    writeString(36, 'data')
    view.setUint32(40, dataSize, true)

    // Convert float to 16-bit PCM
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
    }

    return buffer
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey
  }

  async getLanguages(): Promise<string[]> {
    return [
      'en',
      'zh',
      'ja',
      'ko',
      'es',
      'fr',
      'de',
      'it',
      'pt',
      'ru',
    ]
  }
}

/**
 * ASR Engine Factory
 */
export class AsrEngineFactory {
  private static engines = new Map<string, AsrEngine>()

  static register(engine: AsrEngine): void {
    this.engines.set(engine.name, engine)
  }

  static get(name: string): AsrEngine | undefined {
    return this.engines.get(name)
  }

  static create(name: string, config?: Record<string, unknown>): AsrEngine {
    switch (name) {
      case 'web-speech':
        return new WebSpeechAsrEngine()
      case 'whisper-api':
        return new WhisperAsrEngine(
          config?.apiKey as string,
          config?.baseUrl as string || 'https://api.openai.com/v1',
          config?.model as string || 'whisper-1',
        )
      default:
        throw new Error(`Unknown ASR engine: ${name}`)
    }
  }

  static async getDefault(): Promise<AsrEngine> {
    const engines = ['whisper-api', 'web-speech']

    for (const name of engines) {
      let engine = this.get(name)

      if (!engine) {
        try {
          engine = this.create(name)
          this.register(engine)
        }
        catch {
          continue
        }
      }

      if (engine.isAvailable) {
        const available = await engine.isAvailable()
        if (available)
          return engine
      }
      else {
        return engine
      }
    }

    throw new Error('No ASR engine available')
  }
}

// Register default engines
AsrEngineFactory.register(new WebSpeechAsrEngine())
