export interface SyncState {
  isSynced: boolean;
  delay: number;
  isSeeking: boolean;
  isUserInteracting: boolean;
  lastInteractionTime: number;
  seekingSource: 'base' | 'react' | 'sync' | null;
}

export interface SyncConfig {
  threshold: number;
  interval: number;
  seekCooldown: number;
  minThreshold: number;
  maxThreshold: number;
}

