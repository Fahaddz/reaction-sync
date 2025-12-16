import { get, set, type VideoSource } from './state.ts'
import { getBaseCurrentTime, setDelay, syncSeek } from './sync.ts'
import { showResumePrompt, loadYouTubeVideo, loadUrlVideo, promptLocalFile, showToast } from './ui/index.ts'

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

function getPairKey(): string | null {
  const { baseSource, reactSource } = get()
  if (!baseSource || !reactSource) return null
  return `${baseSource.id}||${reactSource.id}`
}

export async function saveSession(): Promise<void> {
  const key = getPairKey()
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

export async function checkForResume(): Promise<void> {
  if (prompted || isLoadingSession) return
  const key = getPairKey()
  if (!key) return
  const session = await loadSession(key)
  if (!session) return
  if (Date.now() - session.updatedAt > TTL) return
  // Only show resume if we have meaningful progress (at least 5 seconds watched)
  if (session.baseTime < 5) return
  prompted = true
  showResumePrompt(
    session.baseTime,
    session.delay,
    () => applySession(session),
    () => {}
  )
}

function applySession(session: SessionData): void {
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
  setTimeout(() => syncSeek(true, session.baseTime), 200)
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

function showLocalFilePrompt(session: SessionData, needsBase: boolean, needsReact: boolean): void {
  const container = document.getElementById('resumePrompt')
  if (!container) return
  
  const baseFileName = session.baseMeta?.name || 'unknown'
  const reactFileName = session.reactMeta?.name || 'unknown'
  
  container.innerHTML = `
    <div class="resume-dialog">
      <h3>Select Local Files</h3>
      <p style="font-size:12px;opacity:0.8;margin-bottom:12px;">
        ${needsBase ? `Base: <b>${baseFileName}</b><br>` : ''}
        ${needsReact ? `React: <b>${reactFileName}</b>` : ''}
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
    await promptLocalFile('base', baseFileName)
  })
  
  container.querySelector('.pick-react')?.addEventListener('click', async () => {
    await promptLocalFile('react', reactFileName)
  })
  
  container.querySelector('.done-btn')?.addEventListener('click', () => {
    container.classList.remove('open')
    finalizeSessionLoad(session)
  })
}

function finalizeSessionLoad(session: SessionData): void {
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
  
  showToast('Session restored - press S to sync', 'info', 4000)
}

export function onSourceChange(): void {
  if (isLoadingSession) return
  if (!prompted && get().baseSource && get().reactSource) {
    checkForResume()
    startAutoSave()
  }
}
