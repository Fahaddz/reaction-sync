export type VideoSource = {
  type: 'local' | 'youtube' | 'url'
  id: string
  name?: string
  url?: string
}

export type SyncHealth = 'healthy' | 'correcting' | 'drifting' | ''

export type State = {
  baseSource: VideoSource | null
  reactSource: VideoSource | null
  delay: number
  synced: boolean
  seeking: boolean
  userInteracting: boolean
  baseVolume: number
  reactVolume: number
  syncHealth: SyncHealth
  reactPosition: { x: number; y: number; w: number; h: number }
  lastInteractionTime: number
}

type Listener = () => void

const initialState: State = {
  baseSource: null,
  reactSource: null,
  delay: 0,
  synced: false,
  seeking: false,
  userInteracting: false,
  baseVolume: 1,
  reactVolume: 1,
  syncHealth: '',
  reactPosition: { x: 16, y: 16, w: 400, h: 225 },
  lastInteractionTime: 0
}

let state = { ...initialState }
const listeners = new Set<Listener>()

export function get(): State {
  return state
}

export function set(partial: Partial<State>): void {
  state = { ...state, ...partial }
  listeners.forEach(fn => fn())
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function reset(): void {
  state = { ...initialState }
  listeners.forEach(fn => fn())
}

