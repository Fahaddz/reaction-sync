declare namespace YT {
  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5
  }

  interface PlayerOptions {
    videoId?: string;
    height?: string | number;
    width?: string | number;
    playerVars?: {
      controls?: number;
      disablekb?: number;
      modestbranding?: number;
      rel?: number;
      enablejsapi?: number;
      playsinline?: number;
      iv_load_policy?: number;
      origin?: string;
    };
    events?: {
      onReady?: (event: OnReadyEvent) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
      onError?: (event: OnErrorEvent) => void;
    };
  }

  interface OnReadyEvent {
    target: Player;
  }

  interface OnStateChangeEvent {
    data: PlayerState;
    target: Player;
  }

  interface OnErrorEvent {
    data: number;
    target: Player;
  }

  interface VideoData {
    video_id: string;
    author: string;
    title: string;
  }

  interface CueVideoByIdOptions {
    videoId: string;
    startSeconds?: number;
    endSeconds?: number;
  }

  class Player {
    constructor(containerId: string, options: PlayerOptions);
    getVideoData(): VideoData;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): PlayerState;
    getAvailableQualityLevels(): string[];
    getPlaybackQuality(): string;
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    setVolume(volume: number): void;
    setPlaybackQuality(suggestedQuality: string): void;
    setSize(width: number, height: number): void;
    destroy(): void;
    addEventListener(event: string, listener: (event: any) => void): void;
    iframe?: HTMLIFrameElement;
  }
}

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
    youtubeAPIReady?: boolean;
  }
}


