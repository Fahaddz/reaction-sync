import type { Player, PlayState } from './player.ts'
import { showToast } from './ui/toast.ts'

declare global {
  interface Window {
    YT: typeof YT
    onYouTubeIframeAPIReady: () => void
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

let apiLoaded = false
let apiLoading = false
const apiReadyCallbacks: (() => void)[] = []

function loadYouTubeAPI(): Promise<void> {
  if (apiLoaded) return Promise.resolve()
  if (apiLoading) {
    return new Promise(resolve => apiReadyCallbacks.push(resolve))
  }
  apiLoading = true
  return new Promise(resolve => {
    apiReadyCallbacks.push(resolve)
    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true
      apiLoading = false
      apiReadyCallbacks.forEach(cb => cb())
      apiReadyCallbacks.length = 0
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
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
  private onReadyCallback: (() => void) | null = null
  private onQualityChangeCallback: ((quality: string) => void) | null = null

  constructor(containerId: string) {
    this.containerId = containerId
  }

  async initialize(videoId: string, startSeconds?: number): Promise<void> {
    await loadYouTubeAPI()
    return new Promise((resolve) => {
      this.onReadyCallback = resolve
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
            if (startSeconds != null && startSeconds > 0) {
              e.target.seekTo(startSeconds, true)
              setTimeout(() => e.target.pauseVideo(), 100)
            }
            setTimeout(() => {
              this.setHighestQuality()
              e.target.pauseVideo()
            }, 500)
            this.onReadyCallback?.()
          },
          onStateChange: (e) => this.handleStateChange(e.data),
          onError: (e) => this.handleError(e.data, videoId),
          onPlaybackQualityChange: (e) => this.onQualityChangeCallback?.(e.data)
        }
      })
    })
  }

  private handleStateChange(state: number): void {
    if (state === window.YT.PlayerState.PLAYING) {
      this.stateCallback?.('playing')
    } else if (state === window.YT.PlayerState.PAUSED) {
      this.stateCallback?.('paused')
    } else if (state === window.YT.PlayerState.BUFFERING) {
      this.stateCallback?.('buffering')
    } else if (state === window.YT.PlayerState.ENDED) {
      this.stateCallback?.('ended')
    }
  }

  private handleError(errorCode: number, videoId: string): void {
    const errors: Record<number, string> = {
      2: 'Invalid URL', 5: 'HTML5 error', 100: 'Not found', 101: 'Embedding disabled', 150: 'Embedding disabled'
    }
    const message = errors[errorCode] || `YouTube error ${errorCode}`
    if (this.retryCount < 3) {
      this.retryCount++
      setTimeout(() => this.initialize(videoId), 2000 * this.retryCount)
    } else {
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
    this.player?.playVideo()
  }

  pause(): void {
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
    this.player?.destroy()
    this.player = null
    this.ready = false
    this.stateCallback = null
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

