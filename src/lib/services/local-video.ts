import { checkCodecSupport, showCodecError } from '../utils/codec';
import type { VideoMetadata } from '../types/video';

export async function selectFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      if (files.length === 0) {
        resolve(null);
        return;
      }
      const file = files[0];
      const support = await checkCodecSupport(file);
      if (!support.supported && support.reason) {
        showCodecError(support.reason);
        resolve(null);
        return;
      }
      resolve(file);
    };
    setTimeout(() => input.click(), 0);
  });
}

export function loadVideo(element: HTMLVideoElement, file: File): void {
  element.src = URL.createObjectURL(file);
  element.load();
  document.title = file.name;
}

export function loadDirectLink(element: HTMLVideoElement, url: string): void {
  element.src = url;
  element.load();
  try {
    const urlObj = new URL(url);
    const filename = urlObj.pathname.split('/').pop() || 'Direct Video Link';
    document.title = filename;
  } catch {
    document.title = 'Direct Video Link';
  }
}

export function getCurrentTime(element: HTMLVideoElement): number {
  return isNaN(element.currentTime) ? 0 : Math.max(0, element.currentTime);
}

export function getDuration(element: HTMLVideoElement): number {
  return isNaN(element.duration) || element.duration <= 0 ? 0 : element.duration;
}

export function isPlaying(element: HTMLVideoElement): boolean {
  return !element.paused;
}

export async function play(element: HTMLVideoElement): Promise<void> {
  try {
    await element.play();
  } catch (e) {
    console.error("Error playing video:", e);
  }
}

export function pause(element: HTMLVideoElement): void {
  element.pause();
}

export function seek(element: HTMLVideoElement, time: number): void {
  const duration = getDuration(element);
  const clampedTime = Math.max(0, duration > 0 ? Math.min(time, duration) : time);
  if (element.fastSeek) {
    try {
      element.fastSeek(clampedTime);
    } catch {
      element.currentTime = clampedTime;
    }
  } else {
    element.currentTime = clampedTime;
  }
}

export function setVolume(element: HTMLVideoElement, volume: number): void {
  element.volume = Math.max(0, Math.min(1, volume));
}

export function extractDelayFromFilename(filename: string): number | null {
  const tokens = filename.split(".");
  const num = tokens.find(token => token.split("dt")[0] == "" && !isNaN(Number(token.split("dt")[1])));
  if (num) {
    const delayValue = Number(num.split("dt")[1]);
    return delayValue / 10;
  }
  return null;
}

export function getMetadataForFile(file: File): VideoMetadata {
  return {
    id: `file:${file.name}|${file.size}|${file.lastModified}`,
    type: 'local',
    name: file.name,
    size: file.size,
    lastModified: file.lastModified
  };
}

export function getMetadataForUrl(url: string): VideoMetadata {
  return {
    id: `url:${url}`,
    type: url.includes('real-debrid') ? 'realdebrid' : 'direct',
    url: url
  };
}

