/**
 * VAD (Voice Activity Detection) Engine
 *
 * This module provides voice activity detection similar to Silero VAD.
 * It detects when a user starts and stops speaking, enabling:
 * - Interruption handling (PAUSE/RESUME signals)
 * - No-headphone conversation support
 * - Noise filtering
 *
 * Based on Open-LLM-VTuber's vad/silero.py implementation.
 */

import { createPushStream } from '../stream'

/**
 * VAD state machine states
 */
export enum VadState {
  IDLE = 'idle',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/**
 * VAD events
 */
export interface VadEvents {
  /** User started speaking */
  onSpeechStart: () => void
  /** User stopped speaking */
  onSpeechEnd: (audioData: Float32Array) => void
  /** VAD detected speech (interim) */
  onSpeechDetected: (probability: number) => void
}

/**
 * VAD engine configuration
 */
export interface VadConfig {
  /** Probability threshold (0-1) for speech detection */
  probThreshold?: number
  /** Decibel threshold to prevent noise triggers */
  dbThreshold?: number
  /** Number of consecutive hits to trigger speech start */
  requiredHits?: number
  /** Number of consecutive misses to trigger speech end */
  requiredMisses?: number
  /** Smoothing window size (frames) */
  smoothingWindow?: number
  /** Pre-buffer size in frames (~640ms) */
  preBufferSize?: number
  /** Frame size in samples (at 16kHz, 512 = 32ms) */
  frameSize?: number
  /** Sample rate in Hz */
  sampleRate?: number
}

/**
 * Simple energy-based VAD implementation
 *
 * This is a JavaScript implementation of VAD using:
 * - Energy (RMS) thresholding
 * - Zero-crossing rate for voiced/unvoiced detection
 * - Smoothing and hysteresis
 *
 * For production use with Silero VAD, you would need:
 * - ONNX Runtime Web
 * - Silero VAD model file
 * - TensorFlow.js or similar
 */
export class EnergyVadEngine {
  readonly name = 'energy-vad'

  private state = VadState.IDLE
  private hitCount = 0
  private missCount = 0
  private preBuffer: Float32Array[] = []
  private speechBuffer: Float32Array[] = []
  private probabilityHistory: number[] = []

  private readonly probThreshold: number
  private readonly dbThreshold: number
  private readonly requiredHits: number
  private readonly requiredMisses: number
  private readonly smoothingWindow: number
  private readonly preBufferSize: number
  private readonly frameSize: number
  private readonly sampleRate: number

  private listeners: Partial<VadEvents> = {}

  constructor(config: VadConfig = {}) {
    this.probThreshold = config.probThreshold ?? 0.4
    this.dbThreshold = config.dbThreshold ?? 60
    this.requiredHits = config.requiredHits ?? 3
    this.requiredMisses = config.requiredMisses ?? 24
    this.smoothingWindow = config.smoothingWindow ?? 5
    this.preBufferSize = config.preBufferSize ?? 20
    this.frameSize = config.frameSize ?? 512
    this.sampleRate = config.sampleRate ?? 16000
  }

  /**
   * Register event listeners
   */
  on<K extends keyof VadEvents>(event: K, callback: VadEvents[K]): void {
    this.listeners[event] = callback
  }

  /**
   * Process a frame of audio
   *
   * @param frame - Audio frame (should be frameSize samples)
   * @returns Current VAD state and any special signals
   */
  processFrame(frame: Float32Array): { state: VadState, signal?: 'PAUSE' | 'RESUME' } {
    // Calculate probability
    const probability = this.calculateProbability(frame)

    // Smooth probability
    this.probabilityHistory.push(probability)
    if (this.probabilityHistory.length > this.smoothingWindow) {
      this.probabilityHistory.shift()
    }
    const smoothedProb = this.probabilityHistory.reduce((a, b) => a + b, 0) / this.probabilityHistory.length

    // Calculate decibel level
    const db = this.calculateDecibel(frame)

    // Determine if speech is detected
    const isSpeech = smoothedProb > this.probThreshold && db > this.dbThreshold

    // Update pre-buffer
    this.preBuffer.push(frame)
    if (this.preBuffer.length > this.preBufferSize) {
      this.preBuffer.shift()
    }

    // State machine
    switch (this.state) {
      case VadState.IDLE:
        if (isSpeech) {
          this.hitCount++
          if (this.hitCount >= this.requiredHits) {
            this.state = VadState.ACTIVE
            this.hitCount = 0
            this.listeners.onSpeechStart?.()
            // Return PAUSE signal to stop TTS playback
            return { state: this.state, signal: 'PAUSE' }
          }
        }
        else {
          this.hitCount = 0
        }
        break

      case VadState.ACTIVE:
        if (isSpeech) {
          this.speechBuffer.push(frame)
        }
        else {
          this.missCount++
          if (this.missCount >= this.requiredMisses) {
            this.state = VadState.INACTIVE
            this.missCount = 0
          }
          else {
            // Keep buffering during miss period
            this.speechBuffer.push(frame)
          }
        }
        break

      case VadState.INACTIVE:
        if (isSpeech) {
          // Speech resumed (back to ACTIVE)
          this.state = VadState.ACTIVE
          this.speechBuffer.push(frame)
        }
        else {
          // Confirmation of speech end
          this.state = VadState.IDLE
          this.listeners.onSpeechEnd?.(this.getFullAudioBuffer())
          this.speechBuffer = []
          return { state: this.state, signal: 'RESUME' }
        }
        break
    }

    // Emit detection event
    this.listeners.onSpeechDetected?.(smoothedProb)

    return { state: this.state }
  }

  /**
   * Calculate speech probability from audio frame
   *
   * Uses energy and zero-crossing rate as heuristics.
   * For accurate results, use Silero VAD model.
   */
  private calculateProbability(frame: Float32Array): number {
    // Calculate energy (RMS)
    let sumSquares = 0
    for (let i = 0; i < frame.length; i++) {
      sumSquares += frame[i] * frame[i]
    }
    const rms = Math.sqrt(sumSquares / frame.length)

    // Calculate zero-crossing rate
    let zeroCrossings = 0
    for (let i = 1; i < frame.length; i++) {
      if ((frame[i] >= 0) !== (frame[i - 1] >= 0)) {
        zeroCrossings++
      }
    }
    const zcr = zeroCrossings / frame.length

    // Combine features (simplified model)
    // Higher energy + moderate ZCR = more likely speech
    const energyScore = Math.min(1, rms * 10)
    const zcrScore = 1 - Math.abs(zcr - 0.1) * 10 // Speech typically has ZCR around 0.1

    return (energyScore + zcrScore) / 2
  }

  /**
   * Calculate decibel level
   */
  private calculateDecibel(frame: Float32Array): number {
    let sumSquares = 0
    for (let i = 0; i < frame.length; i++) {
      sumSquares += frame[i] * frame[i]
    }
    const rms = Math.sqrt(sumSquares / frame.length)
    const db = 20 * Math.log10(rms + 1e-10)
    return Math.max(0, db + 100) // Normalize to positive values
  }

  /**
   * Get full audio buffer including pre-buffer and speech
   */
  private getFullAudioBuffer(): Float32Array {
    const totalLength = this.preBuffer.length * this.frameSize + this.speechBuffer.length * this.frameSize
    const result = new Float32Array(totalLength)

    let offset = 0
    for (const frame of this.preBuffer) {
      result.set(frame, offset)
      offset += frame.length
    }
    for (const frame of this.speechBuffer) {
      result.set(frame, offset)
      offset += frame.length
    }

    return result
  }

  /**
   * Reset VAD state
   */
  reset(): void {
    this.state = VadState.IDLE
    this.hitCount = 0
    this.missCount = 0
    this.preBuffer = []
    this.speechBuffer = []
    this.probabilityHistory = []
  }

  /**
   * Check if VAD is available
   */
  async isAvailable(): Promise<boolean> {
    return true
  }
}

/**
 * VAD Engine Factory
 */
export class VadEngineFactory {
  private static engines = new Map<string, EnergyVadEngine>()

  static create(config?: VadConfig): EnergyVadEngine {
    return new EnergyVadEngine(config)
  }

  static async getDefault(): Promise<EnergyVadEngine> {
    return new EnergyVadEngine()
  }
}

/**
 * VAD stream processor
 *
 * Wraps an audio stream and emits VAD events.
 */
export function createVadStream(
  audioStream: ReadableStream<Float32Array>,
  config?: VadConfig,
): ReadableStream<Float32Array> & { vad: EnergyVadEngine } {
  const vad = new EnergyVadEngine(config)

  const { stream, write, close } = createPushStream<Float32Array>()

  void (async () => {
    const reader = audioStream.getReader()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done)
          break

        const result = vad.processFrame(value)
        write(value)

        // Handle PAUSE/RESUME signals
        if (result.signal === 'PAUSE') {
          // Could emit a special event here
        }
        else if (result.signal === 'RESUME') {
          // Could emit a special event here
        }
      }
      close()
    }
    catch (err) {
      // Error handling
    }
    finally {
      reader.releaseLock()
    }
  })()

  return Object.assign(stream, { vad })
}
