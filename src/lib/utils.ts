export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00'
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function formatTimeWithDecimal(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0.0s'
  const sign = seconds < 0 ? '-' : '+'
  const abs = Math.abs(seconds)
  return `${sign}${abs.toFixed(1)}s`
}

export function parseYouTubeId(url: string): string | null {
  const match = url.match(/^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/)
  return match && match[2]?.length === 11 ? match[2] : null
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function throttle<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let last = 0
  return ((...args: unknown[]) => {
    const now = Date.now()
    if (now - last >= ms) {
      last = now
      fn(...args)
    }
  }) as T
}

export function srtToVtt(srt: string): string {
  const lines = ['WEBVTT', '']
  for (const line of srt.split('\n')) {
    if (line.includes('-->')) {
      lines.push(line.replace(/,/g, '.'))
    } else if (line.trim() && !/^\d+$/.test(line.trim())) {
      lines.push(line.trim())
    } else if (!line.trim()) {
      lines.push('')
    }
  }
  return lines.join('\n')
}

export async function checkCodecSupport(file: File): Promise<{ supported: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      resolve({ supported: true })
    }
    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      const reason = video.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        ? 'Video codec not supported. Try converting to H.264 or use Edge browser.'
        : 'Failed to load video'
      resolve({ supported: false, reason })
    }
    video.src = URL.createObjectURL(file)
  })
}

export function parseDelayFromFilename(filename: string): number | null {
  const tokens = filename.split('.')
  const match = tokens.find(t => t.startsWith('dt') && !isNaN(Number(t.slice(2))))
  return match ? Number(match.slice(2)) / 10 : null
}

