import type { PreTrainedModel } from '@huggingface/transformers'

import type { BaseVAD, BaseVADConfig, VADEventCallback, VADEvents } from '../../libs/audio/vad'

import { AutoModel, Tensor } from '@huggingface/transformers'

/**
 * VAD States matching Open-LLM-VTuber's implementation
 */
enum VADState {
  IDLE = 'IDLE', // Waiting for speech
  ACTIVE = 'ACTIVE', // Speech detected
  INACTIVE = 'INACTIVE', // Speech ending, waiting for confirmation
}

/**
 * Voice Activity Detection processor
 * Implements the same state machine logic as Open-LLM-VTuber's Silero VAD
 */
export class VAD implements BaseVAD {
  private config: BaseVADConfig
  private model: PreTrainedModel | undefined
  private state: Tensor
  private sampleRateTensor: Tensor
  private inferenceChain: Promise<any> = Promise.resolve()
  private eventListeners: Partial<Record<keyof VADEvents, VADEventCallback<any>[]>> = {}
  private isReady: boolean = false

  // State machine properties (matching Open-LLM-VTuber)
  private vadState: VADState = VADState.IDLE
  private probWindow: number[] = []
  private dbWindow: number[] = []
  private preBuffer: Float32Array[] = []
  private hitCount: number = 0
  private missCount: number = 0

  // Audio buffers for collecting speech segments
  private speechProbs: number[] = []
  private speechDbs: number[] = []
  private speechBuffer: Float32Array

  constructor(userConfig: Partial<BaseVADConfig> = {}) {
    // Default configuration matching Open-LLM-VTuber's defaults
    const defaultConfig: BaseVADConfig = {
      sampleRate: 16000,
      speechThreshold: 0.5, // Open-LLM-VTuber uses 0.4
      exitThreshold: 0.25, // speechThreshold * 0.5
      minSilenceDurationMs: 800, // Open-LLM-VTuber: 24 * 32ms = 768ms
      speechPadMs: 80, // ~2.5 frames pre-buffer
      minSpeechDurationMs: 100, // Open-LLM-VTuber: 3 * 32ms = 96ms
      maxBufferDuration: 30,
      newBufferSize: 512, // 512 samples = 32ms at 16kHz
    }

    this.config = { ...defaultConfig, ...userConfig }

    const maxSamples = this.config.maxBufferDuration * this.config.sampleRate
    this.speechBuffer = new Float32Array(maxSamples)
    this.sampleRateTensor = new Tensor('int64', [this.config.sampleRate], [])
    this.state = new Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128])

    // Initialize windows (smoothing_window = 5 matching Open-LLM-VTuber)
    const smoothingWindow = 5
    this.probWindow = new Array(smoothingWindow).fill(0)
    this.dbWindow = new Array(smoothingWindow).fill(0)

    // Pre-buffer: ~20 frames = 640ms at 32ms/frame (Open-LLM-VTuber uses 20)
    this.preBuffer = []
  }

  /**
   * Initialize the VAD model
   */
  public async initialize(): Promise<void> {
    try {
      this.emit('status', { type: 'info', message: 'Loading VAD model...' })

      // Full-precision
      this.model = await AutoModel.from_pretrained('onnx-community/silero-vad', { config: { model_type: 'custom' } as any, dtype: 'fp32' })
      this.isReady = true

      this.emit('status', { type: 'info', message: 'VAD model loaded successfully' })
    }
    catch (error) {
      this.emit('status', { type: 'error', message: `Failed to load VAD model: ${error}` })
      throw error
    }
  }

  /**
   * Calculate decibel level of audio (matching Open-LLM-VTuber)
   * @param audioData - Float32Array of audio samples
   * @returns Decibel level
   */
  private calculateDb(audioData: Float32Array): number {
    // Calculate RMS (Root Mean Square)
    let sumSquares = 0
    for (let i = 0; i < audioData.length; i++) {
      sumSquares += audioData[i] * audioData[i]
    }
    const rms = Math.sqrt(sumSquares / audioData.length)

    // Convert to decibels: 20 * log10(rms)
    // Add small value to avoid log(0)
    if (rms > 0) {
      return 20 * Math.log10(rms + 1e-7)
    }
    return -Infinity
  }

  /**
   * Get smoothed probability and decibel values (matching Open-LLM-VTuber)
   * @param prob - Speech probability from VAD model
   * @param db - Decibel level
   * @returns Smoothed [probability, decibel]
   */
  private getSmoothedValues(prob: number, db: number): [number, number] {
    // Update sliding windows
    this.probWindow.push(prob)
    this.dbWindow.push(db)

    // Calculate averages
    const avgProb = this.probWindow.reduce((a, b) => a + b, 0) / this.probWindow.length
    const avgDb = this.dbWindow.reduce((a, b) => a + b, 0) / this.dbWindow.length

    return [avgProb, avgDb]
  }

  /**
   * Check if both thresholds are met (matching Open-LLM-VTuber)
   * @param smoothedProb - Smoothed speech probability
   * @param smoothedDb - Smoothed decibel level
   * @returns True if both thresholds are met
   */
  private checkThresholds(smoothedProb: number, smoothedDb: number): boolean {
    const dbThreshold = 60 // Open-LLM-VTuber default
    return smoothedProb >= this.config.speechThreshold && smoothedDb >= dbThreshold
  }

  /**
   * Reset speech collection buffers
   */
  private resetSpeechBuffers(): void {
    this.speechProbs = []
    this.speechDbs = []
    this.speechBuffer.fill(0)
    this.preBuffer = []
  }

  /**
   * Add event listener
   */
  public on<K extends keyof VADEvents>(event: K, callback: VADEventCallback<K>): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = []
    }
    this.eventListeners[event]!.push(callback as any)
  }

  /**
   * Remove event listener
   */
  public off<K extends keyof VADEvents>(event: K, callback: VADEventCallback<K>): void {
    if (!this.eventListeners[event])
      return
    this.eventListeners[event] = this.eventListeners[event]!.filter(cb => cb !== callback)
  }

  /**
   * Emit event
   */
  private emit<K extends keyof VADEvents>(event: K, data: VADEvents[K]): void {
    if (!this.eventListeners[event])
      return
    for (const callback of this.eventListeners[event]!) {
      callback(data)
    }
  }

  /**
   * Process audio buffer for speech detection using Open-LLM-VTuber's state machine logic
   */
  public async processAudio(inputBuffer: Float32Array): Promise<void> {
    if (!this.isReady) {
      throw new Error('VAD model is not initialized. Call initialize() first.')
    }

    const windowSize = this.config.newBufferSize // 512 samples = 32ms at 16kHz

    // Process in chunks matching Open-LLM-VTuber's window size
    for (let i = 0; i < inputBuffer.length; i += windowSize) {
      const chunk = inputBuffer.subarray(i, Math.min(i + windowSize, inputBuffer.length))
      if (chunk.length < windowSize)
        break

      // Get VAD probability
      const speechProb = await this.detectSpeech(chunk)

      // Calculate decibel level
      const db = this.calculateDb(chunk)

      // Get smoothed values
      const [smoothedProb, smoothedDb] = this.getSmoothedValues(speechProb, db)

      // Process through state machine
      await this.processStateMachine(chunk, smoothedProb, smoothedDb)
    }
  }

  /**
   * Process the state machine logic (matching Open-LLM-VTuber)
   * @param chunk - Audio chunk (512 samples)
   * @param smoothedProb - Smoothed speech probability
   * @param smoothedDb - Smoothed decibel level
   */
  private async processStateMachine(chunk: Float32Array, smoothedProb: number, smoothedDb: number): Promise<void> {
    const thresholdsMet = this.checkThresholds(smoothedProb, smoothedDb)
    const requiredHits = 3 // Open-LLM-VTuber default
    const requiredMisses = 24 // Open-LLM-VTuber default

    if (this.vadState === VADState.IDLE) {
      // Store in pre-buffer (max 20 frames = ~640ms)
      this.preBuffer.push(chunk.slice())
      if (this.preBuffer.length > 20) {
        this.preBuffer.shift()
      }

      if (thresholdsMet) {
        this.hitCount++
        if (this.hitCount >= requiredHits) {
          // Transition to ACTIVE
          this.vadState = VADState.ACTIVE
          this.hitCount = 0
          this.emit('speech-start', undefined)

          // Start collecting speech data
          this.addToSpeechBuffer(chunk, smoothedProb, smoothedDb)
        }
      }
      else {
        this.hitCount = 0
      }
    }
    else if (this.vadState === VADState.ACTIVE) {
      this.addToSpeechBuffer(chunk, smoothedProb, smoothedDb)

      if (thresholdsMet) {
        this.missCount = 0
      }
      else {
        this.missCount++
        if (this.missCount >= requiredMisses) {
          // Transition to INACTIVE
          this.vadState = VADState.INACTIVE
          this.missCount = 0
        }
      }
    }
    else if (this.vadState === VADState.INACTIVE) {
      this.addToSpeechBuffer(chunk, smoothedProb, smoothedDb)

      if (thresholdsMet) {
        this.hitCount++
        if (this.hitCount >= requiredHits) {
          // Back to ACTIVE
          this.vadState = VADState.ACTIVE
          this.hitCount = 0
          this.missCount = 0
        }
      }
      else {
        this.hitCount = 0
        this.missCount++
        if (this.missCount >= requiredMisses) {
          // Back to IDLE - emit the complete speech segment
          this.vadState = VADState.IDLE
          this.missCount = 0

          // Only emit if we have enough data (>30 frames ~ 1 second)
          if (this.speechProbs.length > 30) {
            await this.emitSpeechSegment()
          }

          this.resetSpeechBuffers()
          this.preBuffer = []
        }
      }
    }
  }

  /**
   * Add audio chunk to speech buffer
   */
  private addToSpeechBuffer(chunk: Float32Array, prob: number, db: number): void {
    this.speechProbs.push(prob)
    this.speechDbs.push(db)

    // Add to speech buffer
    const currentLength = this.speechProbs.length * this.config.newBufferSize
    if (currentLength + chunk.length <= this.speechBuffer.length) {
      this.speechBuffer.set(chunk, this.speechProbs.length * this.config.newBufferSize)
    }
  }

  /**
   * Emit the complete speech segment
   */
  private async emitSpeechSegment(): Promise<void> {
    // Combine pre-buffer and speech buffer
    const preBufferLength = this.preBuffer.length * this.config.newBufferSize
    const speechLength = this.speechProbs.length * this.config.newBufferSize
    const totalLength = preBufferLength + speechLength

    const combinedBuffer = new Float32Array(totalLength)

    // Copy pre-buffer
    let offset = 0
    for (const chunk of this.preBuffer) {
      combinedBuffer.set(chunk, offset)
      offset += chunk.length
    }

    // Copy speech buffer
    combinedBuffer.set(this.speechBuffer.subarray(0, speechLength), offset)

    // Calculate duration
    const durationMs = (totalLength / this.config.sampleRate) * 1000

    this.emit('speech-end', undefined)
    this.emit('speech-ready', {
      buffer: combinedBuffer,
      duration: durationMs,
    })
  }

  /**
   * Detect speech in an audio buffer
   */
  private async detectSpeech(buffer: Float32Array): Promise<number> {
    const input = new Tensor('float32', buffer, [1, buffer.length])

    const { stateN, output } = await (this.inferenceChain = this.inferenceChain.then(() =>
      this.model?.({
        input,
        sr: this.sampleRateTensor,
        state: this.state,
      }),
    ))

    // Update the state
    this.state = stateN
    // Get the speech probability
    const speechProb = output.data[0]

    this.emit('debug', { message: 'VAD score', data: { probability: speechProb } })

    return speechProb
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<BaseVADConfig>): void {
    this.config = { ...this.config, ...newConfig }

    // If buffer size changed, create new buffers
    if (newConfig.maxBufferDuration || newConfig.sampleRate) {
      const maxSamples = this.config.maxBufferDuration * this.config.sampleRate
      this.speechBuffer = new Float32Array(maxSamples)
    }

    // Update sample rate tensor if needed
    if (newConfig.sampleRate) {
      this.sampleRateTensor = new Tensor('int64', [this.config.sampleRate], [])
    }
  }
}

/**
 * Create a VAD processor with the given configuration
 */
export async function createVAD(config?: Partial<BaseVADConfig>): Promise<VAD> {
  const vad = new VAD(config)
  await vad.initialize()
  return vad
}
