import type { BaseVAD } from '../../libs/audio/vad'

import { createVAD, createVADStates } from '../../workers/vad'

export interface InterruptManagerOptions {
  /**
   * VAD speech threshold (0-1)
   * Open-LLM-VTuber default: 0.4, we use 0.5 for better noise immunity
   * @default 0.5
   */
  speechThreshold?: number

  /**
   * Minimum silence duration in ms to consider speech ended
   * Open-LLM-VTuber default: 800ms (24 * 32ms)
   * @default 800
   */
  minSilenceDurationMs?: number

  /**
   * Minimum speech duration in ms to consider valid speech
   * Open-LLM-VTuber default: 100ms (3 * 32ms)
   * @default 100
   */
  minSpeechDurationMs?: number

  /**
   * Callback when user speech is detected (should trigger interrupt)
   */
  onSpeechDetected: () => void

  /**
   * Callback when VAD encounters errors
   */
  onError?: (error: string) => void
}

export interface InterruptManagerHandle {
  /**
   * Start monitoring for speech interruptions
   * @param stream MediaStream to use for microphone input
   */
  start: (stream: MediaStream) => Promise<void>

  /**
   * Stop monitoring for speech interruptions
   */
  stop: () => void

  /**
   * Check if currently monitoring
   */
  isMonitoring: () => boolean

  /**
   * Clean up resources
   */
  dispose: () => void
}

export function createInterruptManager(
  vadWorkletUrl: string,
  options: InterruptManagerOptions,
): InterruptManagerHandle {
  const {
    speechThreshold = 0.5, // Open-LLM-VTuber uses 0.4
    minSilenceDurationMs = 800, // Open-LLM-VTuber: 24 * 32ms = 768ms
    minSpeechDurationMs = 100, // Open-LLM-VTuber: 3 * 32ms = 96ms
    onSpeechDetected,
    onError,
  } = options

  let vad: BaseVAD | null = null
  let vadManager: ReturnType<typeof createVADStates> | null = null
  let isMonitoring = false
  let isInitialized = false

  /**
   * Initialize the VAD system
   */
  async function initialize(): Promise<void> {
    if (isInitialized)
      return

    try {
      // Create VAD instance with Open-LLM-VTuber compatible settings
      vad = await createVAD({
        sampleRate: 16000,
        speechThreshold,
        exitThreshold: speechThreshold * 0.5,
        minSilenceDurationMs,
        speechPadMs: 80,
        minSpeechDurationMs,
        maxBufferDuration: 30,
        newBufferSize: 512, // 512 samples = 32ms at 16kHz
      })

      // Set up event handlers
      vad.on('speech-start', () => {
        // When speech is detected, trigger the interrupt callback
        if (isMonitoring) {
          onSpeechDetected()
        }
      })

      vad.on('status', ({ type, message }) => {
        if (type === 'error') {
          onError?.(message)
        }
      })

      // Create VAD audio manager
      vadManager = createVADStates(vad, vadWorkletUrl, {
        minChunkSize: 512,
        audioContextOptions: {
          sampleRate: 16000,
          latencyHint: 'interactive',
        },
      })

      // Initialize the audio manager
      await vadManager.initialize()
      isInitialized = true
    }
    catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      onError?.(`Failed to initialize interrupt manager: ${errorMsg}`)
      throw error
    }
  }

  /**
   * Start monitoring for speech interruptions
   */
  async function start(stream: MediaStream): Promise<void> {
    if (isMonitoring)
      return

    try {
      // Initialize if not already done
      if (!isInitialized) {
        await initialize()
      }

      if (!vadManager) {
        throw new Error('VAD manager not initialized')
      }

      // Start VAD with the microphone stream
      await vadManager.start(stream)
      isMonitoring = true
    }
    catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      onError?.(`Failed to start interrupt monitoring: ${errorMsg}`)
      throw error
    }
  }

  /**
   * Stop monitoring for speech interruptions
   */
  function stop(): void {
    if (!isMonitoring)
      return

    isMonitoring = false

    // Stop VAD but don't dispose - we may start again
    vadManager?.stop()
  }

  /**
   * Check if currently monitoring
   */
  function checkMonitoring(): boolean {
    return isMonitoring
  }

  /**
   * Clean up all resources
   */
  function dispose(): void {
    stop()
    vadManager?.dispose()
    vadManager = null
    vad = null
    isInitialized = false
  }

  return {
    start,
    stop,
    isMonitoring: checkMonitoring,
    dispose,
  }
}
