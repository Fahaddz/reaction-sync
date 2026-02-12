import type { Player, PlayState } from './player.ts'
import { showToast } from './ui/toast.ts'

declare global {
  interface Window {
    YT?: typeof YT
    onYouTubeIframeAPIReady?: () => void
  }
}

declare namespace YT {
  const PlayerState: {
    UNSTARTED: -1
    ENDED: 0
    PLAYING: 1
    PAUSED: 2
    BUFFERING: 3
    CUED: 5
  }
  class Player {
    constructor(elementId: string, options: PlayerOptions)
    playVideo(): void
    pauseVideo(): void
    seekTo(seconds: number, allowSeekAhead: boolean): void
    getCurrentTime(): number
    getDuration(): number
    getPlayerState(): number
    setVolume(volume: number): void
    getVolume(): number
    setPlaybackRate(rate: number): void
    getAvailableQualityLevels(): string[]
    getPlaybackQuality(): string
    setPlaybackQuality(quality: string): void
    getIframe(): HTMLIFrameElement
    destroy(): void
    getVideoData(): { video_id: string }
  }
  interface PlayerOptions {
    videoId: string
    width?: string | number
    height?: string | number
    playerVars?: PlayerVars
    events?: PlayerEvents
  }
  interface PlayerVars {
    controls?: number
    disablekb?: number
    modestbranding?: number
    rel?: number
    enablejsapi?: number
    playsinline?: number
    iv_load_policy?: number
    autoplay?: number
    origin?: string
  }
  interface PlayerEvents {
    onReady?: (event: { target: Player }) => void
    onStateChange?: (event: { target: Player; data: number }) => void
    onError?: (event: { target: Player; data: number }) => void
    onPlaybackQualityChange?: (event: { target: Player; data: string }) => void
  }
}

const YT_API_SRC = 'https://www.youtube.com/iframe_api'
const API_LOAD_TIMEOUT_MS = 12000
const API_LOAD_MAX_ATTEMPTS = 3

let apiLoaded = false
let apiLoadPromise: Promise<void> | null = null

function isYouTubeApiReady(): boolean {
  return Boolean(window.YT && typeof window.YT.Player === 'function')
}

function removeYouTubeApiScripts(): void {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src*="youtube.com/iframe_api"]')
  scripts.forEach(script => script.remove())
}

function loadYouTubeAPIAttempt(attempt: number): Promise<void> {
  if (isYouTubeApiReady()) {
    apiLoaded = true
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const previousCallback = window.onYouTubeIframeAPIReady
    const cacheBust = attempt > 0 ? `?cb=${Date.now()}` : ''
    const script = document.createElement('script')
    const complete = (ok: boolean, error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      clearInterval(pollId)
      script.onerror = null
      if (window.onYouTubeIframeAPIReady === onReady) {
        window.onYouTubeIframeAPIReady = previousCallback
      }
      if (ok) resolve()
      else reject(error || new Error('YouTube API failed to load'))
    }
    const onReady = () => {
      try {
        previousCallback?.()
      } catch {}
      complete(true)
    }

    window.onYouTubeIframeAPIReady = onReady
    script.src = `${YT_API_SRC}${cacheBust}`
    script.async = true
    script.onerror = () => {
      complete(false, new Error('Failed to load YouTube iframe API script'))
    }
    document.head.appendChild(script)

    const pollId = setInterval(() => {
      if (isYouTubeApiReady()) complete(true)
    }, 100)

    const timeoutId = setTimeout(() => {
      complete(false, new Error('Timed out while loading YouTube iframe API'))
    }, API_LOAD_TIMEOUT_MS)
  })
}

async function loadYouTubeAPI(): Promise<void> {
  if (isYouTubeApiReady()) {
    apiLoaded = true
    return
  }
  if (apiLoaded) return
  if (apiLoadPromise) return apiLoadPromise

  apiLoadPromise = (async () => {
    let lastError: Error | null = null
    for (let attempt = 0; attempt < API_LOAD_MAX_ATTEMPTS; attempt++) {
      try {
        removeYouTubeApiScripts()
        await loadYouTubeAPIAttempt(attempt)
        apiLoaded = true
        return
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown YouTube API load error')
      }
    }
    throw lastError || new Error('Failed to initialize YouTube API')
  })()

  try {
    await apiLoadPromise
  } finally {
    apiLoadPromise = null
  }
}

const QUALITY_ORDER = ['highres', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny']
const QUALITY_LABELS: Record<string, string> = {
  highres: '4K (2160p)', hd2160: '4K (2160p)', hd1440: 'QHD (1440p)',
  hd1080: 'Full HD (1080p)', hd720: 'HD (720p)', large: '480p',
  medium: '360p', small: '240p', tiny: '144p', auto: 'Auto', default: 'Auto'
}

export class YouTubePlayer implements Player {
  private player: YT.Player | null = null
  private containerId: string
  private stateCallback: ((state: PlayState) => void) | null = null
  private ready = false
  private lastTime = 0
  private retryCount = 0
  private pendingInit: { resolve: () => void; reject: (reason?: unknown) => void } | null = null
  private onQualityChangeCallback: ((quality: string) => void) | null = null
  private pendingPlay = false
  private initTimeoutId: ReturnType<typeof setTimeout> | null = null

  constructor(containerId: string) {
    this.containerId = containerId
  }

  async initialize(videoId: string, startSeconds?: number): Promise<void> {
    await loadYouTubeAPI()
    if (this.pendingInit) {
      this.pendingInit.reject(new Error('YouTube initialization interrupted by a newer request'))
      this.pendingInit = null
    }
    return new Promise((resolve, reject) => {
      this.pendingInit = { resolve, reject }
      this.createPlayer(videoId, startSeconds)
    })
  }

  private createPlayer(videoId: string, startSeconds?: number): void {
    const startAt = startSeconds != null && startSeconds > 0 ? startSeconds : undefined
    if (this.player) {
      try {
        this.player.destroy()
      } catch {}
      this.player = null
    }
    this.ready = false
    if (!window.YT?.Player) {
      this.pendingInit?.reject(new Error('YouTube API is not ready'))
      this.pendingInit = null
      return
    }

    this.player = new window.YT.Player(this.containerId, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        controls: 0, disablekb: 1, modestbranding: 1, rel: 0,
        enablejsapi: 1, playsinline: 1, iv_load_policy: 3,
        autoplay: 0,
        origin: window.location.origin
      },
      events: {
        onReady: (e) => {
          this.ready = true
          this.retryCount = 0
          e.target.pauseVideo()
          if (startAt != null) {
            e.target.seekTo(startAt, true)
            this.lastTime = startAt
          }
          this.initTimeoutId = setTimeout(() => {
            this.setHighestQuality()
            if (!this.pendingPlay) {
              e.target.pauseVideo()
            }
            this.initTimeoutId = null
          }, 500)
          this.pendingInit?.resolve()
          this.pendingInit = null
        },
        onStateChange: (e) => this.handleStateChange(e.data),
        onError: (e) => this.handleError(e.data, videoId, startAt),
        onPlaybackQualityChange: (e) => this.onQualityChangeCallback?.(e.data)
      }
    })
  }

  private handleStateChange(state: number): void {
    if (state === window.YT.PlayerState.PLAYING) {
      this.pendingPlay = false
      this.stateCallback?.('playing')
    } else if (state === window.YT.PlayerState.PAUSED) {
      this.stateCallback?.('paused')
    } else if (state === window.YT.PlayerState.BUFFERING) {
      this.stateCallback?.('buffering')
    } else if (state === window.YT.PlayerState.ENDED) {
      this.stateCallback?.('ended')
    }
  }

  private handleError(errorCode: number, videoId: string, startAt?: number): void {
    const errors: Record<number, string> = {
      2: 'Invalid URL', 5: 'HTML5 error', 100: 'Not found', 101: 'Embedding disabled', 150: 'Embedding disabled'
    }
    const message = errors[errorCode] || `YouTube error ${errorCode}`
    if (this.retryCount < 3) {
      this.retryCount++
      setTimeout(() => {
        const retryStart = this.lastTime > 0 ? this.lastTime : startAt
        this.createPlayer(videoId, retryStart)
      }, 2000 * this.retryCount)
    } else {
      this.pendingInit?.reject(new Error(message))
      this.pendingInit = null
      showToast(`YouTube failed: ${message}`, 'error', 5000)
    }
  }

  private setHighestQuality(): void {
    if (!this.player) return
    const available = this.player.getAvailableQualityLevels()
    for (const q of QUALITY_ORDER) {
      if (available.includes(q)) {
        this.player.setPlaybackQuality(q)
        break
      }
    }
  }

  play(): void {
    if (!this.player || !this.ready) return
    this.pendingPlay = true
    if (this.initTimeoutId) {
      clearTimeout(this.initTimeoutId)
      this.initTimeoutId = null
      this.setHighestQuality()
    }
    this.player.playVideo()
  }

  pause(): void {
    this.pendingPlay = false
    this.player?.pauseVideo()
  }

  seek(time: number): void {
    const t = Math.max(0, Math.min(time, this.getDuration() || time))
    this.player?.seekTo(t, true)
  }

  getCurrentTime(): number {
    const t = this.player?.getCurrentTime() || this.lastTime
    if (t > 0) this.lastTime = t
    return t
  }

  getDuration(): number {
    return this.player?.getDuration() || 0
  }

  isPlaying(): boolean {
    if (!this.player || !this.ready) return false
    return this.player.getPlayerState() === window.YT.PlayerState.PLAYING
  }

  getVolume(): number {
    return (this.player?.getVolume() || 100) / 100
  }

  setVolume(v: number): void {
    this.player?.setVolume(Math.max(0, Math.min(100, v * 100)))
  }

  setPlaybackRate(rate: number): void {
    this.player?.setPlaybackRate(rate)
  }

  onStateChange(cb: (state: PlayState) => void): void {
    this.stateCallback = cb
  }

  onQualityChange(cb: (quality: string) => void): void {
    this.onQualityChangeCallback = cb
  }

  getElement(): HTMLIFrameElement | null {
    return this.player?.getIframe() || null
  }

  destroy(): void {
    if (this.initTimeoutId) {
      clearTimeout(this.initTimeoutId)
      this.initTimeoutId = null
    }
    this.player?.destroy()
    this.player = null
    this.ready = false
    this.pendingPlay = false
    this.stateCallback = null
    this.pendingInit?.reject(new Error('Player destroyed during initialization'))
    this.pendingInit = null
  }

  isReady(): boolean {
    return this.ready
  }

  getAvailableQualities(): string[] {
    return this.player?.getAvailableQualityLevels() || []
  }

  getCurrentQuality(): string {
    return this.player?.getPlaybackQuality() || 'auto'
  }

  setQuality(quality: string): void {
    this.player?.setPlaybackQuality(quality === 'auto' ? 'default' : quality)
  }

  getVideoId(): string {
    return this.player?.getVideoData().video_id || ''
  }

  setSize(width: number, height: number): void {
    const iframe = this.player?.getIframe()
    if (iframe) {
      iframe.style.width = `${width}px`
      iframe.style.height = `${height}px`
    }
  }
}

export function createYouTubePlayer(containerId: string): YouTubePlayer {
  return new YouTubePlayer(containerId)
}

export function getQualityLabel(quality: string): string {
  return QUALITY_LABELS[quality] || quality
}

export function getQualityOrder(): string[] {
  return QUALITY_ORDER
}
