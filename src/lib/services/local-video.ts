import { checkCodecSupport, showCodecError } from '../utils/codec';
import Hls from 'hls.js';
import { isJellyfinDownload, jellyfinManifest } from './jellyfin';
import type { VideoMetadata, VideoSource } from '../types/video';

export async function selectFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "*";
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

const hlsStore = new WeakMap<HTMLVideoElement, Hls>();

export function isHlsAttached(element: HTMLVideoElement): boolean {
  return hlsStore.has(element);
}

function destroyHls(element: HTMLVideoElement) {
  const instance = hlsStore.get(element);
  if (instance) {
    instance.destroy();
    hlsStore.delete(element);
  }
}

export function cleanupHls(element: HTMLVideoElement | null) {
  if (element) {
    destroyHls(element);
  }
}

export function loadVideo(element: HTMLVideoElement, file: File): void {
  destroyHls(element);
  element.src = URL.createObjectURL(file);
  element.load();
  document.title = file.name;
}

function supportsNativeHls(element: HTMLVideoElement) {
  return element.canPlayType('application/vnd.apple.mpegurl');
}

async function tryAttachHls(element: HTMLVideoElement, src: string): Promise<boolean> {
  destroyHls(element);
  if (supportsNativeHls(element)) {
    element.src = src;
    element.load();
    return new Promise((resolve) => {
      const onReady = () => {
        element.removeEventListener('loadedmetadata', onReady);
        element.removeEventListener('error', onError);
        resolve(true);
      };
      const onError = () => {
        element.removeEventListener('loadedmetadata', onReady);
        element.removeEventListener('error', onError);
        resolve(false);
      };
      element.addEventListener('loadedmetadata', onReady);
      element.addEventListener('error', onError);
      setTimeout(() => {
        element.removeEventListener('loadedmetadata', onReady);
        element.removeEventListener('error', onError);
        resolve(element.readyState >= 1);
      }, 5000);
    });
  }
  if (Hls.isSupported()) {
    return new Promise((resolve) => {
      const instance = new Hls();
      let resolved = false;
      const finish = (success: boolean) => {
        if (resolved) return;
        resolved = true;
        if (success) {
          hlsStore.set(element, instance);
        } else {
          instance.destroy();
        }
        resolve(success);
      };
      instance.on(Hls.Events.MANIFEST_PARSED, () => finish(true));
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) finish(false);
      });
      instance.loadSource(src);
      instance.attachMedia(element);
      setTimeout(() => finish(instance.media !== null), 10000);
    });
  }
  return false;
}

export async function loadDirectLink(element: HTMLVideoElement, url: string): Promise<string> {
  destroyHls(element);
  let target = url;
  if (isJellyfinDownload(url)) {
    const manifestPromise = jellyfinManifest(url);
    const timeoutPromise = new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 10000));
    const manifest = await Promise.race([manifestPromise, timeoutPromise]);
    if (manifest) target = manifest;
    else if (url !== target) console.warn('Jellyfin manifest fetch timed out, using original URL');
  }
  if (target.toLowerCase().endsWith('.m3u8')) {
    const attached = await tryAttachHls(element, target);
    if (!attached) {
      console.warn('HLS attachment failed, falling back to direct src');
      element.src = target;
      element.load();
    }
  } else {
    element.src = target;
    element.load();
  }
  await new Promise<void>((resolve) => {
    if (element.readyState >= 2) {
      resolve();
      return;
    }
    const onReady = () => {
      element.removeEventListener('loadeddata', onReady);
      element.removeEventListener('canplay', onReady);
      clearTimeout(timeout);
      resolve();
    };
    element.addEventListener('loadeddata', onReady);
    element.addEventListener('canplay', onReady);
    const timeout = setTimeout(() => {
      element.removeEventListener('loadeddata', onReady);
      element.removeEventListener('canplay', onReady);
      resolve();
    }, 8000);
  });
  try {
    const urlObj = new URL(url);
    const filename = urlObj.pathname.split('/').pop() || 'Direct Video Link';
    document.title = filename;
  } catch {
    document.title = 'Direct Video Link';
  }
  return target;
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
    source: 'local',
    name: file.name,
    size: file.size,
    lastModified: file.lastModified
  };
}

function urlType(url: string): VideoSource {
  if (url.includes('real-debrid')) return 'realdebrid';
  if (url.toLowerCase().includes('.m3u8')) return 'hls';
  return 'direct';
}

export function getMetadataForUrl(url: string): VideoMetadata {
  const type = urlType(url);
  return {
    id: `url:${url}`,
    type,
    source: type,
    url,
    originalUrl: url,
    resolvedUrl: url
  };
}

