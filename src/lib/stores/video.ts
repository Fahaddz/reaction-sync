import { writable, derived, type Writable } from 'svelte/store';
import type { VideoInfo, VideoMetadata } from '../types/video';

export const baseVideo: Writable<VideoInfo> = writable({
  element: null,
  youtubePlayer: null,
  source: 'local',
  metadata: { id: null, type: 'local' },
  currentTime: 0,
  duration: 0,
  state: 'unstarted',
  volume: 1
});

export const reactVideo: Writable<VideoInfo> = writable({
  element: null,
  youtubePlayer: null,
  source: 'local',
  metadata: { id: null, type: 'local' },
  currentTime: 0,
  duration: 0,
  state: 'unstarted',
  volume: 1
});

export const isBaseReady = derived(baseVideo, ($video) => {
  if ($video.source === 'youtube') {
    return $video.youtubePlayer !== null;
  }
  return $video.element !== null && $video.element.readyState >= 1;
});

export const isReactReady = derived(reactVideo, ($video) => {
  if ($video.source === 'youtube') {
    return $video.youtubePlayer !== null;
  }
  return $video.element !== null && $video.element.readyState >= 1;
});

export function loadBase(element: HTMLVideoElement | null, youtubePlayer: YT.Player | null, metadata: VideoMetadata, source: 'local' | 'youtube' | 'direct' | 'realdebrid'): void {
  baseVideo.set({
    element,
    youtubePlayer,
    source,
    metadata,
    currentTime: 0,
    duration: 0,
    state: 'unstarted',
    volume: 1
  });
}

export function loadReact(element: HTMLVideoElement | null, youtubePlayer: YT.Player | null, metadata: VideoMetadata, source: 'local' | 'youtube' | 'direct' | 'realdebrid'): void {
  reactVideo.set({
    element,
    youtubePlayer,
    source,
    metadata,
    currentTime: 0,
    duration: 0,
    state: 'unstarted',
    volume: 1
  });
}

export function updateBaseTime(time: number): void {
  baseVideo.update(v => ({ ...v, currentTime: time }));
}

export function updateReactTime(time: number): void {
  reactVideo.update(v => ({ ...v, currentTime: time }));
}

export function updateBaseDuration(duration: number): void {
  baseVideo.update(v => ({ ...v, duration }));
}

export function updateReactDuration(duration: number): void {
  reactVideo.update(v => ({ ...v, duration }));
}

export function updateBaseState(state: 'playing' | 'paused' | 'buffering' | 'ended' | 'unstarted'): void {
  baseVideo.update(v => ({ ...v, state }));
}

export function updateReactState(state: 'playing' | 'paused' | 'buffering' | 'ended' | 'unstarted'): void {
  reactVideo.update(v => ({ ...v, state }));
}

export function updateBaseVolume(volume: number): void {
  baseVideo.update(v => ({ ...v, volume }));
}

export function updateReactVolume(volume: number): void {
  reactVideo.update(v => ({ ...v, volume }));
}

