import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'

/**
 * Wraps Capacitor Filesystem for storing binary/large files (Live2D models,
 * audio clips, exported chat logs, images) in the app's native sandbox.
 *
 * - iOS: Library/NoCloud/  (persistent, not iCloud-backed, not cleared by OS)
 * - Android: app-specific internal storage (no permissions required)
 *
 * Usage:
 *   const fs = new CapacitorFileStorage()
 *   await fs.write('models/haru.zip', blob)
 *   const blob = await fs.read('models/haru.zip')
 */
export class CapacitorFileStorage {
  // NOTICE: Directory.Library is not backed up to iCloud and survives app updates.
  // Directory.Documents would be iCloud-backed (desirable for chat exports only).
  private readonly dir = Directory.Library

  async write(path: string, data: Blob | string): Promise<void> {
    if (typeof data === 'string') {
      await Filesystem.writeFile({
        path,
        data,
        directory: this.dir,
        encoding: Encoding.UTF8,
        recursive: true,
      })
    }
    else {
      // Convert Blob → base64 for Capacitor Filesystem
      const base64 = await blobToBase64(data)
      await Filesystem.writeFile({
        path,
        data: base64,
        directory: this.dir,
        recursive: true,
      })
    }
  }

  async readText(path: string): Promise<string> {
    const result = await Filesystem.readFile({
      path,
      directory: this.dir,
      encoding: Encoding.UTF8,
    })
    return result.data as string
  }

  async readBlob(path: string): Promise<Blob> {
    const result = await Filesystem.readFile({ path, directory: this.dir })
    return base64ToBlob(result.data as string)
  }

  async delete(path: string): Promise<void> {
    await Filesystem.deleteFile({ path, directory: this.dir })
  }

  async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat({ path, directory: this.dir })
      return true
    }
    catch {
      return false
    }
  }

  async list(path: string): Promise<string[]> {
    try {
      const result = await Filesystem.readdir({ path, directory: this.dir })
      return result.files.map(f => f.name)
    }
    catch {
      return []
    }
  }

  /** Return a web-accessible URL for a stored file (for <img src> / Audio). */
  async getUrl(path: string): Promise<string> {
    const result = await Filesystem.getUri({ path, directory: this.dir })
    return result.uri
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Strip the data URL prefix (data:...;base64,)
      resolve(result.split(',')[1] ?? result)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(base64: string, mimeType = 'application/octet-stream'): Blob {
  const byteChars = atob(base64)
  const byteArrays: Uint8Array[] = []
  for (let offset = 0; offset < byteChars.length; offset += 512) {
    const slice = byteChars.slice(offset, offset + 512)
    const byteNums = Array.from(slice).map(c => c.charCodeAt(0))
    byteArrays.push(new Uint8Array(byteNums))
  }
  return new Blob(byteArrays, { type: mimeType })
}
