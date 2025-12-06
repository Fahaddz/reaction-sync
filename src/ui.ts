import { get, set, subscribe, type VideoSource } from './state.ts'
import { createLocalPlayer, type LocalPlayer } from './player.ts'
import { createYouTubePlayer, getQualityLabel, getQualityOrder, type YouTubePlayer } from './youtube.ts'
import { formatTime, formatTimeWithDecimal, parseYouTubeId, throttle, srtToVtt, parseDelayFromFilename, checkCodecSupport } from './utils.ts'
import { 
  setPlayers, getBasePlayer, getReactPlayer, syncSeek, syncPlay, syncPause,
  enableSync, disableSync, forceResync, setDelay, isBasePlaying, isReactPlaying,
  getBaseCurrentTime, getBaseDuration, getReactCurrentTime, getReactDuration,
  setBaseVolume, setReactVolume
} from './sync.ts'

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null

let baseLocal: LocalPlayer | null = null
let baseYT: YouTubePlayer | null = null
let reactLocal: LocalPlayer | null = null
let reactYT: YouTubePlayer | null = null

function destroyBasePlayers(): void {
  baseLocal?.destroy()
  baseYT?.destroy()
  baseLocal = null
  baseYT = null
  $('videoBaseYoutube')!.style.display = 'none'
  $('videoBaseLocal')!.style.display = 'block'
}

function destroyReactPlayers(): void {
  reactLocal?.destroy()
  reactYT?.destroy()
  reactLocal = null
  reactYT = null
  $('videoReactYoutube')!.style.display = 'none'
  $('videoReact')!.style.display = 'block'
}

export function showToast(message: string, type: 'info' | 'error' | 'warning' = 'info', duration = 3000): void {
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

export function showResumePrompt(
  baseTime: number,
  delay: number,
  onResume: () => void,
  onReset: () => void
): void {
  const container = $('resumePrompt')
  if (!container) return
  container.innerHTML = `
    <div class="resume-dialog">
      <h3>Resume where you left off?</h3>
      <p>Last time at ${formatTime(baseTime)} with delay ${formatTimeWithDecimal(delay)}</p>
      <div class="buttons">
        <button class="reset-btn">Start New</button>
        <button class="resume-btn">Resume</button>
      </div>
    </div>
  `
  container.classList.add('open')
  container.querySelector('.resume-btn')?.addEventListener('click', () => {
    container.classList.remove('open')
    onResume()
  })
  container.querySelector('.reset-btn')?.addEventListener('click', () => {
    container.classList.remove('open')
    onReset()
  })
}

export function closeTipsScreen(): void {
  const tips = $('tipsScreen')
  if (tips) tips.style.display = 'none'
}

export async function promptLocalFile(which: 'base' | 'react', expectedName?: string): Promise<void> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'video/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(); return }
      const { supported, reason } = await checkCodecSupport(file)
      if (!supported) {
        showToast(reason || 'Unsupported codec', 'error')
        resolve()
        return
      }
      const source: VideoSource = { type: 'local', id: `file:${file.name}|${file.size}`, name: file.name }
      if (which === 'base') {
        destroyBasePlayers()
        const video = $<HTMLVideoElement>('videoBaseLocal')!
        baseLocal = createLocalPlayer(video)
        baseLocal.loadFile(file)
        setPlayers(baseLocal, getReactPlayer())
        set({ baseSource: source })
        document.title = file.name
      } else {
        destroyReactPlayers()
        const video = $<HTMLVideoElement>('videoReact')!
        reactLocal = createLocalPlayer(video)
        reactLocal.loadFile(file)
        setPlayers(getBasePlayer(), reactLocal)
        set({ reactSource: source })
        const delayToken = parseDelayFromFilename(file.name)
        if (delayToken !== null) setDelay(delayToken)
      }
      resolve()
    }
    if (expectedName) {
      showToast(`Please select: ${expectedName}`, 'info', 8000)
    }
    input.click()
  })
}

async function selectLocalFile(which: 'base' | 'react'): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'video/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const { supported, reason } = await checkCodecSupport(file)
    if (!supported) {
      showToast(reason || 'Unsupported codec', 'error')
      return
    }
    const source: VideoSource = { type: 'local', id: `file:${file.name}|${file.size}`, name: file.name }
    if (which === 'base') {
      destroyBasePlayers()
      const video = $<HTMLVideoElement>('videoBaseLocal')!
      baseLocal = createLocalPlayer(video)
      baseLocal.loadFile(file)
      setPlayers(baseLocal, getReactPlayer())
      set({ baseSource: source })
      document.title = file.name
    } else {
      destroyReactPlayers()
      const video = $<HTMLVideoElement>('videoReact')!
      reactLocal = createLocalPlayer(video)
      reactLocal.loadFile(file)
      setPlayers(getBasePlayer(), reactLocal)
      set({ reactSource: source })
      const delayToken = parseDelayFromFilename(file.name)
      if (delayToken !== null) setDelay(delayToken)
    }
  }
  input.click()
}

async function selectUrlSource(which: 'base' | 'react'): Promise<void> {
  const url = prompt('Enter YouTube URL or direct video link:')
  if (!url) return
  const ytId = parseYouTubeId(url)
  if (ytId) {
    const source: VideoSource = { type: 'youtube', id: `yt:${ytId}` }
    if (which === 'base') {
      destroyBasePlayers()
      $('videoBaseLocal')!.style.display = 'none'
      $('videoBaseYoutube')!.style.display = 'block'
      baseYT = createYouTubePlayer('videoBaseYoutube')
      await baseYT.initialize(ytId)
      setPlayers(baseYT, getReactPlayer())
      set({ baseSource: source })
    } else {
      destroyReactPlayers()
      $('videoReact')!.style.display = 'none'
      $('videoReactYoutube')!.style.display = 'block'
      reactYT = createYouTubePlayer('videoReactYoutube')
      await reactYT.initialize(ytId)
      setPlayers(getBasePlayer(), reactYT)
      set({ reactSource: source })
    }
  } else {
    const source: VideoSource = { type: 'url', id: `url:${url}`, url }
    if (which === 'base') {
      destroyBasePlayers()
      $('videoBaseYoutube')!.style.display = 'none'
      $('videoBaseLocal')!.style.display = 'block'
      const video = $<HTMLVideoElement>('videoBaseLocal')!
      baseLocal = createLocalPlayer(video)
      baseLocal.loadUrl(url)
      setPlayers(baseLocal, getReactPlayer())
      set({ baseSource: source })
    } else {
      destroyReactPlayers()
      $('videoReactYoutube')!.style.display = 'none'
      $('videoReact')!.style.display = 'block'
      const video = $<HTMLVideoElement>('videoReact')!
      reactLocal = createLocalPlayer(video)
      reactLocal.loadUrl(url)
      setPlayers(getBasePlayer(), reactLocal)
      set({ reactSource: source })
    }
  }
}

function selectSubtitleFile(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.srt,.vtt'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const vtt = file.name.endsWith('.srt') ? srtToVtt(text) : text
      baseLocal?.attachSubtitles(vtt)
      const btn = $('addSubBtn')
      if (btn) btn.textContent = file.name.replace(/\.[^.]+$/, '').slice(-10)
    }
    reader.readAsText(file)
  }
  input.click()
}

function initSourceMenus(): void {
  const baseBtn = $<HTMLButtonElement>('baseVideoSourceBtn')
  const baseMenu = $<HTMLDivElement>('baseVideoSourceMenu')
  const reactBtn = $<HTMLButtonElement>('reactVideoSourceBtn')
  const reactMenu = $<HTMLDivElement>('reactVideoSourceMenu')

  baseBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    baseMenu?.classList.toggle('open')
    reactMenu?.classList.remove('open')
  })

  reactBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    reactMenu?.classList.toggle('open')
    baseMenu?.classList.remove('open')
  })

  document.addEventListener('click', () => {
    baseMenu?.classList.remove('open')
    reactMenu?.classList.remove('open')
  })

  $('addBaseVideoLocal')?.addEventListener('click', () => selectLocalFile('base'))
  $('addBaseVideoLink')?.addEventListener('click', () => selectUrlSource('base'))
  $('addReactVidLocal')?.addEventListener('click', () => selectLocalFile('react'))
  $('addReactVidLink')?.addEventListener('click', () => selectUrlSource('react'))
  $('addSubBtn')?.addEventListener('click', selectSubtitleFile)
}

function initControlBindings(): void {
  $('basePlayPause')?.addEventListener('click', () => {
    isBasePlaying() ? syncPause(true) : syncPlay(true)
  })
  $('reactPlayPause')?.addEventListener('click', () => {
    isReactPlaying() ? syncPause(false) : syncPlay(false)
  })
  $('videoBaseLocal')?.addEventListener('click', () => {
    isBasePlaying() ? syncPause(true) : syncPlay(true)
  })
  $('videoReact')?.addEventListener('click', () => {
    isReactPlaying() ? syncPause(false) : syncPlay(false)
  })
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

function initVolumeSliders(): void {
  const baseVol = $<HTMLInputElement>('baseVolumeSlider')
  const reactVol = $<HTMLInputElement>('reactVolumeSlider')
  baseVol?.addEventListener('input', () => setBaseVolume(parseFloat(baseVol.value)))
  reactVol?.addEventListener('input', () => setReactVolume(parseFloat(reactVol.value)))
}

function initSeekBars(): void {
  const baseSeek = $<HTMLInputElement>('baseSeekBar')
  const reactSeek = $<HTMLInputElement>('reactSeekBar')

  const onBaseSeek = throttle(() => {
    const pct = parseFloat(baseSeek!.value)
    const dur = getBaseDuration()
    if (dur > 0) syncSeek(true, (pct / 100) * dur)
  }, 50)

  const onReactSeek = throttle(() => {
    const pct = parseFloat(reactSeek!.value)
    const dur = getReactDuration()
    if (dur > 0) syncSeek(false, (pct / 100) * dur)
  }, 50)

  baseSeek?.addEventListener('input', onBaseSeek)
  reactSeek?.addEventListener('input', onReactSeek)
}

function initQualityMenu(): void {
  const btn = $('youtubeQuality')
  const menu = $<HTMLDivElement>('qualityMenu')
  if (!btn || !menu) return

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    const player = baseYT || reactYT
    if (!player) {
      showToast('No YouTube video loaded', 'info')
      return
    }
    const levels = player.getAvailableQualities()
    const current = player.getCurrentQuality()
    menu.innerHTML = ''
    const opts = ['auto', ...getQualityOrder().filter(q => levels.includes(q))]
    for (const q of opts) {
      const opt = document.createElement('button')
      opt.className = `quality-option${q === current || (q === 'auto' && current === 'default') ? ' active' : ''}`
      opt.textContent = getQualityLabel(q)
      opt.addEventListener('click', () => {
        player.setQuality(q)
        menu.classList.remove('open')
      })
      menu.appendChild(opt)
    }
    const rect = btn.getBoundingClientRect()
    menu.style.left = `${rect.left}px`
    menu.style.top = `${rect.top - menu.offsetHeight - 8}px`
    menu.classList.toggle('open')
  })

  document.addEventListener('click', () => menu.classList.remove('open'))
}

function updateTimeDisplays(): void {
  const baseTime = $('baseTimeDisplay')
  const reactTime = $('reactTimeDisplay')
  const baseSeek = $<HTMLInputElement>('baseSeekBar')
  const reactSeek = $<HTMLInputElement>('reactSeekBar')

  const bc = getBaseCurrentTime()
  const bd = getBaseDuration()
  const rc = getReactCurrentTime()
  const rd = getReactDuration()

  if (baseTime) baseTime.textContent = `${formatTime(bc)} / ${formatTime(bd)}`
  if (reactTime) reactTime.textContent = `${formatTime(rc)} / ${formatTime(rd)}`
  if (baseSeek && bd > 0) baseSeek.value = String((bc / bd) * 100)
  if (reactSeek && rd > 0) reactSeek.value = String((rc / rd) * 100)

  const basePP = $('basePlayPause')
  const reactPP = $('reactPlayPause')
  if (basePP) basePP.textContent = isBasePlaying() ? '⏸' : '▶'
  if (reactPP) reactPP.textContent = isReactPlaying() ? '⏸' : '⏵'
}

function updateUIFromState(): void {
  const { delay, synced, syncHealth } = get()

  const delayEl = $('delayDisplay')
  if (delayEl) {
    delayEl.textContent = formatTimeWithDecimal(delay)
    delayEl.classList.toggle('synced', synced)
  }

  const syncBtn = $('syncButton')
  syncBtn?.classList.toggle('synced', synced)

  const reactContainer = $('videoReactContainer')
  reactContainer?.classList.toggle('synced', synced)

  const healthDot = $('syncHealthDot')
  if (healthDot) {
    healthDot.className = syncHealth || ''
  }

  const baseVol = $<HTMLInputElement>('baseVolumeSlider')
  const reactVol = $<HTMLInputElement>('reactVolumeSlider')
  if (baseVol) baseVol.value = String(get().baseVolume)
  if (reactVol) reactVol.value = String(get().reactVolume)
}

export function initUI(): void {
  initSourceMenus()
  initControlBindings()
  initSyncButtons()
  initVolumeSliders()
  initSeekBars()
  initQualityMenu()
  subscribe(updateUIFromState)
  setInterval(updateTimeDisplays, 500)
}

export function getYouTubePlayers(): { baseYT: YouTubePlayer | null; reactYT: YouTubePlayer | null } {
  return { baseYT, reactYT }
}

export function getLocalPlayers(): { baseLocal: LocalPlayer | null; reactLocal: LocalPlayer | null } {
  return { baseLocal, reactLocal }
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
  const source: VideoSource = { type: 'url', id: `url:${url}`, url }
  if (which === 'base') {
    destroyBasePlayers()
    $('videoBaseYoutube')!.style.display = 'none'
    $('videoBaseLocal')!.style.display = 'block'
    const video = $<HTMLVideoElement>('videoBaseLocal')!
    baseLocal = createLocalPlayer(video)
    baseLocal.loadUrl(url)
    setPlayers(baseLocal, getReactPlayer())
    set({ baseSource: source })
  } else {
    destroyReactPlayers()
    $('videoReactYoutube')!.style.display = 'none'
    $('videoReact')!.style.display = 'block'
    const video = $<HTMLVideoElement>('videoReact')!
    reactLocal = createLocalPlayer(video)
    reactLocal.loadUrl(url)
    setPlayers(getBasePlayer(), reactLocal)
    set({ reactSource: source })
  }
}
