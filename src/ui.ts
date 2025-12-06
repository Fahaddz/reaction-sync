import { get, set, subscribe, type VideoSource } from './state.ts'
import { createLocalPlayer, type LocalPlayer } from './player.ts'
import { createYouTubePlayer, getQualityLabel, getQualityOrder, type YouTubePlayer } from './youtube.ts'
import { formatTime, formatTimeWithDecimal, parseYouTubeId, throttle, srtToVtt, parseDelayFromFilename, checkCodecSupport } from './utils.ts'
import { 
  setPlayers, getBasePlayer, getReactPlayer, syncSeek, syncToggle,
  enableSync, disableSync, forceResync, getBaseCurrentTime, getBaseDuration, getReactCurrentTime, getReactDuration
} from './sync.ts'

const $ = (id: string) => document.getElementById(id)

let baseLocal: LocalPlayer | null = null
let baseYT: YouTubePlayer | null = null
let reactLocal: LocalPlayer | null = null
let reactYT: YouTubePlayer | null = null

function destroyBasePlayers(): void {
  baseLocal?.destroy()
  baseYT?.destroy()
  baseLocal = null
  baseYT = null
  const ytDiv = $('videoBaseYoutube')
  if (ytDiv) ytDiv.innerHTML = ''
}

function destroyReactPlayers(): void {
  reactLocal?.destroy()
  reactYT?.destroy()
  reactLocal = null
  reactYT = null
  const ytDiv = $('videoReactYoutube')
  if (ytDiv) ytDiv.innerHTML = ''
}

export function showToast(message: string, type: 'info' | 'error' = 'info', duration = 3000): void {
  const container = $('toastContainer')
  if (!container) return
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = message
  container.appendChild(toast)
  requestAnimationFrame(() => toast.classList.add('show'))
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 300)
  }, duration)
}

export function showResumePrompt(title: string, onYes: () => void, onNo: () => void): void {
  const container = $('resumePrompt')
  if (!container) return
  container.innerHTML = `
    <div class="resume-content">
      <span>${title}</span>
      <button id="resumeYes">Yes</button>
      <button id="resumeNo">No</button>
    </div>
  `
  container.style.display = 'flex'
  $('resumeYes')?.addEventListener('click', () => {
    container.style.display = 'none'
    onYes()
  })
  $('resumeNo')?.addEventListener('click', () => {
    container.style.display = 'none'
    onNo()
  })
}

export function promptLocalFile(which: 'base' | 'react', expectedName?: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/*'
    if (expectedName) {
      showToast(`Please select: ${expectedName}`, 'info', 5000)
    }
    input.onchange = () => {
      const file = input.files?.[0] || null
      resolve(file)
    }
    input.click()
  })
}

export async function loadLocalVideo(which: 'base' | 'react', file: File): Promise<void> {
  const check = await checkCodecSupport(file)
  if (!check.supported) {
    showToast(check.reason || 'Video not supported', 'error')
    return
  }
  if (which === 'base') {
    destroyBasePlayers()
    const video = $('videoBaseLocal') as HTMLVideoElement
    video.style.display = 'block'
    $('videoBaseYoutube')!.style.display = 'none'
    baseLocal = createLocalPlayer(video)
    baseLocal.loadFile(file)
    setPlayers(baseLocal, getReactPlayer())
    set({ baseSource: { type: 'local', id: file.name, name: file.name } })
  } else {
    destroyReactPlayers()
    const video = $('videoReact') as HTMLVideoElement
    video.style.display = 'block'
    $('videoReactYoutube')!.style.display = 'none'
    reactLocal = createLocalPlayer(video)
    reactLocal.loadFile(file)
    setPlayers(getBasePlayer(), reactLocal)
    set({ reactSource: { type: 'local', id: file.name, name: file.name } })
    const delay = parseDelayFromFilename(file.name)
    if (delay !== null) set({ delay })
  }
}

export async function loadYouTubeVideo(which: 'base' | 'react', videoId: string, startTime?: number): Promise<void> {
  if (which === 'base') {
    destroyBasePlayers()
    $('videoBaseLocal')!.style.display = 'none'
    $('videoBaseYoutube')!.style.display = 'block'
    baseYT = createYouTubePlayer('videoBaseYoutube')
    await baseYT.initialize(videoId, startTime)
    setPlayers(baseYT, getReactPlayer())
    set({ baseSource: { type: 'youtube', id: `yt:${videoId}` } })
  } else {
    destroyReactPlayers()
    $('videoReact')!.style.display = 'none'
    $('videoReactYoutube')!.style.display = 'block'
    reactYT = createYouTubePlayer('videoReactYoutube')
    await reactYT.initialize(videoId, startTime)
    setPlayers(getBasePlayer(), reactYT)
    set({ reactSource: { type: 'youtube', id: `yt:${videoId}` } })
  }
}

export async function loadUrlVideo(which: 'base' | 'react', url: string): Promise<void> {
  if (which === 'base') {
    destroyBasePlayers()
    const video = $('videoBaseLocal') as HTMLVideoElement
    video.style.display = 'block'
    $('videoBaseYoutube')!.style.display = 'none'
    baseLocal = createLocalPlayer(video)
    baseLocal.loadUrl(url)
    setPlayers(baseLocal, getReactPlayer())
    set({ baseSource: { type: 'url', id: url, url } })
  } else {
    destroyReactPlayers()
    const video = $('videoReact') as HTMLVideoElement
    video.style.display = 'block'
    $('videoReactYoutube')!.style.display = 'none'
    reactLocal = createLocalPlayer(video)
    reactLocal.loadUrl(url)
    setPlayers(getBasePlayer(), reactLocal)
    set({ reactSource: { type: 'url', id: url, url } })
  }
}

export async function loadVideoSource(which: 'base' | 'react', meta: VideoSource, startTime?: number): Promise<void> {
  if (meta.type === 'youtube') {
    const videoId = meta.id.replace('yt:', '')
    await loadYouTubeVideo(which, videoId, startTime)
  } else if (meta.type === 'url' && meta.url) {
    await loadUrlVideo(which, meta.url)
  } else if (meta.type === 'local' && meta.name) {
    const file = await promptLocalFile(which, meta.name)
    if (file) await loadLocalVideo(which, file)
  }
}

function initSourceDropdowns(): void {
  const baseBtn = $('baseVideoSourceBtn')
  const baseMenu = $('baseVideoSourceMenu')
  const reactBtn = $('reactVideoSourceBtn')
  const reactMenu = $('reactVideoSourceMenu')

  baseBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    baseMenu?.classList.toggle('show')
    reactMenu?.classList.remove('show')
  })

  reactBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    reactMenu?.classList.toggle('show')
    baseMenu?.classList.remove('show')
  })

  document.addEventListener('click', () => {
    baseMenu?.classList.remove('show')
    reactMenu?.classList.remove('show')
  })

  $('addBaseVideoLocal')?.addEventListener('click', async () => {
    baseMenu?.classList.remove('show')
    const file = await promptLocalFile('base')
    if (file) await loadLocalVideo('base', file)
  })

  $('addBaseVideoLink')?.addEventListener('click', () => {
    baseMenu?.classList.remove('show')
    const url = prompt('Enter YouTube URL or direct video link:')
    if (!url) return
    const ytId = parseYouTubeId(url)
    if (ytId) {
      loadYouTubeVideo('base', ytId)
    } else {
      loadUrlVideo('base', url)
    }
  })

  $('addReactVidLocal')?.addEventListener('click', async () => {
    reactMenu?.classList.remove('show')
    const file = await promptLocalFile('react')
    if (file) await loadLocalVideo('react', file)
  })

  $('addReactVidLink')?.addEventListener('click', () => {
    reactMenu?.classList.remove('show')
    const url = prompt('Enter YouTube URL or direct video link:')
    if (!url) return
    const ytId = parseYouTubeId(url)
    if (ytId) {
      loadYouTubeVideo('react', ytId)
    } else {
      loadUrlVideo('react', url)
    }
  })
}

function initPlaybackControls(): void {
  const basePlayPause = $('basePlayPause')
  const reactPlayPause = $('reactPlayPause')
  const baseSeekBar = $('baseSeekBar') as HTMLInputElement
  const reactSeekBar = $('reactSeekBar') as HTMLInputElement
  const baseVolume = $('baseVolumeSlider') as HTMLInputElement
  const reactVolume = $('reactVolumeSlider') as HTMLInputElement

  basePlayPause?.addEventListener('click', syncToggle)
  reactPlayPause?.addEventListener('click', () => {
    const rp = getReactPlayer()
    if (rp?.isPlaying()) rp.pause()
    else rp?.play()
  })

  baseSeekBar?.addEventListener('input', () => {
    const bp = getBasePlayer()
    if (!bp) return
    const time = (parseFloat(baseSeekBar.value) / 100) * bp.getDuration()
    syncSeek(true, time)
  })

  reactSeekBar?.addEventListener('input', () => {
    const rp = getReactPlayer()
    if (!rp) return
    const time = (parseFloat(reactSeekBar.value) / 100) * rp.getDuration()
    syncSeek(false, time)
  })

  baseVolume?.addEventListener('input', () => {
    const bp = getBasePlayer()
    if (bp) {
      bp.setVolume(parseFloat(baseVolume.value))
      set({ baseVolume: parseFloat(baseVolume.value) })
    }
  })

  reactVolume?.addEventListener('input', () => {
    const rp = getReactPlayer()
    if (rp) {
      rp.setVolume(parseFloat(reactVolume.value))
      set({ reactVolume: parseFloat(reactVolume.value) })
    }
  })
}

function initSubtitleButton(): void {
  $('addSubBtn')?.addEventListener('click', async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.srt,.vtt'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file || !baseLocal) return
      const text = await file.text()
      const vtt = file.name.endsWith('.srt') ? srtToVtt(text) : text
      baseLocal.attachSubtitles(vtt)
      showToast('Subtitles loaded', 'info', 2000)
    }
    input.click()
  })
}

function initQualityMenu(): void {
  const qBtn = $('youtubeQuality')
  const menu = $('qualityMenu')
  if (!qBtn || !menu) return

  qBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    const yt = baseYT || reactYT
    if (!yt) {
      showToast('Load a YouTube video first', 'error')
      return
    }
    const available = yt.getAvailableQualities()
    const current = yt.getCurrentQuality()
    menu.innerHTML = ''
    for (const q of getQualityOrder()) {
      if (!available.includes(q)) continue
      const btn = document.createElement('button')
      btn.textContent = getQualityLabel(q)
      btn.className = q === current ? 'active' : ''
      btn.addEventListener('click', () => {
        yt.setQuality(q)
        menu.classList.remove('show')
        showToast(`Quality: ${getQualityLabel(q)}`, 'info', 2000)
      })
      menu.appendChild(btn)
    }
    menu.classList.toggle('show')
  })

  document.addEventListener('click', () => menu.classList.remove('show'))
}

function initSyncButtons(): void {
  $('syncButton')?.addEventListener('click', () => {
    enableSync()
    showToast('Videos synced', 'info', 2000)
  })
  $('desyncButton')?.addEventListener('click', () => {
    disableSync()
    showToast('Sync disabled', 'info', 2000)
  })
  $('forceResyncButton')?.addEventListener('click', () => {
    forceResync()
    showToast('Force re-synced', 'info', 2000)
  })
  $('saveNowButton')?.addEventListener('click', () => {
    const event = new CustomEvent('saveNow')
    document.dispatchEvent(event)
    showToast('Progress saved', 'info', 2000)
  })
}

function initTipsScreen(): void {
  const tips = $('tipsScreen')
  $('tipsClose')?.addEventListener('click', () => {
    tips?.classList.add('hidden')
  })
}

const updateUI = throttle(() => {
  const state = get()
  const basePlayPause = $('basePlayPause')
  const reactPlayPause = $('reactPlayPause')
  const baseSeekBar = $('baseSeekBar') as HTMLInputElement
  const reactSeekBar = $('reactSeekBar') as HTMLInputElement
  const baseTime = $('baseTimeDisplay')
  const reactTime = $('reactTimeDisplay')
  const delayDisplay = $('delayDisplay')
  const healthDot = $('syncHealthDot')
  const baseVolume = $('baseVolumeSlider') as HTMLInputElement
  const reactVolume = $('reactVolumeSlider') as HTMLInputElement

  const bp = getBasePlayer()
  const rp = getReactPlayer()

  if (basePlayPause) basePlayPause.textContent = bp?.isPlaying() ? '⏸' : '▶'
  if (reactPlayPause) reactPlayPause.textContent = rp?.isPlaying() ? '⏸' : '⏵'

  const baseCurrent = getBaseCurrentTime()
  const baseDur = getBaseDuration()
  const reactCurrent = getReactCurrentTime()
  const reactDur = getReactDuration()

  if (baseSeekBar && baseDur > 0) {
    baseSeekBar.value = String((baseCurrent / baseDur) * 100)
  }
  if (reactSeekBar && reactDur > 0) {
    reactSeekBar.value = String((reactCurrent / reactDur) * 100)
  }

  if (baseTime) baseTime.textContent = `${formatTime(baseCurrent)} / ${formatTime(baseDur)}`
  if (reactTime) reactTime.textContent = `${formatTime(reactCurrent)} / ${formatTime(reactDur)}`

  if (delayDisplay) delayDisplay.textContent = formatTimeWithDecimal(state.delay)

  if (healthDot) {
    healthDot.className = state.syncHealth ? `health-${state.syncHealth}` : ''
  }

  if (baseVolume) baseVolume.value = String(state.baseVolume)
  if (reactVolume) reactVolume.value = String(state.reactVolume)
}, 100)

export function initUI(): void {
  initSourceDropdowns()
  initPlaybackControls()
  initSubtitleButton()
  initQualityMenu()
  initSyncButtons()
  initTipsScreen()

  subscribe(updateUI)
  setInterval(updateUI, 100)

  const container = $('videoReactContainer')
  if (container) {
    const pos = get().reactPosition
    container.style.left = `${pos.x}px`
    container.style.top = `${pos.y}px`
    container.style.width = `${pos.w}px`
    container.style.height = `${pos.h}px`
  }
}

