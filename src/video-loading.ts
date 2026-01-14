import { baseSource, reactSource, type VideoSource, showToast, closeTipsScreen } from './stores.ts'
import { createLocalPlayer, type LocalPlayer } from './player.ts'
import { createYouTubePlayer, type YouTubePlayer } from './youtube.ts'
import { parseYouTubeId, parseDelayFromFilename, checkCodecSupport, srtToVtt } from './utils.ts'
import { setPlayers, getBasePlayer, getReactPlayer, setDelay } from './sync.ts'
import { markPairAsNew } from './storage.ts'

const VIDEO_ACCEPT = 'video/*,.mkv,.avi,.mov,.wmv,.flv,.m4v,.webm,.ogv,.3gp,.ts,.mts'

let baseLocal: LocalPlayer | null = null
let baseYT: YouTubePlayer | null = null
let reactLocal: LocalPlayer | null = null
let reactYT: YouTubePlayer | null = null

let baseVideoEl: HTMLVideoElement | null = null
let baseYTContainer: HTMLDivElement | null = null
let reactVideoEl: HTMLVideoElement | null = null
let reactYTContainer: HTMLDivElement | null = null

export function setBaseElements(video: HTMLVideoElement, ytContainer: HTMLDivElement): void {
  baseVideoEl = video
  baseYTContainer = ytContainer
}

export function setReactElements(video: HTMLVideoElement, ytContainer: HTMLDivElement): void {
  reactVideoEl = video
  reactYTContainer = ytContainer
}

function destroyBasePlayers(): void {
  baseLocal?.destroy()
  baseYT?.destroy()
  baseLocal = null
  baseYT = null
}

function destroyReactPlayers(): void {
  reactLocal?.destroy()
  reactYT?.destroy()
  reactLocal = null
  reactYT = null
}

async function handleLocalFile(which: 'base' | 'react', file: File): Promise<boolean> {
  const { supported, reason } = await checkCodecSupport(file)
  if (!supported) {
    showToast(reason || 'Unsupported codec', 'error')
    return false
  }
  const source: VideoSource = { type: 'local', id: `file:${file.name}|${file.size}`, name: file.name }
  if (which === 'base') {
    destroyBasePlayers()
    if (!baseVideoEl) return false
    baseLocal = createLocalPlayer(baseVideoEl)
    baseLocal.loadFile(file)
    setPlayers(baseLocal, getReactPlayer())
    baseSource.set(source)
    markPairAsNew()
    document.title = file.name
  } else {
    destroyReactPlayers()
    if (!reactVideoEl) return false
    reactLocal = createLocalPlayer(reactVideoEl)
    reactLocal.loadFile(file)
    setPlayers(getBasePlayer(), reactLocal)
    reactSource.set(source)
    markPairAsNew()
    const delayToken = parseDelayFromFilename(file.name)
    if (delayToken !== null) setDelay(delayToken)
  }
  return true
}

export async function promptLocalFile(which: 'base' | 'react', expectedName?: string): Promise<void> {
  closeTipsScreen()
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = VIDEO_ACCEPT
    if (expectedName) showToast(`Please select: ${expectedName}`, 'info', 8000)
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file) await handleLocalFile(which, file)
      resolve()
    }
    input.click()
  })
}

export async function selectUrlSource(which: 'base' | 'react'): Promise<void> {
  closeTipsScreen()
  const url = prompt('Enter YouTube URL or direct video link:')
  if (!url) return
  const ytId = parseYouTubeId(url)
  if (ytId) {
    const source: VideoSource = { type: 'youtube', id: `yt:${ytId}` }
    if (which === 'base') {
      destroyBasePlayers()
      if (!baseYTContainer) return
      baseYT = createYouTubePlayer(baseYTContainer.id || 'videoBaseYoutube')
      await baseYT.initialize(ytId)
      setPlayers(baseYT, getReactPlayer())
      baseSource.set(source)
      markPairAsNew()
    } else {
      destroyReactPlayers()
      if (!reactYTContainer) return
      reactYT = createYouTubePlayer(reactYTContainer.id || 'videoReactYoutube')
      await reactYT.initialize(ytId)
      setPlayers(getBasePlayer(), reactYT)
      reactSource.set(source)
      markPairAsNew()
    }
  } else {
    const source: VideoSource = { type: 'url', id: `url:${url}`, url }
    if (which === 'base') {
      destroyBasePlayers()
      if (!baseVideoEl) return
      baseLocal = createLocalPlayer(baseVideoEl)
      baseLocal.loadUrl(url)
      setPlayers(baseLocal, getReactPlayer())
      baseSource.set(source)
      markPairAsNew()
    } else {
      destroyReactPlayers()
      if (!reactVideoEl) return
      reactLocal = createLocalPlayer(reactVideoEl)
      reactLocal.loadUrl(url)
      setPlayers(getBasePlayer(), reactLocal)
      reactSource.set(source)
      markPairAsNew()
    }
  }
}

export function selectSubtitleFile(): void {
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
    }
    reader.readAsText(file)
  }
  input.click()
}

export async function loadYouTubeVideo(which: 'base' | 'react', videoId: string, startTime?: number): Promise<void> {
  try {
    if (which === 'base') {
      destroyBasePlayers()
      if (!baseYTContainer) throw new Error('Base YouTube container not set')
      baseYT = createYouTubePlayer(baseYTContainer.id || 'videoBaseYoutube')
      await baseYT.initialize(videoId, startTime)
      setPlayers(baseYT, getReactPlayer())
      baseSource.set({ type: 'youtube', id: `yt:${videoId}` })
      markPairAsNew()
    } else {
      destroyReactPlayers()
      if (!reactYTContainer) throw new Error('React YouTube container not set')
      reactYT = createYouTubePlayer(reactYTContainer.id || 'videoReactYoutube')
      await reactYT.initialize(videoId, startTime)
      setPlayers(getBasePlayer(), reactYT)
      reactSource.set({ type: 'youtube', id: `yt:${videoId}` })
      markPairAsNew()
    }
  } catch (err) {
    console.error(`Failed to load YouTube video (${which}):`, err)
    showToast(`Failed to load ${which} video`, 'error')
    throw err
  }
}

export async function loadUrlVideo(which: 'base' | 'react', url: string): Promise<void> {
  const source: VideoSource = { type: 'url', id: `url:${url}`, url }
  if (which === 'base') {
    destroyBasePlayers()
    if (!baseVideoEl) return
    baseLocal = createLocalPlayer(baseVideoEl)
    baseLocal.loadUrl(url)
    setPlayers(baseLocal, getReactPlayer())
    baseSource.set(source)
    markPairAsNew()
  } else {
    destroyReactPlayers()
    if (!reactVideoEl) return
    reactLocal = createLocalPlayer(reactVideoEl)
    reactLocal.loadUrl(url)
    setPlayers(getBasePlayer(), reactLocal)
    reactSource.set(source)
    markPairAsNew()
  }
}

export function getYouTubePlayers(): { baseYT: YouTubePlayer | null; reactYT: YouTubePlayer | null } {
  return { baseYT, reactYT }
}

export function getLocalPlayers(): { baseLocal: LocalPlayer | null; reactLocal: LocalPlayer | null } {
  return { baseLocal, reactLocal }
}
