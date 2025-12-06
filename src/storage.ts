import { get, set, type VideoSource } from './state.ts'
import { getBaseCurrentTime, setDelay, syncSeek } from './sync.ts'
import { showResumePrompt, loadYouTubeVideo, loadUrlVideo, promptLocalFile, loadLocalVideo, showToast } from './ui.ts'

const DB_NAME = 'reaction-sync-v2'
const STORE_NAME = 'sessions'
const DB_VERSION = 1

interface SessionData {
  id: string
  timestamp: number
  baseTime: number
  delay: number
  baseVol: number
  reactVol: number
  position: { x: number; y: number; w: number; h: number }
  baseMeta: VideoSource | null
  reactMeta: VideoSource | null
}

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const database = req.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => {
      db = req.result
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

async function saveSession(session: SessionData): Promise<void> {
  try {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(session)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    localStorage.setItem('reaction-sync-session', JSON.stringify(session))
  }
}

async function loadSession(): Promise<SessionData | null> {
  try {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get('current')
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    const stored = localStorage.getItem('reaction-sync-session')
    return stored ? JSON.parse(stored) : null
  }
}

async function clearSession(): Promise<void> {
  try {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete('current')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    localStorage.removeItem('reaction-sync-session')
  }
}

function getCurrentSession(): SessionData {
  const state = get()
  return {
    id: 'current',
    timestamp: Date.now(),
    baseTime: getBaseCurrentTime(),
    delay: state.delay,
    baseVol: state.baseVolume,
    reactVol: state.reactVolume,
    position: state.reactPosition,
    baseMeta: state.baseSource,
    reactMeta: state.reactSource
  }
}

async function loadVideoSource(which: 'base' | 'react', meta: VideoSource, startTime?: number): Promise<void> {
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

async function applySession(session: SessionData): Promise<void> {
  if (session.baseMeta) {
    await loadVideoSource('base', session.baseMeta, session.baseTime)
  }
  if (session.reactMeta) {
    await loadVideoSource('react', session.reactMeta)
  }
  finalizeSessionLoad(session)
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

export async function initStorage(): Promise<void> {
  await openDB()

  let autoSaveInterval: ReturnType<typeof setInterval> | null = null

  const startAutoSave = () => {
    if (autoSaveInterval) return
    autoSaveInterval = setInterval(() => {
      const state = get()
      if (state.baseSource || state.reactSource) {
        saveSession(getCurrentSession())
      }
    }, 10000)
  }

  document.addEventListener('saveNow', () => {
    saveSession(getCurrentSession())
  })

  const session = await loadSession()
  if (session && (session.baseMeta || session.reactMeta)) {
    showResumePrompt(
      'Resume previous session?',
      async () => {
        await applySession(session)
        startAutoSave()
      },
      () => startAutoSave()
    )
  } else {
    startAutoSave()
  }

  document.getElementById('loadLastPairBtn')?.addEventListener('click', async () => {
    const savedSession = await loadSession()
    if (savedSession) {
      await applySession(savedSession)
    } else {
      showToast('No saved session found', 'error')
    }
  })

  document.getElementById('clearStorageBtn')?.addEventListener('click', async () => {
    await clearSession()
    showToast('Saved data cleared', 'info')
  })
}

