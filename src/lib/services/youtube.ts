import { waitForYouTubeAPI } from '../utils/youtube';
import type { VideoMetadata } from '../types/video';

const MAX_RETRIES = 3;
const qualityLabels: Record<string, string> = {
  'highres': '4K (2160p)',
  'hd2160': '4K (2160p)',
  'hd1440': 'QHD (1440p)',
  'hd1080': 'Full HD (1080p)',
  'hd720': 'HD (720p)',
  'large': '480p',
  'medium': '360p',
  'small': '240p',
  'tiny': '144p',
  'default': 'Auto',
  'auto': 'Auto'
};

let basePlayer: YT.Player | null = null;
let reactPlayer: YT.Player | null = null;
let baseReady = false;
let reactReady = false;
let baseRetryCount = 0;
let reactRetryCount = 0;

export function initializePlayer(videoId: string, isReaction: boolean, startSeconds: number | null = null): Promise<YT.Player> {
  return new Promise(async (resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('YouTube player requires browser environment'));
      return;
    }
    
    await waitForYouTubeAPI();
    const containerId = isReaction ? 'videoReactYoutube' : 'videoBaseYoutube';
    
    let container = document.getElementById(containerId);
    if (!container) {
      let attempts = 0;
      while (!container && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        container = document.getElementById(containerId);
        attempts++;
      }
    }
    
    if (!container) {
      reject(new Error(`Container ${containerId} not found`));
      return;
    }
    
    if (isReaction && reactPlayer) {
      try {
        reactPlayer.destroy();
        reactPlayer = null;
      } catch (e) {
        console.error('Error destroying reaction player:', e);
      }
    } else if (!isReaction && basePlayer) {
      try {
        basePlayer.destroy();
        basePlayer = null;
      } catch (e) {
        console.error('Error destroying base player:', e);
      }
    }

    container.innerHTML = '';
    container.style.display = 'block';
    
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const player = new YT.Player(containerId, {
        videoId: videoId,
        height: '100%',
        width: '100%',
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          enablejsapi: 1,
          playsinline: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: (event) => {
            if (isReaction) {
              reactPlayer = event.target;
              reactReady = true;
              reactRetryCount = 0;
            } else {
              basePlayer = event.target;
              baseReady = true;
              baseRetryCount = 0;
            }
            if (startSeconds != null && isFinite(startSeconds) && startSeconds >= 0) {
              try {
                player.cueVideoById({ videoId: videoId, startSeconds: startSeconds });
              } catch (e) {}
            }
            resolve(event.target);
          },
          onStateChange: (event) => {
            handleStateChange(event, isReaction);
          },
          onError: (event) => {
            handleError(event.data, isReaction);
            reject(new Error(`YouTube error: ${event.data}`));
          }
        }
      });
    } catch (e) {
      reject(new Error(`Failed to create YouTube player: ${e}`));
    }
  });
}

function handleStateChange(event: YT.OnStateChangeEvent, isReaction: boolean): void {
  const state = event.data;
  if (state === YT.PlayerState.BUFFERING) {
    if (window.isVideosSynced) {
      if (isReaction && window.pauseBase) {
        window.pauseBase(true);
      } else if (!isReaction && window.pauseReact) {
        window.pauseReact(true);
      }
    }
  } else if (state === YT.PlayerState.PLAYING) {
    if (isReaction) {
      reactRetryCount = 0;
    } else {
      baseRetryCount = 0;
    }
    if (window.isVideosSynced && window.syncPlay && !window.isSeeking) {
      setTimeout(() => {
        if (window.isVideosSynced && !window.isSeeking) {
          window.syncPlay(isReaction);
        }
      }, 50);
    }
  } else if (state === YT.PlayerState.PAUSED) {
    if (window.isVideosSynced && window.syncPause && !window.isSeeking) {
      setTimeout(() => {
        if (window.isVideosSynced && !window.isSeeking) {
          window.syncPause(isReaction);
        }
      }, 50);
    }
  }
}

function handleError(errorCode: number, isReaction: boolean): void {
  const errors: Record<number, string> = {
    2: "Invalid URL parameters",
    5: "HTML5 player error",
    100: "Video not found",
    101: "Embedding disabled",
    150: "Embedding disabled"
  };
  
  const retryCount = isReaction ? reactRetryCount : baseRetryCount;
  if (retryCount < MAX_RETRIES) {
    if (isReaction) {
      reactRetryCount++;
    } else {
      baseRetryCount++;
    }
    const player = isReaction ? reactPlayer : basePlayer;
    if (player && player.getVideoData) {
      const videoId = player.getVideoData().video_id;
      if (videoId) {
        setTimeout(() => {
          initializePlayer(videoId, isReaction).catch(() => {});
        }, 2000 * (retryCount + 1));
        return;
      }
    }
  }
  alert(`YouTube ${isReaction ? 'Reaction' : 'Base'} Error: ${errors[errorCode] || "Unknown error"} (Failed after ${MAX_RETRIES} retries)`);
  if (isReaction) {
    reactReady = false;
    reactPlayer = null;
  } else {
    baseReady = false;
    basePlayer = null;
  }
}

export function getCurrentTime(player: YT.Player): number {
  try {
    const time = player.getCurrentTime();
    return isNaN(time) || time < 0 ? 0 : time;
  } catch {
    return 0;
  }
}

export function getDuration(player: YT.Player): number {
  try {
    const duration = player.getDuration();
    return isNaN(duration) || duration <= 0 ? 0 : duration;
  } catch {
    return 0;
  }
}

export function getPlayerState(player: YT.Player): YT.PlayerState {
  try {
    return player.getPlayerState();
  } catch {
    return YT.PlayerState.UNSTARTED;
  }
}

export function playVideo(player: YT.Player): void {
  try {
    player.playVideo();
    setTimeout(() => {
      if (player.getPlayerState() !== YT.PlayerState.PLAYING) {
        player.playVideo();
      }
    }, 100);
  } catch (e) {
    console.error('Error playing YouTube video:', e);
  }
}

export function pauseVideo(player: YT.Player): void {
  try {
    player.pauseVideo();
    setTimeout(() => {
      if (player.getPlayerState() === YT.PlayerState.PLAYING) {
        player.pauseVideo();
      }
    }, 100);
  } catch (e) {
    console.error('Error pausing YouTube video:', e);
  }
}

export function seekTo(player: YT.Player, time: number): void {
  try {
    player.seekTo(time, true);
    setTimeout(() => {
      if (Math.abs(getCurrentTime(player) - time) > 0.5) {
        player.seekTo(time, true);
      }
    }, 200);
  } catch (e) {
    console.error('Error seeking YouTube video:', e);
  }
}

export function setVolume(player: YT.Player, volume: number): void {
  try {
    player.setVolume(Math.max(0, Math.min(100, volume)));
  } catch (e) {
    console.error('Error setting YouTube volume:', e);
  }
}

export function setQuality(player: YT.Player, quality: string): void {
  try {
    player.setPlaybackQuality(quality === 'auto' ? 'default' : quality);
  } catch (e) {
    console.error('Error setting YouTube quality:', e);
  }
}

export function getAvailableQualities(player: YT.Player): string[] {
  try {
    return player.getAvailableQualityLevels();
  } catch {
    return [];
  }
}

export function getCurrentQuality(player: YT.Player): string {
  try {
    return player.getPlaybackQuality();
  } catch {
    return 'default';
  }
}

export function setHighestQuality(player: YT.Player): void {
  const preferredOrder = ['highres', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  const available = getAvailableQualities(player);
  if (available.length === 0) return;
  
  let highestQuality = 'default';
  for (const quality of preferredOrder) {
    if (available.includes(quality)) {
      highestQuality = quality;
      break;
    }
  }
  
  let retryCount = 0;
  const maxRetries = 3;
  function trySetQuality() {
    setQuality(player, highestQuality);
    setTimeout(() => {
      const current = getCurrentQuality(player);
      if (current !== highestQuality && available.includes(highestQuality) && retryCount < maxRetries) {
        retryCount++;
        trySetQuality();
      }
    }, 1000);
  }
  trySetQuality();
}

export function getQualityLabel(quality: string): string {
  return qualityLabels[quality] || quality;
}

export function getBasePlayer(): YT.Player | null {
  return basePlayer;
}

export function getReactPlayer(): YT.Player | null {
  return reactPlayer;
}

export function isBaseReady(): boolean {
  return baseReady && basePlayer !== null;
}

export function isReactReady(): boolean {
  return reactReady && reactPlayer !== null;
}

export function getMetadataForYouTube(videoId: string): VideoMetadata {
  return {
    id: `yt:${videoId}`,
    type: 'youtube'
  };
}

declare global {
  interface Window {
    isVideosSynced: boolean;
    isSeeking: boolean;
    syncPlay: (isReaction: boolean) => void;
    syncPause: (isReaction: boolean) => void;
    pauseBase: (internal: boolean) => void;
    pauseReact: (internal: boolean) => void;
  }
}

