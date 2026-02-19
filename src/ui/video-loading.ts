import { set, type VideoSource } from '../state.ts'
import { createLocalPlayer, type LocalPlayer } from '../player.ts'
import { createYouTubePlayer, type YouTubePlayer } from '../youtube.ts'
import { parseYouTubeId, parseDelayFromFilename, checkCodecSupport, srtToVtt } from '../utils.ts'
import { setPlayers, getBasePlayer, getReactPlayer, setDelay } from '../sync.ts'
import { showToast, closeTipsScreen } from './toast.ts'
import { markPairAsNew } from '../storage.ts'

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null

// Comprehensive video format support - includes video/* MIME type plus explicit extensions
// for formats that may not be recognized by video/* alone (e.g., MKV, AVI)
const VIDEO_ACCEPT = 'video/*,.mkv,.avi,.mov,.wmv,.flv,.m4v,.webm,.ogv,.3gp,.ts,.mts'

let baseLocal: LocalPlayer | null = null
let baseYT: YouTubePlayer | null = null
let reactLocal: LocalPlayer | null = null
let reactYT: YouTubePlayer | null = null

export type LocalFilePromptResult = {
  selected: boolean
  loaded: boolean
}

function setVideoVisibility(which: 'base' | 'react', type: 'local' | 'youtube'): void {
  const isBase = which === 'base'
  const localEl = $(isBase ? 'videoBaseLocal' : 'videoReact')
  const ytEl = $(isBase ? 'videoBaseYoutube' : 'videoReactYoutube')
  if (localEl) localEl.style.display = type === 'local' ? 'block' : 'none'
  if (ytEl) ytEl.style.display = type === 'youtube' ? 'block' : 'none'
}

function destroyBasePlayers(): void {
  baseLocal?.destroy()
  baseYT?.destroy()
  baseLocal = null
  baseYT = null
  setVideoVisibility('base', 'local')
}

function destroyReactPlayers(): void {
  reactLocal?.destroy()
  reactYT?.destroy()
  reactLocal = null
  reactYT = null
  setVideoVisibility('react', 'local')
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
    const video = $<HTMLVideoElement>('videoBaseLocal')
    if (!video) return false
    baseLocal = createLocalPlayer(video)
    baseLocal.loadFile(file)
    setPlayers(baseLocal, getReactPlayer())
    set({ baseSource: source })
    markPairAsNew()
    document.title = file.name
  } else {
    destroyReactPlayers()
    const video = $<HTMLVideoElement>('videoReact')
    if (!video) return false
    reactLocal = createLocalPlayer(video)
    reactLocal.loadFile(file)
    setPlayers(getBasePlayer(), reactLocal)
    set({ reactSource: source })
    markPairAsNew()
    const delayToken = parseDelayFromFilename(file.name)
    if (delayToken !== null) setDelay(delayToken)
  }
  return true
}

export async function promptLocalFile(which: 'base' | 'react', expectedName?: string): Promise<LocalFilePromptResult> {
  closeTipsScreen()
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = VIDEO_ACCEPT
    let settled = false

    const complete = (result: LocalFilePromptResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }
    
    if (expectedName) {
      showToast(`Please select: ${expectedName}`, 'info', 8000)
    }
    
    // Prevent any form submission behavior
    input.onchange = async (event) => {
      event.preventDefault()
      event.stopPropagation()
      
      const file = input.files?.[0]
      if (!file) {
        complete({ selected: false, loaded: false })
        return
      }
      try {
        const loaded = await handleLocalFile(which, file)
        complete({ selected: true, loaded })
      } catch (err) {
        console.error('Error loading file:', err)
        showToast('Failed to load file', 'error')
        complete({ selected: true, loaded: false })
      }
    }
    
    // Handle cancel case
    input.oncancel = () => complete({ selected: false, loaded: false })
    
    input.click()
  })
}

export async function selectUrlSource(which: 'base' | 'react'): Promise<void> {
  closeTipsScreen()
  const urlInput = prompt('Enter YouTube URL or direct video link:')
  if (!urlInput) return
  const url = urlInput.trim()
  if (!url) return
  const ytId = parseYouTubeId(url)
  if (ytId) {
    try {
      await loadYouTubeVideo(which, ytId)
    } catch {
      // Error toast is already shown in loadYouTubeVideo.
    }
    return
  } else {
    const source: VideoSource = { type: 'url', id: `url:${url}`, url }
    if (which === 'base') {
      destroyBasePlayers()
      setVideoVisibility('base', 'local')
      const video = $<HTMLVideoElement>('videoBaseLocal')
      if (!video) return
      baseLocal = createLocalPlayer(video)
      baseLocal.loadUrl(url)
      setPlayers(baseLocal, getReactPlayer())
      set({ baseSource: source })
      markPairAsNew()
    } else {
      destroyReactPlayers()
      setVideoVisibility('react', 'local')
      const video = $<HTMLVideoElement>('videoReact')
      if (!video) return
      reactLocal = createLocalPlayer(video)
      reactLocal.loadUrl(url)
      setPlayers(getBasePlayer(), reactLocal)
      set({ reactSource: source })
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
      const btn = $('addSubBtn')
      if (btn) btn.textContent = file.name.replace(/\.[^.]+$/, '').slice(-10)
    }
    reader.readAsText(file)
  }
  input.click()
}

export async function loadYouTubeVideo(which: 'base' | 'react', videoId: string, startTime?: number): Promise<void> {
  try {
    if (which === 'base') {
      destroyBasePlayers()
      setVideoVisibility('base', 'youtube')
      baseYT = createYouTubePlayer('videoBaseYoutube')
      await baseYT.initialize(videoId, startTime)
      setPlayers(baseYT, getReactPlayer())
      set({ baseSource: { type: 'youtube', id: `yt:${videoId}` } })
      markPairAsNew()
    } else {
      destroyReactPlayers()
      setVideoVisibility('react', 'youtube')
      reactYT = createYouTubePlayer('videoReactYoutube')
      await reactYT.initialize(videoId, startTime)
      setPlayers(getBasePlayer(), reactYT)
      set({ reactSource: { type: 'youtube', id: `yt:${videoId}` } })
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
    setVideoVisibility('base', 'local')
    const video = $<HTMLVideoElement>('videoBaseLocal')
    if (!video) return
    baseLocal = createLocalPlayer(video)
    baseLocal.loadUrl(url)
    setPlayers(baseLocal, getReactPlayer())
    set({ baseSource: source })
    markPairAsNew()
  } else {
    destroyReactPlayers()
    setVideoVisibility('react', 'local')
    const video = $<HTMLVideoElement>('videoReact')
    if (!video) return
    reactLocal = createLocalPlayer(video)
    reactLocal.loadUrl(url)
    setPlayers(getBasePlayer(), reactLocal)
    set({ reactSource: source })
    markPairAsNew()
  }
}

export function getYouTubePlayers(): { baseYT: YouTubePlayer | null; reactYT: YouTubePlayer | null } {
  return { baseYT, reactYT }
}
