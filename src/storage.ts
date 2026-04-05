import { get, set, type VideoSource } from './state.ts'
import { getCurrentPairKey, getCurrentSessionPairs } from './session-pairs.ts'
import { getBaseCurrentTime, setDelay, setPlaybackSpeed, syncSeek, getBasePlayer, getReactPlayer, setBaseVolume, setReactVolume } from './sync.ts'
import { showResumePrompt, showToast } from './ui/toast.ts'
import { loadYouTubeVideo, loadUrlVideo, promptLocalFile } from './ui/video-loading.ts'

// Constants for video ready detection and retry logic
const MAX_SEEK_RETRIES = 3
const SEEK_VERIFY_TOLERANCE = 0.5 // seconds
const VIDEO_READY_TIMEOUT = 5000 // ms

type SessionData = {
  id: string
  baseId: string
  reactId: string
  baseMeta: VideoSource | null
  reactMeta: VideoSource | null
  delay: number
  baseTime: number
  baseVol: number
  reactVol: number
  playbackSpeed?: number
  position: { x: number; y: number; w: number; h: number }
  updatedAt: number
}

const DB_NAME = 'reaction-sync'
const STORE_NAME = 'sessions'
const TTL = 7 * 24 * 60 * 60 * 1000
const MAX_SESSIONS = 3

let db: IDBDatabase | null = null
let saveIntervalId: ReturnType<typeof setInterval> | null = null
let prompted = false
let isLoadingSession = false

export function shouldOfferResumePrompt(options: {
  prompted: boolean
  isLoadingSession: boolean
  pairKey: string | null
  currentSessionPairs: Set<string>
  session: Pick<SessionData, 'updatedAt' | 'baseTime'> | null
  now: number
}): boolean {
  const { prompted, isLoadingSession, pairKey, currentSessionPairs, session, now } = options
  if (prompted || isLoadingSession) return false
  if (!pairKey) return false
  if (currentSessionPairs.has(pairKey)) return false
  if (!session) return false
  if (now - session.updatedAt > TTL) return false
  return session.baseTime >= 5
}

async function openDB(): Promise<IDBDatabase> {
  if (db) return db
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      db = req.result
      resolve(db)
    }
    req.onupgradeneeded = () => {
      const database = req.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

async function saveSession(): Promise<void> {
  const key = getCurrentPairKey()
  if (!key) return
  const state = get()
  if (!state.synced) return
  const data: SessionData = {
    id: key,
    baseId: state.baseSource!.id,
    reactId: state.reactSource!.id,
    baseMeta: state.baseSource,
    reactMeta: state.reactSource,
    delay: state.delay,
    baseTime: getBaseCurrentTime(),
    baseVol: state.baseVolume,
    reactVol: state.reactVolume,
    playbackSpeed: state.playbackSpeed,
    position: state.reactPosition,
    updatedAt: Date.now()
  }
  try {
    const database = await openDB()
    const tx = database.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(data)
    await pruneOldSessions()
  } catch {
    saveToLocalStorage(data)
  }
}

function saveToLocalStorage(data: SessionData): void {
  try {
    localStorage.setItem(`rsync:${data.id}`, JSON.stringify(data))
  } catch {}
}

async function loadSession(key: string): Promise<SessionData | null> {
  try {
    const database = await openDB()
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(loadFromLocalStorage(key))
    })
  } catch {
    return loadFromLocalStorage(key)
  }
}

function loadFromLocalStorage(key: string): SessionData | null {
  try {
    const raw = localStorage.getItem(`rsync:${key}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function getLastSession(): Promise<SessionData | null> {
  try {
    const database = await openDB()
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.openCursor(null, 'prev')
      let latest: SessionData | null = null
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          const data = cursor.value as SessionData
          if (!latest || data.updatedAt > latest.updatedAt) {
            latest = data
          }
          cursor.continue()
        } else {
          resolve(latest)
        }
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function pruneOldSessions(): Promise<void> {
  try {
    const database = await openDB()
    const tx = database.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => {
      const all = req.result as SessionData[]
      const now = Date.now()
      const valid = all.filter(s => now - s.updatedAt < TTL)
      const sorted = valid.sort((a, b) => b.updatedAt - a.updatedAt)
      const keep = new Set(sorted.slice(0, MAX_SESSIONS).map(s => s.id))
      for (const s of all) {
        if (!keep.has(s.id)) {
          store.delete(s.id)
        }
      }
    }
  } catch {}
}

export async function clearSessions(): Promise<void> {
  try {
    const database = await openDB()
    const tx = database.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
  } catch {}
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('rsync:')) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch {}
}

export function startAutoSave(): void {
  if (saveIntervalId) return
  saveIntervalId = setInterval(() => {
    if (get().synced) saveSession()
  }, 10000)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && get().synced) saveSession()
  })
  window.addEventListener('beforeunload', () => {
    if (get().synced) saveSession()
  })
  document.addEventListener('saveNow', () => saveSession())
}

async function checkForResume(): Promise<void> {
  const key = getCurrentPairKey()
  const currentSessionPairs = getCurrentSessionPairs()
  if (!key || prompted || isLoadingSession || currentSessionPairs.has(key)) return
  
  const session = await loadSession(key)
  if (!shouldOfferResumePrompt({
    prompted,
    isLoadingSession,
    pairKey: key,
    currentSessionPairs,
    session,
    now: Date.now()
  })) return
  if (!session) return
  prompted = true
  showResumePrompt(
    session.baseTime,
    session.delay,
    () => applySession(session),
    () => {}
  )
}

function applySession(session: SessionData): void {
  finalizeSessionLoad(session)
}

export async function loadLastSession(): Promise<void> {
  const session = await getLastSession()
  if (!session) {
    showToast('No saved session found', 'info')
    return
  }
  isLoadingSession = true
  prompted = true // Prevent resume prompt from showing during load
  try {
    await loadSessionVideos(session)
  } finally {
    isLoadingSession = false
  }
}

async function loadSessionVideos(session: SessionData): Promise<void> {
  const { baseMeta, reactMeta, baseTime, delay } = session
  setPlaybackSpeed(session.playbackSpeed ?? 1.0)
  const needsBaseLocal = baseMeta?.type === 'local'
  const needsReactLocal = reactMeta?.type === 'local'
  
  try {
    if (baseMeta?.type === 'youtube') {
      const ytId = baseMeta.id.replace('yt:', '')
      await loadYouTubeVideo('base', ytId, baseTime)
    } else if (baseMeta?.type === 'url' && baseMeta.url) {
      await loadUrlVideo('base', baseMeta.url)
    }
    
    if (reactMeta?.type === 'youtube') {
      const ytId = reactMeta.id.replace('yt:', '')
      const reactTime = Math.max(0, baseTime + delay)
      await loadYouTubeVideo('react', ytId, reactTime)
    } else if (reactMeta?.type === 'url' && reactMeta.url) {
      await loadUrlVideo('react', reactMeta.url)
    }
    
    if (needsBaseLocal || needsReactLocal) {
      showLocalFilePrompt(session, needsBaseLocal, needsReactLocal)
    } else {
      finalizeSessionLoad(session)
    }
  } catch (err) {
    showToast('Failed to load session videos', 'error')
    console.error('loadSessionVideos error:', err)
  }
}

// Track file selection state for auto-close (Requirements 4.1, 4.2)
interface FileSelectionState {
  needsBase: boolean
  needsReact: boolean
  baseSelected: boolean
  reactSelected: boolean
}

export function areRequiredFilesSelected(state: FileSelectionState): boolean {
  return (!state.needsBase || state.baseSelected) && (!state.needsReact || state.reactSelected)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}

function showLocalFilePrompt(session: SessionData, needsBase: boolean, needsReact: boolean): void {
  const container = document.getElementById('resumePrompt')
  if (!container) return
  
  // Initialize file selection state based on what files are needed (Requirements 4.1, 4.2)
  const selectionState: FileSelectionState = {
    needsBase,
    needsReact,
    baseSelected: false,
    reactSelected: false
  }
  
  const baseFileName = session.baseMeta?.name || 'unknown'
  const reactFileName = session.reactMeta?.name || 'unknown'
  const baseFileNameSafe = escapeHtml(baseFileName)
  const reactFileNameSafe = escapeHtml(reactFileName)
  
  // Auto-close logic: evaluate selection state and close menu when all files selected
  // (Requirements 4.3, 4.4, 4.5)
  const checkAndAutoClose = () => {
    if (areRequiredFilesSelected(selectionState)) {
      container.classList.remove('open')
      finalizeSessionLoad(session)
    }
  }
  
  container.innerHTML = `
    <div class="resume-dialog">
      <h3>Select Local Files</h3>
      <p style="font-size:12px;opacity:0.8;margin-bottom:12px;">
        ${needsBase ? `Base: <b>${baseFileNameSafe}</b><br>` : ''}
        ${needsReact ? `React: <b>${reactFileNameSafe}</b>` : ''}
      </p>
      <div class="buttons" style="flex-wrap:wrap;gap:6px;">
        ${needsBase ? '<button class="pick-base" style="background:#2d5a">Pick Base</button>' : ''}
        ${needsReact ? '<button class="pick-react" style="background:#5a2d">Pick React</button>' : ''}
        <button class="done-btn" style="background:rgba(255,255,255,0.1)">Done</button>
      </div>
    </div>
  `
  container.classList.add('open')
  
  container.querySelector('.pick-base')?.addEventListener('click', async () => {
    const result = await promptLocalFile('base', baseFileName)
    // Track that base file has actually loaded.
    selectionState.baseSelected = selectionState.baseSelected || result.loaded
    // Check if all files are selected and auto-close (Requirements 4.3, 4.4, 4.5)
    checkAndAutoClose()
  })
  
  container.querySelector('.pick-react')?.addEventListener('click', async () => {
    const result = await promptLocalFile('react', reactFileName)
    // Track that react file has actually loaded.
    selectionState.reactSelected = selectionState.reactSelected || result.loaded
    // Check if all files are selected and auto-close (Requirements 4.3, 4.4, 4.5)
    checkAndAutoClose()
  })
  
  container.querySelector('.done-btn')?.addEventListener('click', () => {
    container.classList.remove('open')
    if (areRequiredFilesSelected(selectionState)) {
      finalizeSessionLoad(session)
      return
    }
    const missing: string[] = []
    if (selectionState.needsBase && !selectionState.baseSelected) missing.push('Base')
    if (selectionState.needsReact && !selectionState.reactSelected) missing.push('React')
    showToast(`Session restore skipped. Missing: ${missing.join(', ')}`, 'warning')
  })
}

// Apply seek time to both videos after they are ready
function applySeekTime(baseTime: number): void {
  syncSeek(true, baseTime)
}

// Apply volume to actual players (Requirements 3.1, 3.2)
function applyVolumeToPlayers(baseVol: number, reactVol: number): void {
  setBaseVolume(baseVol)
  setReactVolume(reactVol)
}

/**
 * Wait for a video element to be ready for seeking.
 * Listens for 'loadedmetadata' or 'canplay' events.
 * Returns immediately if video is already ready.
 */
function waitForVideoReady(video: HTMLVideoElement, timeoutMs: number = VIDEO_READY_TIMEOUT): Promise<boolean> {
  return new Promise((resolve) => {
    // Check if video is already ready (has metadata loaded)
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      resolve(true)
      return
    }

    let resolved = false
    const cleanup = () => {
      if (resolved) return
      resolved = true
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('error', onError)
    }

    const onReady = () => {
      cleanup()
      resolve(true)
    }

    const onError = () => {
      cleanup()
      resolve(false)
    }

    video.addEventListener('loadedmetadata', onReady)
    video.addEventListener('canplay', onReady)
    video.addEventListener('error', onError)

    // Timeout fallback
    setTimeout(() => {
      if (!resolved) {
        cleanup()
        // If video has some ready state, consider it ready enough
        resolve(video.readyState >= HTMLMediaElement.HAVE_METADATA)
      }
    }, timeoutMs)
  })
}

/**
 * Get the local video element for base or react player.
 * Returns null if the player is not a local video.
 */
function getLocalVideoElement(which: 'base' | 'react'): HTMLVideoElement | null {
  const player = which === 'base' ? getBasePlayer() : getReactPlayer()
  if (!player) return null
  
  const element = player.getElement()
  if (element instanceof HTMLVideoElement) {
    return element
  }
  return null
}

/**
 * Verify that a seek operation completed successfully.
 * Returns true if the video's currentTime is within tolerance of the target.
 */
function verifySeekCompleted(video: HTMLVideoElement, targetTime: number): boolean {
  const actualTime = video.currentTime
  const difference = Math.abs(actualTime - targetTime)
  return difference <= SEEK_VERIFY_TOLERANCE
}

/**
 * Attempt to seek a video with retry logic.
 * Uses exponential backoff between retries.
 */
async function seekWithRetry(
  video: HTMLVideoElement,
  targetTime: number,
  maxRetries: number = MAX_SEEK_RETRIES
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Perform the seek
    video.currentTime = Math.max(0, Math.min(targetTime, video.duration || targetTime))
    
    // Wait a bit for the seek to complete
    const backoffMs = Math.pow(2, attempt) * 100 // 100ms, 200ms, 400ms
    await new Promise(resolve => setTimeout(resolve, backoffMs))
    
    // Verify the seek completed
    if (verifySeekCompleted(video, targetTime)) {
      return true
    }
    
    console.warn(`Seek attempt ${attempt + 1} failed. Target: ${targetTime}, Actual: ${video.currentTime}`)
  }
  
  return false
}

type LocalVideoTargets = {
  baseVideo: HTMLVideoElement | null
  reactVideo: HTMLVideoElement | null
  baseTime: number
  reactTime: number
}

function getLocalVideoTargets(baseTime: number, delay: number): LocalVideoTargets {
  return {
    baseVideo: getLocalVideoElement('base'),
    reactVideo: getLocalVideoElement('react'),
    baseTime,
    reactTime: Math.max(0, baseTime + delay)
  }
}

async function waitForLocalVideosReady(targets: LocalVideoTargets): Promise<void> {
  const readinessChecks = [targets.baseVideo, targets.reactVideo]
    .filter((video): video is HTMLVideoElement => video !== null)
    .map((video) => waitForVideoReady(video))

  if (readinessChecks.length === 0) return

  const readyResults = await Promise.all(readinessChecks)
  if (!readyResults.every(Boolean)) {
    console.warn('Not all videos became ready, attempting seek anyway')
  }
}

async function seekLocalVideos(targets: LocalVideoTargets): Promise<void> {
  const seekOperations = [
    targets.baseVideo ? seekWithRetry(targets.baseVideo, targets.baseTime) : null,
    targets.reactVideo ? seekWithRetry(targets.reactVideo, targets.reactTime) : null
  ].filter((operation): operation is Promise<boolean> => operation !== null)

  if (seekOperations.length === 0) return

  const seekResults = await Promise.all(seekOperations)
  if (!seekResults.every(Boolean)) {
    console.warn('Some seek operations did not complete successfully')
  }
}

function seekRemotePlayers(targets: LocalVideoTargets): void {
  if (!targets.baseVideo) {
    getBasePlayer()?.seek(targets.baseTime)
  }

  if (!targets.reactVideo) {
    getReactPlayer()?.seek(targets.reactTime)
  }
}

/**
 * Wait for local videos to be ready and apply seek time.
 * Implements Requirements 2.4 and 2.5:
 * - Wait for both videos to be loaded before seeking
 * - Verify seek operations completed successfully
 */
async function applySeekTimeWithReadyCheck(baseTime: number, delay: number): Promise<void> {
  const targets = getLocalVideoTargets(baseTime, delay)
  const hasLocalBase = targets.baseVideo !== null
  const hasLocalReact = targets.reactVideo !== null

  if (!hasLocalBase && !hasLocalReact) {
    syncSeek(true, baseTime)
    return
  }

  await waitForLocalVideosReady(targets)
  seekRemotePlayers(targets)
  await seekLocalVideos(targets)
}

function finalizeSessionLoad(session: SessionData): void {
  setPlaybackSpeed(session.playbackSpeed ?? 1.0)
  setDelay(session.delay)
  set({
    baseVolume: session.baseVol,
    reactVolume: session.reactVol,
    reactPosition: session.position
  })
  
  const container = document.getElementById('videoReactContainer')
  if (container) {
    container.style.left = `${session.position.x}px`
    container.style.top = `${session.position.y}px`
    container.style.width = `${session.position.w}px`
    container.style.height = `${session.position.h}px`
  }
  
  // Apply volume to actual players (Requirements 3.1, 3.2)
  applyVolumeToPlayers(session.baseVol, session.reactVol)
  
  // Apply seek time after waiting for videos to be ready
  // Use a small initial delay to allow video elements to be set up
  setTimeout(() => {
    applySeekTimeWithReadyCheck(session.baseTime, session.delay)
      .catch(err => {
        console.error('Failed to apply seek time:', err)
        // Fallback to simple seek if the ready check fails
        applySeekTime(session.baseTime)
      })
  }, 100)
  
  showToast('Session restored', 'info', 3000)
}

export function onSourceChange(): void {
  if (isLoadingSession) return
  if (!prompted && get().baseSource && get().reactSource) {
    checkForResume()
    startAutoSave()
  }
}
