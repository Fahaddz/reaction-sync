import { writable, get as svelteGet } from 'svelte/store'

export type VideoSource = {
  type: 'local' | 'youtube' | 'url'
  id: string
  name?: string
  url?: string
}

export type SyncHealth = 'healthy' | 'correcting' | 'drifting' | ''

export type InteractionState = 'idle' | 'seeking' | 'interacting'

export type ThresholdMode = 'tight' | 'loose' | 'adaptive'

export type SyncStats = {
  drift: number
  rate: number
  baseBuffering: boolean
  reactBuffering: boolean
  bufferPauseActive: boolean
  thresholdMode: ThresholdMode
  currentThreshold: number
}

export type State = {
  baseSource: VideoSource | null
  reactSource: VideoSource | null
  delay: number
  synced: boolean
  interactionState: InteractionState
  baseVolume: number
  reactVolume: number
  syncHealth: SyncHealth
  reactPosition: { x: number; y: number; w: number; h: number }
  lastInteractionTime: number
}

export const synced = writable(false)
export const delay = writable(0)
export const syncHealth = writable<SyncHealth>('')
export const baseVolume = writable(1)
export const reactVolume = writable(1)
export const baseSource = writable<VideoSource | null>(null)
export const reactSource = writable<VideoSource | null>(null)
export const reactPosition = writable({ x: 16, y: 16, w: 400, h: 225 })
export const interactionState = writable<InteractionState>('idle')
export const userSpeed = writable(1)
export const debugVisible = writable(false)
export const lastInteractionTime = writable(0)

export const syncStats = writable<SyncStats>({
  drift: 0,
  rate: 1,
  baseBuffering: false,
  reactBuffering: false,
  bufferPauseActive: false,
  thresholdMode: 'adaptive',
  currentThreshold: 0.05
})

type Listener = () => void
const listeners = new Set<Listener>()

export function get(): State {
  return {
    baseSource: svelteGet(baseSource),
    reactSource: svelteGet(reactSource),
    delay: svelteGet(delay),
    synced: svelteGet(synced),
    interactionState: svelteGet(interactionState),
    baseVolume: svelteGet(baseVolume),
    reactVolume: svelteGet(reactVolume),
    syncHealth: svelteGet(syncHealth),
    reactPosition: svelteGet(reactPosition),
    lastInteractionTime: svelteGet(lastInteractionTime)
  }
}

export function set(partial: Partial<State>): void {
  if (partial.baseSource !== undefined) baseSource.set(partial.baseSource)
  if (partial.reactSource !== undefined) reactSource.set(partial.reactSource)
  if (partial.delay !== undefined) delay.set(partial.delay)
  if (partial.synced !== undefined) synced.set(partial.synced)
  if (partial.interactionState !== undefined) interactionState.set(partial.interactionState)
  if (partial.baseVolume !== undefined) baseVolume.set(partial.baseVolume)
  if (partial.reactVolume !== undefined) reactVolume.set(partial.reactVolume)
  if (partial.syncHealth !== undefined) syncHealth.set(partial.syncHealth)
  if (partial.reactPosition !== undefined) reactPosition.set(partial.reactPosition)
  if (partial.lastInteractionTime !== undefined) lastInteractionTime.set(partial.lastInteractionTime)
  listeners.forEach(fn => fn())
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export type ToastType = 'info' | 'error' | 'warning'

export interface ToastItem {
  id: number
  message: string
  type: ToastType
}

export interface ResumePromptData {
  visible: boolean
  position: number
  delay: number
  onResume: () => void
}

let nextToastId = 0

export const toasts = writable<ToastItem[]>([])
export const tipsVisible = writable(true)
export const resumePromptData = writable<ResumePromptData>({
  visible: false,
  position: 0,
  delay: 0,
  onResume: () => {}
})

export function showToast(message: string, type: ToastType = 'info', duration = 3000): void {
  const id = nextToastId++
  toasts.update(t => [...t, { id, message, type }])
  setTimeout(() => {
    toasts.update(t => t.filter(toast => toast.id !== id))
  }, duration)
}

export function closeTipsScreen(): void {
  tipsVisible.set(false)
}

export function showResumePrompt(position: number, delay: number, onResume: () => void): void {
  resumePromptData.set({
    visible: true,
    position,
    delay,
    onResume
  })
}
