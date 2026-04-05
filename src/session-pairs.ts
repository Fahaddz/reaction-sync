import { get } from './state.ts'

const currentSessionPairs = new Set<string>()

export function getCurrentPairKey(): string | null {
  const { baseSource, reactSource } = get()
  if (!baseSource || !reactSource) return null
  return `${baseSource.id}||${reactSource.id}`
}

export function getCurrentSessionPairs(): Set<string> {
  return currentSessionPairs
}

export function markPairAsNew(): void {
  const key = getCurrentPairKey()
  if (key) {
    currentSessionPairs.add(key)
  }
}
