/**
 * TTS Engine Interface and Factory
 *
 * This module provides a unified interface for Text-to-Speech engines,
 * similar to Open-LLM-VTuber's TTS architecture.
 *
 * Supported engines:
 * - Edge TTS (default - free, high quality, low latency)
 * - GPT-SoVITS (voice cloning)
 * - ElevenLabs (premium quality)
 * - OpenAI-compatible (Kokoro, etc.)
 * - System TTS (fallback)
 */

/**
 * TTS engine configuration
 */
export interface TtsEngineConfig {
  /** Voice ID or name */
  voice?: string
  /** Speaking rate (0.1 - 10.0, where 1.0 is normal) */
  rate?: number
  /** Pitch adjustment (-20.0 to 20.0, where 0 is normal) */
  pitch?: number
  /** Volume (0.0 to 1.0) */
  volume?: number
  /** Language code (e.g., 'en-US', 'zh-CN') */
  language?: string
  /** Engine-specific options */
  options?: Record<string, unknown>
}

/**
 * TTS result
 */
export interface TtsSynthesisResult {
  /** Audio data (Float32Array for playback) */
  audio: Float32Array
  /** Sample rate in Hz */
  sampleRate: number
  /** Duration in seconds */
  duration: number
}

/**
 * TTS engine interface
 *
 * All TTS engines must implement this interface.
 */
export interface TtsEngine {
  /**
   * Engine name (for identification and logging)
   */
  readonly name: string

  /**
   * Generate speech from text
   *
   * @param text - Text to synthesize
   * @param config - TTS configuration
   * @param signal - Abort signal for cancellation
   * @returns TTS result with audio data
   */
  synthesize: (text: string, config?: TtsEngineConfig, signal?: AbortSignal) => Promise<TtsResult>

  /**
   * Get available voices
   *
   * @returns Array of available voice identifiers
   */
  getVoices?: () => Promise<string[]>

  /**
   * Check if engine is available
   *
   * @returns true if engine can be used
   */
  isAvailable?: () => Promise<boolean>
}

/**
 * Edge TTS Engine
 *
 * Uses Microsoft Edge's online TTS service.
 * Free, high quality, multilingual support.
 */
export class EdgeTtsEngine implements TtsEngine {
  readonly name = 'edge-tts'

  private apiUrl = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'

  async synthesize(text: string, config?: TtsEngineConfig, signal?: AbortSignal): Promise<TtsSynthesisResult> {
    const voice = config?.voice || 'en-US-JennyNeural'
    const rate = config?.rate || 1.0
    const pitch = config?.pitch || 0
    const volume = config?.volume || 1.0

    // Build SSML
    const ssml = this.buildSsml(text, voice, rate, pitch, volume)

    // Fetch audio from Edge TTS API
    const response = await fetch(`${this.apiUrl}?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: ssml,
      signal,
    })

    if (!response.ok) {
      throw new Error(`Edge TTS request failed: ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const audioContext = new AudioContext({ sampleRate: 24000 })
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    const audio = audioBuffer.getChannelData(0)
    audioContext.close()

    return {
      audio,
      sampleRate: 24000,
      duration: audioBuffer.duration,
    }
  }

  private buildSsml(text: string, voice: string, rate: number, pitch: number, volume: number): string {
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
      <voice name="${voice}">
        <prosody rate="${this.formatRate(rate)}" pitch="${this.formatPitch(pitch)}" volume="${this.formatVolume(volume)}">
          ${text}
        </prosody>
      </voice>
    </speak>`
  }

  private formatRate(rate: number): string {
    return rate === 1 ? 'medium' : rate < 1 ? `${Math.round(rate * 100)}%` : `${Math.round(rate * 100)}%`
  }

  private formatPitch(pitch: number): string {
    return pitch === 0 ? 'medium' : pitch > 0 ? `+${pitch}Hz` : `${pitch}Hz`
  }

  private formatVolume(volume: number): string {
    return `${Math.round(volume * 100)}%`
  }

  async getVoices(): Promise<string[]> {
    // Common Edge TTS voices
    return [
      'en-US-JennyNeural',
      'en-US-GuyNeural',
      'en-GB-SoniaNeural',
      'en-GB-RyanNeural',
      'zh-CN-XiaoxiaoNeural',
      'zh-CN-YunxiNeural',
      'zh-CN-YunyangNeural',
      'ja-JP-NanamiNeural',
      'ja-JP-KeitaNeural',
      'ko-KR-SunHiNeural',
      'ko-KR-InJoonNeural',
    ]
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.apiUrl, { method: 'HEAD' })
      return response.ok
    }
    catch {
      return true // API might still work even if HEAD fails
    }
  }
}

/**
 * OpenAI-compatible TTS Engine
 *
 * Works with OpenAI, Kokoro, and other compatible services.
 */
export class OpenAiTtsEngine implements TtsEngine {
  readonly name = 'openai-tts'

  constructor(private baseUrl: string = 'https://api.openai.com/v1', private apiKey?: string) {}

  async synthesize(text: string, config?: TtsEngineConfig, signal?: AbortSignal): Promise<TtsSynthesisResult> {
    const voice = config?.voice || 'alloy'
    const model = config?.options?.model || 'tts-1'

    const response = await fetch(`${this.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        response_format: 'mp3',
      }),
      signal,
    })

    if (!response.ok) {
      throw new Error(`OpenAI TTS request failed: ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const audioContext = new AudioContext({ sampleRate: 24000 })
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    const audio = audioBuffer.getChannelData(0)
    audioContext.close()

    return {
      audio,
      sampleRate: 24000,
      duration: audioBuffer.duration,
    }
  }

  async getVoices(): Promise<string[]> {
    return ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey || this.baseUrl !== 'https://api.openai.com/v1'
  }
}

/**
 * Web Speech API Engine (Browser native)
 *
 * Fallback option using browser's built-in speech synthesis.
 */
export class WebSpeechTtsEngine implements TtsEngine {
  readonly name = 'web-speech'

  private synth = typeof window !== 'undefined' ? window.speechSynthesis : null

  async synthesize(text: string, config?: TtsEngineConfig): Promise<TtsResult> {
    if (!this.synth) {
      throw new Error('Speech synthesis not available in this environment')
    }

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.voice = this.getVoice(config?.voice)
      utterance.rate = config?.rate || 1
      utterance.pitch = (config?.pitch || 0 + 100) / 100
      utterance.volume = config?.volume || 1

      utterance.onend = () => {
        // Web Speech API doesn't provide audio data
        // Return empty result - playback handled by browser
        resolve({
          audio: new Float32Array(0),
          sampleRate: 24000,
          duration: 0,
        })
      }

      utterance.onerror = (event) => {
        reject(new Error(`Speech synthesis error: ${event.error}`))
      }

      this.synth!.speak(utterance)
    })
  }

  private getVoice(name?: string): SpeechSynthesisVoice | undefined {
    if (!this.synth)
      return undefined

    const voices = this.synth.getVoices()
    if (!name)
      return voices[0]

    return voices.find(v => v.name === name || v.voiceURI === name)
  }

  async getVoices(): Promise<string[]> {
    if (!this.synth)
      return []

    const voices = this.synth.getVoices()
    return voices.map(v => v.name)
  }

  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }
}

/**
 * TTS Engine Factory
 */
export class TtsEngineFactory {
  private static engines = new Map<string, TtsEngine>()

  /**
   * Register a TTS engine
   */
  static register(engine: TtsEngine): void {
    this.engines.set(engine.name, engine)
  }

  /**
   * Get a TTS engine by name
   */
  static get(name: string): TtsEngine | undefined {
    return this.engines.get(name)
  }

  /**
   * Create an engine with configuration
   */
  static create(name: string, config?: Record<string, unknown>): TtsEngine {
    switch (name) {
      case 'edge-tts':
        return new EdgeTtsEngine()
      case 'openai-tts':
        return new OpenAiTtsEngine(
          config?.baseUrl as string || 'https://api.openai.com/v1',
          config?.apiKey as string,
        )
      case 'web-speech':
        return new WebSpeechTtsEngine()
      default:
        throw new Error(`Unknown TTS engine: ${name}`)
    }
  }

  /**
   * Get default engine
   */
  static async getDefault(): Promise<TtsEngine> {
    // Try engines in order of preference
    const engines = ['edge-tts', 'openai-tts', 'web-speech']

    for (const name of engines) {
      let engine: TtsEngine | undefined

      // Check if already registered
      engine = this.get(name)

      // If not registered, try to create
      if (!engine) {
        try {
          engine = this.create(name)
          this.register(engine)
        }
        catch {
          continue
        }
      }

      // Check if available
      if (engine.isAvailable) {
        const available = await engine.isAvailable()
        if (available)
          return engine
      }
      else {
        return engine
      }
    }

    throw new Error('No TTS engine available')
  }
}

// Register default engines
TtsEngineFactory.register(new EdgeTtsEngine())
TtsEngineFactory.register(new WebSpeechTtsEngine())
