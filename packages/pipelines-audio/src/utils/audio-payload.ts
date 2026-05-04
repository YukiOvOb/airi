/**
 * Audio Payload Preparation for Lip-Sync
 *
 * This module prepares audio data for playback with lip-sync information.
 * It calculates volume envelopes for each time slice to drive Live2D mouth animations.
 *
 * Key insight: Instead of using complex phoneme alignment, we use RMS volume
 * which is CPU-cheap, works with all TTS engines, and is naturally synchronized.
 *
 * Based on Open-LLM-VTuber's stream_audio.py implementation.
 */

/**
 * Audio chunk with volume information
 */
export interface AudioChunk {
  /** Base64-encoded audio data (WAV format) */
  audio: string | null
  /** Normalized volume values (0-1) for each time slice */
  volumes: number[]
  /** Length of each time slice in milliseconds */
  sliceLength: number
}

/**
 * Display text information
 */
export interface DisplayText {
  /** Text to display as subtitle */
  text: string
  /** Speaker name (optional) */
  name?: string
  /** Avatar URL (optional) */
  avatar?: string
}

/**
 * Actions for Live2D model
 */
export interface Actions {
  /** Expression indices or names */
  expressions?: (string | number)[]
  /** Picture filenames to display */
  pictures?: string[]
  /** Sound effects to play */
  sounds?: string[]
}

/**
 * Complete audio payload for frontend
 */
export interface AudioPayload {
  type: 'audio'
  /** Audio data with volume information */
  audio: AudioChunk | null
  /** Text to display in UI */
  displayText: DisplayText | null
  /** Live2D actions */
  actions: Actions | null
  /** Whether this is forwarded audio */
  forwarded?: boolean
}

/**
 * Options for audio payload preparation
 */
export interface PrepareAudioPayloadOptions {
  /** Length of each time slice in milliseconds (default: 20ms) */
  chunkLengthMs?: number
  /** Display text for subtitles */
  displayText?: DisplayText | string | null
  /** Live2D actions */
  actions?: Actions | null
  /** Whether this is forwarded audio */
  forwarded?: boolean
}

/**
 * Decode audio buffer and calculate volume envelopes
 *
 * @param audioBuffer - Raw audio data (PCM or WAV)
 * @param sampleRate - Target sample rate in Hz
 * @param channels - Number of audio channels (1 = mono, 2 = stereo)
 * @returns Float32Array of audio samples normalized to [-1, 1]
 */
export function decodeAudioBuffer(
  audioBuffer: ArrayBuffer,
  sampleRate: number,
  channels: number = 1,
): Float32Array {
  const dataView = new DataView(audioBuffer)
  const samples = new Float32Array(audioBuffer.byteLength / 2)

  // Assume 16-bit PCM for simplicity
  // In production, you'd use Web Audio API's decodeAudioData
  for (let i = 0; i < samples.length; i++) {
    const sample = dataView.getInt16(i * 2, true) // little-endian
    samples[i] = sample / 32768 // normalize to [-1, 1]
  }

  return samples
}

/**
 * Calculate RMS volume for audio chunks
 *
 * @param samples - Audio samples normalized to [-1, 1]
 * @param sampleRate - Sample rate in Hz
 * @param chunkLengthMs - Length of each chunk in milliseconds
 * @returns Array of normalized volumes (0-1) for each chunk
 */
export function calculateVolumeEnvelopes(
  samples: Float32Array,
  sampleRate: number,
  chunkLengthMs: number = 20,
): number[] {
  const samplesPerChunk = Math.floor((sampleRate * chunkLengthMs) / 1000)
  const numChunks = Math.ceil(samples.length / samplesPerChunk)
  const volumes: number[] = []

  for (let i = 0; i < numChunks; i++) {
    const start = i * samplesPerChunk
    const end = Math.min(start + samplesPerChunk, samples.length)
    const chunk = samples.slice(start, end)

    // Calculate RMS (Root Mean Square)
    let sumSquares = 0
    for (let j = 0; j < chunk.length; j++) {
      sumSquares += chunk[j] * chunk[j]
    }
    const rms = Math.sqrt(sumSquares / chunk.length)
    volumes.push(rms)
  }

  // Normalize volumes to [0, 1]
  const maxVolume = Math.max(...volumes, 0.001) // Avoid division by zero
  return volumes.map(v => v / maxVolume)
}

/**
 * Convert audio buffer to base64-encoded WAV
 *
 * @param audioBuffer - Raw audio samples
 * @param sampleRate - Sample rate in Hz
 * @returns Base64-encoded WAV string
 */
export function bufferToBase64Wav(audioBuffer: Float32Array, sampleRate: number = 24000): string {
  // Convert float samples to 16-bit PCM
  const pcmData = new Int16Array(audioBuffer.length)
  for (let i = 0; i < audioBuffer.length; i++) {
    const sample = Math.max(-1, Math.min(1, audioBuffer[i]))
    pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
  }

  // Create WAV header
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * bitsPerSample / 8
  const blockAlign = numChannels * bitsPerSample / 8
  const dataSize = pcmData.length * 2
  const bufferSize = 44 + dataSize

  const wavBuffer = new ArrayBuffer(bufferSize)
  const view = new DataView(wavBuffer)

  // RIFF chunk
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // audio format (PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // Write PCM data
  const dataView = new Uint8Array(wavBuffer)
  const pcmView = new Uint8Array(pcmData.buffer)
  dataView.set(pcmView, 44)

  // Convert to base64
  const bytes = new Uint8Array(wavBuffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

/**
 * Prepare audio payload for WebSocket transmission to frontend
 *
 * This is the main function that creates the complete payload with:
 * - Base64-encoded WAV audio
 * - Volume envelopes for lip-sync
 * - Display text for subtitles
 * - Actions for Live2D expressions
 *
 * @param audioData - Audio buffer or base64 string (null for silent payload)
 * @param sampleRate - Sample rate in Hz (if audioData is buffer)
 * @param options - Additional payload options
 * @returns Complete audio payload ready for WebSocket transmission
 */
export function prepareAudioPayload(
  audioData: ArrayBuffer | Float32Array | string | null,
  sampleRate: number = 24000,
  options?: PrepareAudioPayloadOptions,
): AudioPayload {
  const {
    chunkLengthMs = 20,
    displayText: displayTextInput = null,
    actions = null,
    forwarded = false,
  } = options ?? {}

  // Normalize display text
  const displayText: DisplayText | null = displayTextInput
    ? typeof displayTextInput === 'string'
      ? { text: displayTextInput }
      : displayTextInput
    : null

  // Handle silent payload (no audio)
  if (!audioData) {
    return {
      type: 'audio',
      audio: null,
      displayText,
      actions,
      forwarded,
    }
  }

  // Decode audio if needed
  let audioBuffer: Float32Array
  if (typeof audioData === 'string') {
    // Assume base64 string is already processed
    // Just return with empty volumes (caller should provide them)
    return {
      type: 'audio',
      audio: {
        audio: audioData,
        volumes: [],
        sliceLength: chunkLengthMs,
      },
      displayText,
      actions,
      forwarded,
    }
  }
  else if (audioData instanceof Float32Array) {
    audioBuffer = audioData
  }
  else {
    audioBuffer = decodeAudioBuffer(audioData as ArrayBuffer, sampleRate)
  }

  // Calculate volume envelopes
  const volumes = calculateVolumeEnvelopes(audioBuffer, sampleRate, chunkLengthMs)

  // Convert to base64 WAV
  const base64Audio = bufferToBase64Wav(audioBuffer, sampleRate)

  return {
    type: 'audio',
    audio: {
      audio: base64Audio,
      volumes,
      sliceLength: chunkLengthMs,
    },
    displayText,
    actions,
    forwarded,
  }
}

/**
 * Create a silent audio payload (for display-only content like think tags)
 *
 * @param displayText - Text to display
 * @param actions - Live2D actions
 * @returns Silent audio payload
 */
export function createSilentPayload(
  displayText: DisplayText | string | null,
  actions?: Actions | null,
): AudioPayload {
  return prepareAudioPayload(null, 24000, {
    displayText,
    actions,
    forwarded: false,
  })
}

/**
 * Extract volumes from an audio payload
 *
 * Utility function for frontend lip-sync animation.
 *
 * @param payload - Audio payload
 * @returns Array of normalized volumes
 */
export function extractVolumes(payload: AudioPayload): number[] {
  return payload.audio?.volumes ?? []
}

/**
 * Get audio duration from payload
 *
 * @param payload - Audio payload
 * @returns Duration in seconds
 */
export function getAudioDuration(payload: AudioPayload): number {
  if (!payload.audio || !payload.audio.volumes.length)
    return 0
  return (payload.audio.volumes.length * payload.audio.sliceLength) / 1000
}
