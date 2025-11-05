export type VideoSource = 'local' | 'youtube' | 'direct' | 'realdebrid';

export type VideoState = 'playing' | 'paused' | 'buffering' | 'ended' | 'unstarted';

export interface VideoMetadata {
  id: string | null;
  type: VideoSource;
  url?: string;
  name?: string;
  size?: number;
  lastModified?: number;
}

export interface VideoInfo {
  element: HTMLVideoElement | null;
  youtubePlayer: YT.Player | null;
  source: VideoSource;
  metadata: VideoMetadata;
  currentTime: number;
  duration: number;
  state: VideoState;
  volume: number;
}

