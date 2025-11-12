<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import BaseVideo from '../components/BaseVideo.svelte';
  import ReactVideo from '../components/ReactVideo.svelte';
  import ResumePrompt from '../components/ResumePrompt.svelte';
  import LoadLastPrompt from '../components/LoadLastPrompt.svelte';
  import DebugOverlay from '../components/DebugOverlay.svelte';
  import { syncState, syncInterval, enableSync, disableSync, setDelay, markSeeking, clearSeeking, markUserInteraction } from '$lib/stores/sync';
  import { baseVideo, reactVideo, loadBase, loadReact, updateBaseVolume, updateReactVolume } from '$lib/stores/video';
  import { selectFile, loadVideo, loadDirectLink, getCurrentTime, getDuration, isPlaying, play, pause, seek, setVolume, extractDelayFromFilename, getMetadataForFile, getMetadataForUrl, isHlsAttached } from '$lib/services/local-video';
  import { initializePlayer, getCurrentTime as getYTTime, getDuration as getYTDuration, getPlayerState, playVideo, pauseVideo, seekTo, setVolume as setYTVolume, getMetadataForYouTube } from '$lib/services/youtube';
  import { getYoutubeId } from '$lib/utils/youtube';
  import { loadSRT, srt2webvtt, attachSubtitles } from '$lib/services/subtitles';
  import { sigForLocal, sigForYouTube, sigForUrl, saveNow, startAutoSave, stopAutoSave, loadLastPair, clearAll, getPairKey } from '$lib/services/progress';
  import { waitForYouTubeAPI } from '$lib/utils/youtube';

  let syncEngine: any = null;
  let syncLoopInterval: ReturnType<typeof setInterval> | null = null;
  let syncIntervalUnsubscribe: (() => void) | null = null;
  let baseVideoElement: HTMLVideoElement | null = null;
  let reactVideoElement: HTMLVideoElement | null = null;
  let resumeRecord: any = null;
  let loadLastRecord: any = null;
  let showResumePrompt = false;
  let showLoadLastPrompt = false;
  let baseId: string | null = null;
  let reactId: string | null = null;
  let baseMeta: any = null;
  let reactMeta: any = null;
  let seekingTimeout: ReturnType<typeof setTimeout> | null = null;
  const SEEK_COOLDOWN = 800;

  function isHlsVideo(video: any, element: HTMLVideoElement | null): boolean {
    if (video.source === 'hls') return true;
    if (element && isHlsAttached(element)) return true;
    if (element && element.src && element.src.toLowerCase().includes('.m3u8')) return true;
    return false;
  }

  async function waitForHlsReady(element: HTMLVideoElement, timeout = 15000): Promise<void> {
    if (element.readyState >= 3) return;
    return new Promise((resolve) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        element.removeEventListener('canplay', onReady);
        element.removeEventListener('canplaythrough', onReady);
        clearTimeout(timer);
      };
      element.addEventListener('canplay', onReady);
      element.addEventListener('canplaythrough', onReady);
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, timeout);
    });
  }

  async function initWASM() {
    if (typeof window === 'undefined') return;
    try {
      const wasm = await import('$lib/sync-engine-wasm/pkg/sync_engine_wasm');
      await wasm.default();
      syncEngine = new wasm.SyncEngine();
    } catch (e) {
      console.error('Failed to initialize WASM:', e);
      alert('Failed to initialize sync engine. Sync functionality will not work. Please refresh the page.');
    }
  }

  function getBaseCurrentTime(): number {
    try {
      const video = $baseVideo;
      if (video.source === 'youtube' && video.youtubePlayer) {
        return getYTTime(video.youtubePlayer);
      } else if (video.element) {
        return getCurrentTime(video.element);
      }
    } catch (e) {
      console.error('Error getting base current time:', e);
    }
    return 0;
  }

  function getReactCurrentTime(): number {
    try {
      const video = $reactVideo;
      const el = video.element || reactVideoElement;
      if (video.source === 'youtube' && video.youtubePlayer) {
        return getYTTime(video.youtubePlayer);
      } else if (el) {
        return getCurrentTime(el);
      }
    } catch (e) {
      console.error('Error getting react current time:', e);
    }
    return 0;
  }

  function isBasePlaying(): boolean {
    try {
      const video = $baseVideo;
      if (video.source === 'youtube' && video.youtubePlayer) {
        return getPlayerState(video.youtubePlayer) === YT.PlayerState.PLAYING;
      } else if (video.element) {
        return isPlaying(video.element);
      }
    } catch (e) {
      console.error('Error checking base playing state:', e);
    }
    return false;
  }

  function isReactPlaying(): boolean {
    try {
      const video = $reactVideo;
      const el = video.element || reactVideoElement;
      if (video.source === 'youtube' && video.youtubePlayer) {
        return getPlayerState(video.youtubePlayer) === YT.PlayerState.PLAYING;
      } else if (el) {
        return isPlaying(el);
      }
    } catch (e) {
      console.error('Error checking react playing state:', e);
    }
    return false;
  }

  function isBaseBuffering(): boolean {
    try {
      const video = $baseVideo;
      if (video.source === 'youtube' && video.youtubePlayer) {
        return getPlayerState(video.youtubePlayer) === YT.PlayerState.BUFFERING;
      }
      if (video.element) {
        const el = video.element;
        return el.readyState < 3 || (el.networkState === 2 && !el.paused && el.currentTime === el.currentTime);
      }
    } catch {}
    return false;
  }

  function isReactBuffering(): boolean {
    try {
      const video = $reactVideo;
      if (video.source === 'youtube' && video.youtubePlayer) {
        return getPlayerState(video.youtubePlayer) === YT.PlayerState.BUFFERING;
      }
      const el = video.element || reactVideoElement;
      if (el) {
        return el.readyState < 3 || (el.networkState === 2 && !el.paused && el.currentTime === el.currentTime);
      }
    } catch {}
    return false;
  }

  function playBase(internal: boolean = false) {
    const attemptPlay = async (retries = 3) => {
      try {
        const video = $baseVideo;
        if (video.source === 'youtube' && video.youtubePlayer) {
          playVideo(video.youtubePlayer);
        } else if (video.element) {
          const el = video.element;
          if (el.readyState < 2 && retries > 0) {
            await new Promise((resolve) => {
              const onReady = () => {
                el.removeEventListener('canplay', onReady);
                resolve(null);
              };
              el.addEventListener('canplay', onReady);
              setTimeout(() => {
                el.removeEventListener('canplay', onReady);
                resolve(null);
              }, 200);
            });
            return attemptPlay(retries - 1);
          }
          await play(el);
        }
        if (!internal) markUserInteraction();
      } catch (e) {
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
          return attemptPlay(retries - 1);
        }
        console.error('Error playing base video:', e);
      }
    };
    attemptPlay();
  }

  function pauseBase(internal: boolean = false) {
    try {
      const video = $baseVideo;
      if (video.source === 'youtube' && video.youtubePlayer) {
        pauseVideo(video.youtubePlayer);
      } else if (video.element) {
        pause(video.element);
      }
      if (!internal) markUserInteraction();
    } catch (e) {
      console.error('Error pausing base video:', e);
    }
  }

  function playReact(internal: boolean = false) {
    const attemptPlay = async (retries = 3) => {
      try {
        const video = $reactVideo;
        const el = video.element || reactVideoElement;
        if (video.source === 'youtube' && video.youtubePlayer) {
          playVideo(video.youtubePlayer);
        } else if (el) {
          if (el.readyState < 2 && retries > 0) {
            await new Promise((resolve) => {
              const onReady = () => {
                el.removeEventListener('canplay', onReady);
                resolve(null);
              };
              el.addEventListener('canplay', onReady);
              setTimeout(() => {
                el.removeEventListener('canplay', onReady);
                resolve(null);
              }, 200);
            });
            return attemptPlay(retries - 1);
          }
          await play(el);
        }
        if (!internal) markUserInteraction();
      } catch (e) {
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
          return attemptPlay(retries - 1);
        }
        console.error('Error playing react video:', e);
      }
    };
    attemptPlay();
  }

  function pauseReact(internal: boolean = false) {
    try {
      const video = $reactVideo;
      const el = video.element || reactVideoElement;
      if (video.source === 'youtube' && video.youtubePlayer) {
        pauseVideo(video.youtubePlayer);
      } else if (el) {
        pause(el);
      }
      if (!internal) markUserInteraction();
    } catch (e) {
      console.error('Error pausing react video:', e);
    }
  }

  function seekBase(time: number, internal: boolean = false) {
    try {
      if (isNaN(time) || !isFinite(time)) return;
      const video = $baseVideo;
      const duration = video.source === 'youtube' && video.youtubePlayer ? getYTDuration(video.youtubePlayer) : (video.element ? getDuration(video.element) : 0);
      const clampedTime = Math.max(0, duration > 0 ? Math.min(time, duration) : time);
      if (video.source === 'youtube' && video.youtubePlayer) {
        seekTo(video.youtubePlayer, clampedTime);
      } else if (video.element) {
        seek(video.element, clampedTime);
      }
      if (!internal) {
        markSeeking('base');
        if (seekingTimeout) clearTimeout(seekingTimeout);
        seekingTimeout = setTimeout(() => {
          clearSeeking();
          syncVideos(true);
        }, SEEK_COOLDOWN);
      }
    } catch (e) {
      console.error('Error seeking base video:', e);
    }
  }

  function seekReact(time: number, internal: boolean = false) {
    try {
      if (isNaN(time) || !isFinite(time)) return;
      const video = $reactVideo;
      const el = video.element || reactVideoElement;
      const duration = video.source === 'youtube' && video.youtubePlayer ? getYTDuration(video.youtubePlayer) : (el ? getDuration(el) : 0);
      const clampedTime = Math.max(0, duration > 0 ? Math.min(time, duration) : time);
      if (video.source === 'youtube' && video.youtubePlayer) {
        seekTo(video.youtubePlayer, clampedTime);
      } else if (el) {
        seek(el, clampedTime);
      }
      if (!internal) {
        markSeeking('react');
        if (seekingTimeout) clearTimeout(seekingTimeout);
        seekingTimeout = setTimeout(() => {
          clearSeeking();
          syncVideos(true);
        }, SEEK_COOLDOWN);
      }
    } catch (e) {
      console.error('Error seeking react video:', e);
    }
  }

  async function syncPlay(sourceIsBase: boolean) {
    markUserInteraction();
    if ($syncState.isSynced) {
      const baseReady = $baseVideo.source === 'youtube' ? !!$baseVideo.youtubePlayer : ($baseVideo.element?.readyState ?? 0) >= 2;
      const reactEl = $reactVideo.element || reactVideoElement;
      const reactReady = $reactVideo.source === 'youtube' ? !!$reactVideo.youtubePlayer : (reactEl?.readyState ?? 0) >= 2;
      if (!baseReady || !reactReady) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      playBase(true);
      await new Promise(resolve => setTimeout(resolve, 50));
      playReact(true);
    } else {
      if (sourceIsBase) playBase(false);
      else playReact(false);
    }
  }

  function syncPause(sourceIsBase: boolean) {
    markUserInteraction();
    if ($syncState.isSynced) {
      pauseBase(true);
      pauseReact(true);
    } else {
      if (sourceIsBase) pauseBase(false);
      else pauseReact(false);
    }
  }

  function syncSeek(sourceIsBase: boolean, targetTime: number) {
    markSeeking(sourceIsBase ? 'base' : 'react');
    if (seekingTimeout) clearTimeout(seekingTimeout);
    const apply = async () => {
      if ($syncState.isSynced && syncEngine) {
        const wasPlaying = isBasePlaying();
        if (sourceIsBase) {
          seekBase(targetTime, true);
          seekReact(syncEngine.sync_seek_base(targetTime), true);
        } else {
          seekReact(targetTime, true);
          seekBase(syncEngine.sync_seek_react(targetTime), true);
        }
        const baseIsHls = isHlsVideo($baseVideo, $baseVideo.element);
        const reactEl = $reactVideo.element || reactVideoElement;
        const reactIsHls = isHlsVideo($reactVideo, reactEl);
        if (baseIsHls || reactIsHls) {
          pauseBase(true);
          pauseReact(true);
          const promises: Promise<void>[] = [];
          if (baseIsHls && $baseVideo.element) {
            promises.push(waitForHlsReady($baseVideo.element));
          }
          if (reactIsHls && reactEl) {
            promises.push(waitForHlsReady(reactEl));
          }
          await Promise.all(promises);
          if (wasPlaying) {
            await new Promise(resolve => setTimeout(resolve, 200));
            playBase(true);
            await new Promise(resolve => setTimeout(resolve, 50));
            playReact(true);
          }
        }
        clearSeeking();
        syncVideos(true);
      } else {
        sourceIsBase ? seekBase(targetTime, false) : seekReact(targetTime, false);
        setTimeout(() => clearSeeking(), SEEK_COOLDOWN);
      }
    };
    seekingTimeout = setTimeout(apply, 160);
  }

  function syncVideos(force: boolean = false) {
    if (!syncEngine || !$syncState.isSynced) return;
    if ($syncState.isSeeking && !force) return;
    if (isBaseBuffering() || isReactBuffering()) return;
    const timeSinceInteraction = Date.now() - $syncState.lastInteractionTime;
    if (!force && $syncState.isUserInteracting && timeSinceInteraction < SEEK_COOLDOWN * 2) return;
    const baseTime = getBaseCurrentTime();
    const reactTime = getReactCurrentTime();
    const baseIsPlaying = isBasePlaying();
    const reactIsPlaying = isReactPlaying();
    if (baseIsPlaying !== reactIsPlaying) return;
    syncEngine.set_delay($syncState.delay);
    syncEngine.set_synced($syncState.isSynced);
    syncEngine.mark_seeking($syncState.isSeeking ? ($syncState.seekingSource || 'sync') : '');
    syncEngine.mark_user_interaction();
    const adjustment = syncEngine.sync_videos(baseTime, reactTime, force);
    if (adjustment !== 0) {
      markSeeking('sync');
      seekReact(adjustment, true);
      setTimeout(clearSeeking, 400);
    }
  }

  function applyPosition(pos?: { l: number; t: number; w?: number; h?: number } | null) {
    if (!pos) return;
    const container = document.getElementById('videoReactContainer');
    if (!container) return;
    container.style.left = `${pos.l}px`;
    container.style.top = `${pos.t}px`;
    if (pos.w) container.style.width = `${pos.w}px`;
    if (pos.h) container.style.height = `${pos.h}px`;
  }

  function applyVolume(target: 'base' | 'react', volume?: number | null, delay = 0) {
    if (volume == null) return;
    if (target === 'base') {
      updateBaseVolume(volume);
    } else {
      updateReactVolume(volume);
    }
    const apply = () => {
      const state = target === 'base' ? $baseVideo : $reactVideo;
      if (state.source === 'youtube' && state.youtubePlayer) {
        setYTVolume(state.youtubePlayer, volume * 100);
      } else if (state.element) {
        setVolume(state.element, volume);
      }
    };
    if (delay > 0) setTimeout(apply, delay);
    else apply();
  }

  function scheduleResume(time: number | null | undefined, delay: number) {
    if (time == null) return;
    setTimeout(() => {
      const baseReady = $baseVideo.source === 'youtube' ? !!$baseVideo.youtubePlayer : !!$baseVideo.element;
      const reactReady = $reactVideo.source === 'youtube' ? !!$reactVideo.youtubePlayer : !!$reactVideo.element;
      if (!baseReady || !reactReady) {
        setTimeout(() => scheduleResume(time, 200), 200);
        return;
      }
      markSeeking('resume');
      syncSeek(true, time);
      syncState.update(s => ({ ...s, isSynced: true }));
      startSyncLoop();
      setTimeout(clearSeeking, 600);
    }, delay);
  }

  function startSyncLoop() {
    if (syncLoopInterval) clearInterval(syncLoopInterval);
    if (syncIntervalUnsubscribe) {
      syncIntervalUnsubscribe();
      syncIntervalUnsubscribe = null;
    }
    syncIntervalUnsubscribe = syncInterval.subscribe(interval => {
      if (syncLoopInterval) clearInterval(syncLoopInterval);
      syncLoopInterval = setInterval(() => {
        if ($syncState.isSynced) {
          syncVideos(false);
        }
      }, interval);
    });
  }

  function urlSource(original: string, resolved: string) {
    if (resolved.toLowerCase().includes('.m3u8')) return 'hls';
    return original.includes('real-debrid') ? 'realdebrid' : 'direct';
  }

  async function handleBaseSourceSelect(type: 'local' | 'link') {
    if (type === 'local') {
      const file = await selectFile();
      if (!file) return;
      const metadata = getMetadataForFile(file);
      baseMeta = metadata;
      baseId = sigForLocal(file);
      if (!baseVideoElement) {
        baseVideoElement = document.querySelector('#baseVideo') as HTMLVideoElement;
      }
      if (baseVideoElement) {
        loadVideo(baseVideoElement, file);
        loadBase(baseVideoElement, null, metadata, 'local');
        const delay = extractDelayFromFilename(file.name);
        if (delay !== null) setDelay(delay);
      }
    } else {
      const url = prompt("Enter YouTube URL or direct video link:");
      if (!url) return;
      const youtubeId = getYoutubeId(url);
      if (youtubeId) {
        await waitForYouTubeAPI();
        try {
          const player = await initializePlayer(youtubeId, false);
          const metadata = { ...getMetadataForYouTube(youtubeId), originalUrl: url };
          baseMeta = metadata;
          baseId = sigForYouTube(player);
          loadBase(null, player, metadata, 'youtube');
        } catch (e) {
          console.error('Failed to initialize YouTube player:', e);
        }
      } else {
        let metadata = getMetadataForUrl(url);
        baseId = sigForUrl(url);
        if (!baseVideoElement) {
          baseVideoElement = document.querySelector('#baseVideo') as HTMLVideoElement;
        }
        if (baseVideoElement) {
          const resolved = await loadDirectLink(baseVideoElement, url);
          const source = urlSource(url, resolved);
          metadata = { ...metadata, originalUrl: url, resolvedUrl: resolved, type: source, source };
          baseMeta = metadata;
          loadBase(baseVideoElement, null, metadata, source);
          const delay = extractDelayFromFilename(url);
          if (delay !== null) setDelay(delay);
        }
      }
    }
    checkAndShowResumePrompt();
  }

  async function handleReactSourceSelect(type: 'local' | 'link') {
    if (type === 'local') {
      const file = await selectFile();
      if (!file) return;
      const metadata = getMetadataForFile(file);
      reactMeta = metadata;
      reactId = sigForLocal(file);
      if (!reactVideoElement) {
        reactVideoElement = document.querySelector('#reactVideo') as HTMLVideoElement;
      }
      if (reactVideoElement) {
        loadVideo(reactVideoElement, file);
        loadReact(reactVideoElement, null, metadata, 'local');
        const delay = extractDelayFromFilename(file.name);
        if (delay !== null) setDelay(delay);
      }
    } else {
      const url = prompt("Enter YouTube URL or direct video link:");
      if (!url) return;
      const youtubeId = getYoutubeId(url);
      if (youtubeId) {
        await waitForYouTubeAPI();
        try {
          const player = await initializePlayer(youtubeId, true);
          const metadata = { ...getMetadataForYouTube(youtubeId), originalUrl: url };
          reactMeta = metadata;
          reactId = sigForYouTube(player);
          loadReact(reactVideoElement, player, metadata, 'youtube');
        } catch (e) {
          console.error('Failed to initialize YouTube player:', e);
        }
      } else {
        let metadata = getMetadataForUrl(url);
        reactId = sigForUrl(url);
        if (!reactVideoElement) {
          reactVideoElement = document.querySelector('#reactVideo') as HTMLVideoElement;
        }
        if (reactVideoElement) {
          const resolved = await loadDirectLink(reactVideoElement, url);
          const source = urlSource(url, resolved);
          metadata = { ...metadata, originalUrl: url, resolvedUrl: resolved, type: source, source };
          reactMeta = metadata;
          loadReact(reactVideoElement, null, metadata, source);
          const delay = extractDelayFromFilename(url);
          if (delay !== null) setDelay(delay);
        }
      }
    }
    checkAndShowResumePrompt();
  }

  async function handleLoadSubtitles() {
    const file = await selectFile();
    if (!file) return;
    const srt = await loadSRT(file);
    const webvtt = srt2webvtt(srt);
    if (baseVideoElement) {
      attachSubtitles(baseVideoElement, webvtt);
    }
  }

  function handleSave() {
    const baseVol = $baseVideo.volume;
    const reactVol = $reactVideo.volume;
    const success = saveNow(baseId, reactId, baseMeta, reactMeta, $syncState.delay, getBaseCurrentTime(), baseVol, reactVol);
    if (success) {
      alert('Progress saved successfully!');
    } else {
      alert('Failed to save progress. Please try again.');
    }
  }

  async function handleLoadLast() {
    const record = loadLastPair();
    if (!record) {
      alert('No saved progress found');
      return;
    }
    
    const needBaseFile = record.baseMeta?.type === 'local';
    const needReactFile = record.reactMeta?.type === 'local';
    
    if (needBaseFile || needReactFile) {
      loadLastRecord = record;
      showLoadLastPrompt = true;
      return;
    }
    
    await loadLastRecordVideos(record);
  }
  
  async function loadLastRecordVideos(record: any) {
    if (!record) return;
    
    const savedDelay = record.delay ?? 0;
    const savedBaseTime = record.baseTime ?? 0;
    
    console.log('Loading with saved delay:', savedDelay, 'base time:', savedBaseTime);
    setDelay(savedDelay);
    
    let basePlayer: YT.Player | null = null;
    let reactPlayer: YT.Player | null = null;
    let baseVideoId = '';
    let reactVideoId = '';
    
    if (record.baseMeta) {
      const meta = record.baseMeta;
      if (meta.type === 'youtube') {
        baseVideoId = meta.videoId || (meta.id && typeof meta.id === 'string' ? meta.id.replace(/^yt:/, '') : '');
        if (baseVideoId) {
          await waitForYouTubeAPI();
          try {
            basePlayer = await initializePlayer(baseVideoId, false, null);
            baseMeta = { ...meta, videoId: baseVideoId, originalUrl: meta.originalUrl || meta.url };
            baseId = sigForYouTube(basePlayer);
            loadBase(null, basePlayer, baseMeta, 'youtube');
          } catch (e) {
            alert('Failed to load base YouTube video: ' + e);
            return;
          }
        }
      } else if (meta.type === 'direct' || meta.type === 'realdebrid' || meta.type === 'hls') {
        const sourceUrl = meta.originalUrl || meta.url || meta.resolvedUrl;
        if (sourceUrl) {
          baseId = sigForUrl(sourceUrl);
          if (!baseVideoElement) {
            baseVideoElement = document.querySelector('#baseVideo') as HTMLVideoElement;
          }
          if (baseVideoElement) {
            const resolved = await loadDirectLink(baseVideoElement, sourceUrl);
            const source = urlSource(sourceUrl, resolved);
            const metadata = { ...meta, originalUrl: sourceUrl, resolvedUrl: resolved, type: source, source };
            baseMeta = metadata;
            loadBase(baseVideoElement, null, metadata, source);
          }
        }
      }
    }
    
    if (record.reactMeta) {
      const meta = record.reactMeta;
      if (meta.type === 'youtube') {
        reactVideoId = meta.videoId || (meta.id && typeof meta.id === 'string' ? meta.id.replace(/^yt:/, '') : '');
        if (reactVideoId) {
          await waitForYouTubeAPI();
          try {
            reactPlayer = await initializePlayer(reactVideoId, true, null);
            reactMeta = { ...meta, videoId: reactVideoId, originalUrl: meta.originalUrl || meta.url };
            reactId = sigForYouTube(reactPlayer);
            loadReact(reactVideoElement, reactPlayer, reactMeta, 'youtube');
          } catch (e) {
            alert('Failed to load react YouTube video: ' + e);
            return;
          }
        }
      } else if (meta.type === 'direct' || meta.type === 'realdebrid' || meta.type === 'hls') {
        const sourceUrl = meta.originalUrl || meta.url || meta.resolvedUrl;
        if (sourceUrl) {
          reactId = sigForUrl(sourceUrl);
          if (!reactVideoElement) {
            reactVideoElement = document.querySelector('#reactVideo') as HTMLVideoElement;
          }
          if (reactVideoElement) {
            const resolved = await loadDirectLink(reactVideoElement, sourceUrl);
            const source = urlSource(sourceUrl, resolved);
            const metadata = { ...meta, originalUrl: sourceUrl, resolvedUrl: resolved, type: source, source };
            reactMeta = metadata;
            loadReact(reactVideoElement, null, metadata, source);
          }
        }
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    if (basePlayer && baseVideoId) {
      console.log('Loading base YouTube video at time:', savedBaseTime);
      try {
        basePlayer.loadVideoById({ videoId: baseVideoId, startSeconds: savedBaseTime });
        await new Promise(resolve => setTimeout(resolve, 1500));
        pauseVideo(basePlayer);
      } catch (e) {
        console.error('Error loading base video:', e);
        alert('Failed to load base video at saved position');
      }
    } else if (baseVideoElement) {
      seek(baseVideoElement, savedBaseTime);
    }
    
    if (reactPlayer && reactVideoId) {
      const reactStartTime = savedBaseTime + savedDelay;
      console.log('Loading react YouTube video at time:', reactStartTime, '(base:', savedBaseTime, '+ delay:', savedDelay, ')');
      try {
        reactPlayer.loadVideoById({ videoId: reactVideoId, startSeconds: reactStartTime });
        await new Promise(resolve => setTimeout(resolve, 1500));
        pauseVideo(reactPlayer);
      } catch (e) {
        console.error('Error loading react video:', e);
        alert('Failed to load react video at saved position');
      }
    } else if (reactVideoElement) {
      seek(reactVideoElement, savedBaseTime + savedDelay);
    }
    
    console.log('Setting final delay to:', savedDelay);
    setDelay(savedDelay);
    applyPosition(record.pos);
    applyVolume('base', record.baseVol, 100);
    applyVolume('react', record.reactVol, 100);
    
    setTimeout(() => {
      console.log('Enabling sync with delay:', savedDelay);
      syncState.update(s => ({ ...s, isSynced: true, delay: savedDelay }));
      startSyncLoop();
    }, 500);
  }

  function handleClearSaved() {
    if (confirm('Clear saved video progress?')) {
      clearAll();
      alert('Saved progress cleared.');
    }
  }

  function handleForceResync() {
    if (!syncEngine || !$syncState.isSynced) return;
    const wasPlaying = isBasePlaying();
    const reactTime = getReactCurrentTime();
    const targetBaseTime = syncEngine.sync_seek_react(reactTime);
    if (wasPlaying) {
      pauseBase(true);
      pauseReact(true);
    }
    markSeeking('sync');
    seekBase(targetBaseTime, true);
    setTimeout(() => {
      clearSeeking();
      syncVideos(true);
      if (wasPlaying) {
        setTimeout(() => {
          playBase(true);
          playReact(true);
        }, 200);
      }
    }, 400);
  }

  async function handleEnableSync() {
    const baseTime = getBaseCurrentTime();
    const reactTime = getReactCurrentTime();
    const wasPlaying = isBasePlaying() || isReactPlaying();
    enableSync(baseTime, reactTime);
    startSyncLoop();
    if (wasPlaying) {
      await new Promise(resolve => setTimeout(resolve, 100));
      playBase(true);
      await new Promise(resolve => setTimeout(resolve, 50));
      playReact(true);
    }
  }

  function handleDisableSync() {
    disableSync();
    if (syncLoopInterval) {
      clearInterval(syncLoopInterval);
      syncLoopInterval = null;
    }
    if (syncIntervalUnsubscribe) {
      syncIntervalUnsubscribe();
      syncIntervalUnsubscribe = null;
    }
  }

  function handleDelayChange(newDelay: number) {
    if (!$syncState.isSynced) return;
    const baseTime = getBaseCurrentTime();
    const newReactTime = baseTime + newDelay;
    seekReact(newReactTime, true);
  }

  async function checkAndShowResumePrompt() {
    if (!baseId || !reactId) return;
    const key = getPairKey(baseId, reactId);
    if (!key) return;
    const { readPair } = await import('$lib/services/progress');
    const record = readPair(key);
    if (record) {
      resumeRecord = record;
      showResumePrompt = true;
    }
  }

  function handleResume() {
    if (!resumeRecord) return;
    const baseReady = $baseVideo.source === 'youtube' ? !!$baseVideo.youtubePlayer : !!$baseVideo.element;
    const reactReady = $reactVideo.source === 'youtube' ? !!$reactVideo.youtubePlayer : !!$reactVideo.element;
    if (!baseReady || !reactReady) {
      alert('Please wait for both videos to load before resuming.');
      return;
    }
    setDelay(resumeRecord.delay);
    applyPosition(resumeRecord.pos);
    applyVolume('base', resumeRecord.baseVol);
    applyVolume('react', resumeRecord.reactVol);
    scheduleResume(resumeRecord.baseTime, 500);
    showResumePrompt = false;
    resumeRecord = null;
  }

  function handleStartNew() {
    if (resumeRecord) {
      const key = getPairKey(baseId, reactId);
      if (key) {
        try {
          localStorage.removeItem(key);
        } catch {}
      }
    }
    showResumePrompt = false;
    resumeRecord = null;
  }

  function handleKeyboard(e: KeyboardEvent) {
    const activeElement = document.activeElement;
    const isInput = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA' || (activeElement as HTMLElement)?.isContentEditable;
    if (isInput) return;

    if (e.key === 's' || e.key === 'S') {
      const baseTime = getBaseCurrentTime();
      const reactTime = getReactCurrentTime();
      enableSync(baseTime, reactTime);
      startSyncLoop();
      e.preventDefault();
    } else if (e.key === 'd' || e.key === 'D') {
      disableSync();
      if (syncLoopInterval) {
        clearInterval(syncLoopInterval);
        syncLoopInterval = null;
      }
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
      if ($syncState.isSynced) {
        if (isBasePlaying()) {
          syncPause(true);
        } else {
          syncPlay(true);
        }
        e.preventDefault();
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const seekAmount = e.key === 'ArrowLeft' ? -5 : 5;
      if ($syncState.isSynced) {
        const currentTime = getBaseCurrentTime();
        syncSeek(true, currentTime + seekAmount);
      } else {
        if (e.shiftKey) {
          seekReact(getReactCurrentTime() + seekAmount);
        } else {
          seekBase(getBaseCurrentTime() + seekAmount);
        }
      }
      e.preventDefault();
    } else if (e.key === 'PageUp' || e.keyCode === 33) {
      if ($syncState.isSynced) {
        setDelay($syncState.delay - 0.1);
        e.preventDefault();
      }
    } else if (e.key === 'PageDown' || e.keyCode === 34) {
      if ($syncState.isSynced) {
        setDelay($syncState.delay + 0.1);
        e.preventDefault();
      }
    }
  }

  onMount(async () => {
    if (typeof window === 'undefined') return;
    await initWASM();
    window.addEventListener('keydown', handleKeyboard);
    startAutoSave(() => ({
      baseId,
      reactId,
      baseMeta,
      reactMeta,
      delay: $syncState.delay,
      baseTime: getBaseCurrentTime(),
      baseVol: $baseVideo.volume,
      reactVol: $reactVideo.volume
    }));
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeyboard);
    }
    stopAutoSave();
    if (syncLoopInterval) {
      clearInterval(syncLoopInterval);
      syncLoopInterval = null;
    }
    if (syncIntervalUnsubscribe) {
      syncIntervalUnsubscribe();
      syncIntervalUnsubscribe = null;
    }
    if (seekingTimeout) {
      clearTimeout(seekingTimeout);
      seekingTimeout = null;
    }
  });
</script>

<svelte:window on:resize={() => {}} />

<div>
  <BaseVideo
    on:playPause={async () => {
      if ($syncState.isSynced) {
        const actuallyPlaying = isBasePlaying();
        if (actuallyPlaying) {
          syncPause(true);
        } else {
          await syncPlay(true);
        }
      } else {
        if (isBasePlaying()) pauseBase(false);
        else playBase(false);
      }
    }}
    on:seek={(e) => syncSeek(true, e.detail)}
    on:volumeChange={(e) => updateBaseVolume(e.detail)}
    onSourceSelect={handleBaseSourceSelect}
    onSave={handleSave}
    onLoadLast={handleLoadLast}
    onClearSaved={handleClearSaved}
    onLoadSubtitles={handleLoadSubtitles}
    onForceResync={handleForceResync}
    onEnableSync={handleEnableSync}
    onDisableSync={handleDisableSync}
    onDelayChange={handleDelayChange}
  />

  <ReactVideo
    on:playPause={async () => {
      if ($syncState.isSynced) {
        const actuallyPlaying = isReactPlaying();
        if (actuallyPlaying) {
          syncPause(false);
        } else {
          await syncPlay(false);
        }
      } else {
        if (isReactPlaying()) pauseReact(false);
        else playReact(false);
      }
    }}
    on:seek={(e) => syncSeek(false, e.detail)}
    on:volumeChange={(e) => updateReactVolume(e.detail)}
    onSourceSelect={handleReactSourceSelect}
  />

  {#if showResumePrompt && resumeRecord}
    <ResumePrompt
      record={resumeRecord}
      onResume={handleResume}
      onStartNew={handleStartNew}
    />
  {/if}

  {#if showLoadLastPrompt && loadLastRecord}
    <LoadLastPrompt
      record={loadLastRecord}
      onChooseBase={async () => {
        const record = loadLastRecord;
        if (record && record.delay != null) {
          setDelay(record.delay);
        }
        await handleBaseSourceSelect('local');
        if (record) {
          setTimeout(() => {
            applyPosition(record.pos);
            applyVolume('base', record.baseVol, 500);
            applyVolume('react', record.reactVol, 500);
            scheduleResume(record.baseTime, 1000);
          }, 500);
          showLoadLastPrompt = false;
          loadLastRecord = null;
        }
      }}
      onChooseReact={async () => {
        const record = loadLastRecord;
        if (record && record.delay != null) {
          setDelay(record.delay);
        }
        await handleReactSourceSelect('local');
        if (record) {
          setTimeout(() => {
            applyPosition(record.pos);
            applyVolume('base', record.baseVol, 500);
            applyVolume('react', record.reactVol, 500);
            scheduleResume(record.baseTime, 1000);
          }, 500);
          showLoadLastPrompt = false;
          loadLastRecord = null;
        }
      }}
      onClose={() => { showLoadLastPrompt = false; loadLastRecord = null; }}
    />
  {/if}

  <DebugOverlay />
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
</style>

