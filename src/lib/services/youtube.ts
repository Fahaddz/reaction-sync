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
let baseRetryCount = 0;
let reactRetryCount = 0;
let baseInitializing = false;
let reactInitializing = false;
let baseInitPromise: Promise<YT.Player> | null = null;
let reactInitPromise: Promise<YT.Player> | null = null;

export function initializePlayer(videoId: string, isReaction: boolean, startSeconds: number | null = null): Promise<YT.Player> {
  if (isReaction && reactInitializing && reactInitPromise) {
    return reactInitPromise;
  }
  if (!isReaction && baseInitializing && baseInitPromise) {
    return baseInitPromise;
  }
  
  const promise = new Promise<YT.Player>(async (resolve, reject) => {
    if (isReaction) {
      reactInitializing = true;
    } else {
      baseInitializing = true;
    }
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
              reactRetryCount = 0;
              reactInitializing = false;
            } else {
              basePlayer = event.target;
              baseRetryCount = 0;
              baseInitializing = false;
            }
            if (startSeconds != null && isFinite(startSeconds) && startSeconds >= 0) {
              try {
                player.loadVideoById({ videoId: videoId, startSeconds: startSeconds });
              } catch (e) {}
            }
            resolve(event.target);
          },
          onStateChange: (event) => {
            handleStateChange(event, isReaction);
          },
          onError: (event) => {
            if (isReaction) {
              reactInitializing = false;
            } else {
              baseInitializing = false;
            }
            handleError(event.data, isReaction);
            reject(new Error(`YouTube error: ${event.data}`));
          }
        }
      });
    } catch (e) {
      if (isReaction) {
        reactInitializing = false;
      } else {
        baseInitializing = false;
      }
      reject(new Error(`Failed to create YouTube player: ${e}`));
    }
  });
  
  if (isReaction) {
    reactInitPromise = promise;
    promise.finally(() => {
      reactInitPromise = null;
    });
  } else {
    baseInitPromise = promise;
    promise.finally(() => {
      baseInitPromise = null;
    });
  }
  
  return promise;
}

function handleStateChange(event: YT.OnStateChangeEvent, isReaction: boolean): void {
  if (event.data === YT.PlayerState.PLAYING) {
    if (isReaction) {
      reactRetryCount = 0;
    } else {
      baseRetryCount = 0;
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
    reactPlayer = null;
  } else {
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

export function getQualityLabel(quality: string): string {
  return qualityLabels[quality] || quality;
}

export function getMetadataForYouTube(videoId: string): VideoMetadata {
  return {
    id: `yt:${videoId}`,
    type: 'youtube',
    source: 'youtube',
    videoId
  };
}

