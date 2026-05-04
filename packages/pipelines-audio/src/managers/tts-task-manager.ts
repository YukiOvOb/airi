/**
 * TTS Task Manager with Ordered Delivery
 *
 * This module manages concurrent TTS synthesis tasks while ensuring
 * audio is delivered to the frontend in the correct order.
 *
 * Similar to Open-LLM-VTuber's conversations/tts_manager.py
 *
 * Key features:
 * - Concurrent TTS synthesis (multiple sentences at once)
 * - Sequence numbering for order preservation
 * - Buffered delivery (wait for missing sentences)
 * - Silent payloads for filtered content
 * - Automatic cleanup of audio files
 */

import type { Actions, DisplayText } from '../types'

/**
 * Audio payload for TTS result
 */
export interface TtsAudioPayload {
  /** Sequence number (for ordering) */
  sequence: number
  /** Display text for subtitles */
  displayText: DisplayText | null
  /** Live2D actions */
  actions: Actions | null
  /** Audio data (null for silent payload) */
  audioData: Float32Array | null
  /** Sample rate */
  sampleRate: number
  /** Volume data for lip-sync */
  volumes: number[] | null
}

/**
 * Queued TTS task
 */
interface QueuedTask {
  sequence: number
  displayText: DisplayText | null
  actions: Actions | null
  text: string
  resolve: (payload: TtsAudioPayload) => void
  reject: (error: Error) => void
}

/**
 * TTS task manager options
 */
export interface TtsTaskManagerOptions {
  /** Maximum concurrent TTS tasks */
  maxConcurrent?: number
  /** Default sample rate for audio */
  sampleRate?: number
}

/**
 * TTS Task Manager
 *
 * Manages concurrent TTS synthesis with ordered delivery.
 */
export class TtsTaskManager {
  private tasks: QueuedTask[] = []
  private pendingResults = new Map<number, TtsAudioPayload>()
  private nextSequence = 0
  private nextToDeliver = 0
  private activeCount = 0
  private closed = false

  private readonly maxConcurrent: number
  private readonly sampleRate: number

  // TTS engine function
  private ttsEngine: (text: string, signal?: AbortSignal) => Promise<{
    audio: Float32Array
    volumes: number[]
  }>

  constructor(
    ttsEngine: (text: string, signal?: AbortSignal) => Promise<{
      audio: Float32Array
      volumes: number[]
    }>,
    options?: TtsTaskManagerOptions,
  ) {
    this.ttsEngine = ttsEngine
    this.maxConcurrent = options?.maxConcurrent ?? 4
    this.sampleRate = options?.sampleRate ?? 24000
  }

  /**
   * Queue a TTS task
   *
   * @param text - Text to synthesize (may be empty for silent payload)
   * @param displayText - Text to display
   * @param actions - Live2D actions
   * @returns Promise that resolves when audio is ready for delivery
   */
  async queue(
    text: string,
    displayText: DisplayText | null,
    actions: Actions | null,
  ): Promise<TtsAudioPayload> {
    if (this.closed) {
      throw new Error('TTS task manager is closed')
    }

    const sequence = this.nextSequence++
    const task: QueuedTask = {
      sequence,
      displayText,
      actions,
      text,
      resolve: () => {},
      reject: () => {},
    }

    // Create promise for this task
    const promise = new Promise<TtsAudioPayload>((resolve, reject) => {
      task.resolve = resolve
      task.reject = reject
    })

    this.tasks.push(task)
    this.processQueue()

    return promise
  }

  /**
   * Process the task queue
   */
  private processQueue(): void {
    // Start tasks up to max concurrent
    while (this.activeCount < this.maxConcurrent && this.tasks.length > 0) {
      const task = this.tasks.shift()!
      this.activeCount++

      // Handle empty text (silent payload)
      if (!task.text || task.text.trim().length === 0) {
        const payload: TtsAudioPayload = {
          sequence: task.sequence,
          displayText: task.displayText,
          actions: task.actions,
          audioData: null,
          sampleRate: this.sampleRate,
          volumes: [],
        }
        this.activeCount--
        this.taskComplete(task.sequence, payload)
        continue
      }

      // Start TTS synthesis
      this.ttsEngine(task.text)
        .then((result) => {
          const payload: TtsAudioPayload = {
            sequence: task.sequence,
            displayText: task.displayText,
            actions: task.actions,
            audioData: result.audio,
            sampleRate: this.sampleRate,
            volumes: result.volumes,
          }
          this.activeCount--
          this.taskComplete(task.sequence, payload)
        })
        .catch((error) => {
          this.activeCount--
          // Return silent payload on error
          const payload: TtsAudioPayload = {
            sequence: task.sequence,
            displayText: task.displayText,
            actions: task.actions,
            audioData: null,
            sampleRate: this.sampleRate,
            volumes: [],
          }
          this.taskComplete(task.sequence, payload)
          task.reject(error as Error)
        })
    }
  }

  /**
   * Handle task completion
   */
  private taskComplete(sequence: number, payload: TtsAudioPayload): void {
    this.pendingResults.set(sequence, payload)

    // Deliver as many as possible in order
    while (this.pendingResults.has(this.nextToDeliver)) {
      const result = this.pendingResults.get(this.nextToDeliver)!

      // Find and resolve the corresponding task
      const task = this.tasks.find(t => t.sequence === this.nextToDeliver)
      if (task) {
        task.resolve(result)
      }

      this.pendingResults.delete(this.nextToDeliver)
      this.nextToDeliver++
    }

    // Continue processing queue
    this.processQueue()
  }

  /**
   * Get next payload ready for delivery
   *
   * @returns Payload if ready, null otherwise
   */
  getNextPayload(): TtsAudioPayload | null {
    const payload = this.pendingResults.get(this.nextToDeliver)
    if (payload) {
      this.pendingResults.delete(this.nextToDeliver)
      this.nextToDeliver++
    }
    return payload ?? null
  }

  /**
   * Check if there are more payloads to deliver
   */
  hasMorePayloads(): boolean {
    return this.pendingResults.has(this.nextToDeliver) || this.tasks.length > 0 || this.activeCount > 0
  }

  /**
   * Cancel all pending tasks
   */
  cancelAll(): void {
    for (const task of this.tasks) {
      task.reject(new Error('Task cancelled'))
    }
    this.tasks = []
    this.pendingResults.clear()
    this.activeCount = 0
  }

  /**
   * Reset the manager state
   */
  reset(): void {
    this.cancelAll()
    this.nextSequence = 0
    this.nextToDeliver = 0
    this.closed = false
  }

  /**
   * Close the manager (no new tasks accepted)
   */
  close(): void {
    this.closed = true
    this.cancelAll()
  }

  /**
   * Get current state
   */
  getState(): {
    pending: number
    active: number
    nextSequence: number
    nextToDeliver: number
  } {
    return {
      pending: this.tasks.length,
      active: this.activeCount,
      nextSequence: this.nextSequence,
      nextToDeliver: this.nextToDeliver,
    }
  }
}

/**
 * Create a streaming TTS manager that processes sentences
 *
 * This combines the task manager with a sentence stream.
 */
export async function* createStreamingTtsManager(
  sentences: AsyncIterable<{ text: string, displayText: DisplayText | null, actions: Actions | null }>,
  ttsEngine: (text: string, signal?: AbortSignal) => Promise<{
    audio: Float32Array
    volumes: number[]
  }>,
  options?: TtsTaskManagerOptions,
): AsyncGenerator<TtsAudioPayload, void, unknown> {
  const manager = new TtsTaskManager(ttsEngine, options)

  try {
    // Queue all sentences
    const promises: Promise<TtsAudioPayload>[] = []

    for await (const sentence of sentences) {
      promises.push(manager.queue(sentence.text, sentence.displayText, sentence.actions))
    }

    // Deliver in order
    for (const promise of promises) {
      const payload = await promise
      yield payload
    }
  }
  finally {
    manager.close()
  }
}
