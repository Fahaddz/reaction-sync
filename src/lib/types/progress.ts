import type { VideoMetadata } from './video';

export interface ProgressRecord {
  baseId: string;
  reactId: string;
  baseMeta: VideoMetadata | null;
  reactMeta: VideoMetadata | null;
  delay: number;
  baseTime: number;
  pos: { l: number; t: number; w: number; h: number } | null;
  baseVol: number | null;
  reactVol: number | null;
}

export interface ProgressIndexEntry {
  k: string;
  t: number;
}

export type ProgressIndex = ProgressIndexEntry[];

