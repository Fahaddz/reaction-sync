export interface ProgressRecord {
  baseId: string;
  reactId: string;
  baseMeta: { type: string; name?: string; id?: string; url?: string } | null;
  reactMeta: { type: string; name?: string; id?: string; url?: string } | null;
  delay: number;
  baseTime: number;
  pos: { l: number; t: number; w: number; h: number } | null;
  baseVol: number | null;
  reactVol: number | null;
  updatedAt: number;
}

export interface ProgressIndexEntry {
  k: string;
  t: number;
}

export type ProgressIndex = ProgressIndexEntry[];

