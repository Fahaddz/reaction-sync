<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import BaseVideo from '../components/BaseVideo.svelte';
  import ReactVideo from '../components/ReactVideo.svelte';
  import ResumePrompt from '../components/ResumePrompt.svelte';
  import LoadLastPrompt from '../components/LoadLastPrompt.svelte';
  import DebugOverlay from '../components/DebugOverlay.svelte';
  import { syncState, syncInterval, enableSync, disableSync, setDelay, markSeeking, clearSeeking, markUserInteraction } from '$lib/stores/sync';
  import { baseVideo, reactVideo, loadBase, loadReact, updateBaseVolume, updateReactVolume } from '$lib/stores/video';
  import { selectFile, loadVideo, loadDirectLink, getCurrentTime, getDuration, isPlaying, play, pause, seek, setVolume, extractDelayFromFilename, getMetadataForFile, getMetadataForUrl } from '$lib/services/local-video';
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
  const MAX_RESYNC_ATTEMPTS = 3;
  const RESYNC_DELAY = 250;
  let resyncToken = 0;
  let lastBufferHold = 0;

  async function initWASM() {
    if (typeof window === 'undefined') return;
    try {
      const wasm = await import('$lib/sync-engine-wasm/pkg/sync_engine_wasm');
      await wasm.default();
      syncEngine = new wasm.SyncEngine();
    } catch (e) {
      console.error('Failed to initialize WASM:', e);
    }
  }

  function startTightSyncSequence() {
    if (!syncEngine || !$syncState.isSynced) return;
    resyncToken += 1;
    const token = resyncToken;
    queueTightSync(0, token);
  }

  function queueTightSync(attempt: number, token: number) {
    if (!syncEngine || !$syncState.isSynced) return;
    if (token !== resyncToken) return;
    if (attempt >= MAX_RESYNC_ATTEMPTS) return;
    const threshold = typeof syncEngine.get_sync_threshold === 'function' ? syncEngine.get_sync_threshold() : 0.35;
    const desiredReactTime = getBaseCurrentTime() + $syncState.delay;
    const reactTime = getReactCurrentTime();
    const diff = Math.abs(reactTime - desiredReactTime);
    const ratio = attempt === 0 ? 0.75 : 0.5;

    if (diff > threshold * ratio) {
      setTimeout(() => {
        if (!$syncState.isSynced || token !== resyncToken) return;
        syncVideos(true);
        queueTightSync(attempt + 1, token);
      }, RESYNC_DELAY * (attempt + 1));
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

  function playBase(internal: boolean = false) {
    try {
      const video = $baseVideo;
      if (video.source === 'youtube' && video.youtubePlayer) {
        playVideo(video.youtubePlayer);
      } else if (video.element) {
        play(video.element);
      }
      if (!internal) markUserInteraction();
    } catch (e) {
      console.error('Error playing base video:', e);
    }
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
    try {
      const video = $reactVideo;
      const el = video.element || reactVideoElement;
      if (video.source === 'youtube' && video.youtubePlayer) {
        playVideo(video.youtubePlayer);
      } else if (el) {
        play(el);
      }
      if (!internal) markUserInteraction();
    } catch (e) {
      console.error('Error playing react video:', e);
    }
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
      const video = $baseVideo;
      if (video.source === 'youtube' && video.youtubePlayer) {
        seekTo(video.youtubePlayer, time);
      } else if (video.element) {
        seek(video.element, time);
      }
      if (!internal) {
        markSeeking('base');
        if (seekingTimeout) clearTimeout(seekingTimeout);
        seekingTimeout = setTimeout(() => {
          clearSeeking();
          syncVideos(true);
          if ($syncState.isSynced) {
            startTightSyncSequence();
          }
        }, SEEK_COOLDOWN);
      }
    } catch (e) {
      console.error('Error seeking base video:', e);
    }
  }

  function seekReact(time: number, internal: boolean = false) {
    try {
      const video = $reactVideo;
      const el = video.element || reactVideoElement;
      if (video.source === 'youtube' && video.youtubePlayer) {
        seekTo(video.youtubePlayer, time);
      } else if (el) {
        seek(el, time);
      }
      if (!internal) {
        markSeeking('react');
        if (seekingTimeout) clearTimeout(seekingTimeout);
        seekingTimeout = setTimeout(() => {
          clearSeeking();
          syncVideos(true);
          if ($syncState.isSynced) {
            startTightSyncSequence();
          }
        }, SEEK_COOLDOWN);
      }
    } catch (e) {
      console.error('Error seeking react video:', e);
    }
  }

  function syncPlay(sourceIsBase: boolean) {
    markUserInteraction();
    if ($syncState.isSynced) {
      playBase(true);
      playReact(true);
      setTimeout(() => {
        if ($syncState.isSynced && (!isBasePlaying() || !isReactPlaying())) {
          if (!isBasePlaying()) playBase(true);
          if (!isReactPlaying()) playReact(true);
        }
        startTightSyncSequence();
      }, 300);
      startTightSyncSequence();
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
      setTimeout(() => {
        if ($syncState.isSynced && (isBasePlaying() || isReactPlaying())) {
          if (isBasePlaying()) pauseBase(true);
          if (isReactPlaying()) pauseReact(true);
        }
      }, 300);
    } else {
      if (sourceIsBase) pauseBase(false);
      else pauseReact(false);
    }
  }

  function syncSeek(sourceIsBase: boolean, targetTime: number) {
    markSeeking(sourceIsBase ? 'base' : 'react');
    if ($syncState.isSynced && syncEngine) {
      if (sourceIsBase) {
        const reactTarget = syncEngine.sync_seek_base(targetTime);
        seekBase(targetTime, true);
        setTimeout(() => {
          if ($syncState.isSeeking && $syncState.isSynced) {
            seekReact(reactTarget, true);
          }
        }, 150);
      } else {
        const baseTarget = syncEngine.sync_seek_react(targetTime);
        seekReact(targetTime, true);
        setTimeout(() => {
          if ($syncState.isSeeking && $syncState.isSynced) {
            seekBase(baseTarget, true);
          }
        }, 150);
      }
    } else {
      if (sourceIsBase) seekBase(targetTime, false);
      else seekReact(targetTime, false);
    }
    if (seekingTimeout) clearTimeout(seekingTimeout);
    seekingTimeout = setTimeout(() => {
      clearSeeking();
      syncVideos(true);
      startTightSyncSequence();
    }, SEEK_COOLDOWN);
  }

  function syncVideos(force: boolean = false) {
    if (!syncEngine || !$syncState.isSynced) return;
    if ($syncState.isSeeking && !force) return;
    const timeSinceInteraction = Date.now() - $syncState.lastInteractionTime;
    if (!force && $syncState.isUserInteracting && timeSinceInteraction < SEEK_COOLDOWN * 2) return;

    const baseTime = getBaseCurrentTime();
    const reactTime = getReactCurrentTime();
    const baseIsPlaying = isBasePlaying();
    const reactIsPlaying = isReactPlaying();
    const reactInfo = $reactVideo;
    const threshold = typeof syncEngine.get_sync_threshold === 'function' ? syncEngine.get_sync_threshold() : 0.35;
    const desiredReactTime = baseTime + $syncState.delay;
    const absDiff = Math.abs(reactTime - desiredReactTime);

    if (baseIsPlaying !== reactIsPlaying) {
      if (baseIsPlaying) playReact(true);
      else pauseReact(true);
      setTimeout(() => {
        if ($syncState.isSynced && (isBasePlaying() !== isReactPlaying())) {
          if (baseIsPlaying) playReact(true);
          else pauseReact(true);
        }
      }, 150);
    }

    if (baseIsPlaying && reactInfo.state === 'buffering' && absDiff > threshold * 1.2) {
      const now = Date.now();
      if (now - lastBufferHold > 400) {
        lastBufferHold = now;
        pauseBase(true);
        setTimeout(() => {
          if (!$syncState.isSynced) return;
          const latestReact = $reactVideo;
          if (!isReactPlaying() && latestReact.state !== 'buffering') {
            playReact(true);
          }
          const newDiff = Math.abs(getReactCurrentTime() - (getBaseCurrentTime() + $syncState.delay));
          if (newDiff <= threshold * 0.9 && !isBasePlaying()) {
            playBase(true);
          } else if (latestReact.state !== 'buffering') {
            playBase(true);
          }
        }, 220);
      }
    }

    syncEngine.set_delay($syncState.delay);
    syncEngine.set_synced($syncState.isSynced);
    syncEngine.mark_seeking($syncState.isSeeking ? ($syncState.seekingSource || 'sync') : '');
    syncEngine.mark_user_interaction();
    const adjustment = syncEngine.sync_videos(baseTime, reactTime, force);

    if (adjustment !== 0 && (force || (baseIsPlaying && reactIsPlaying))) {
      markSeeking('sync');
      seekReact(adjustment, true);
      setTimeout(() => {
        clearSeeking();
      }, 500);
    } else if (force && adjustment === 0 && absDiff > threshold * 0.75) {
      markSeeking('sync');
      seekReact(desiredReactTime, true);
      setTimeout(() => {
        clearSeeking();
      }, 500);
    }
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
          const metadata = getMetadataForYouTube(youtubeId);
          baseMeta = metadata;
          baseId = sigForYouTube(player);
          loadBase(null, player, metadata, 'youtube');
        } catch (e) {
          console.error('Failed to initialize YouTube player:', e);
        }
      } else {
        const metadata = getMetadataForUrl(url);
        baseMeta = metadata;
        baseId = sigForUrl(url);
        if (!baseVideoElement) {
          baseVideoElement = document.querySelector('#baseVideo') as HTMLVideoElement;
        }
        if (baseVideoElement) {
          loadDirectLink(baseVideoElement, url);
          loadBase(baseVideoElement, null, metadata, url.includes('real-debrid') ? 'realdebrid' : 'direct');
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
          const metadata = getMetadataForYouTube(youtubeId);
          reactMeta = metadata;
          reactId = sigForYouTube(player);
          loadReact(reactVideoElement, player, metadata, 'youtube');
        } catch (e) {
          console.error('Failed to initialize YouTube player:', e);
        }
      } else {
        const metadata = getMetadataForUrl(url);
        reactMeta = metadata;
        reactId = sigForUrl(url);
        if (!reactVideoElement) {
          reactVideoElement = document.querySelector('#reactVideo') as HTMLVideoElement;
        }
        if (reactVideoElement) {
          loadDirectLink(reactVideoElement, url);
          loadReact(reactVideoElement, null, metadata, url.includes('real-debrid') ? 'realdebrid' : 'direct');
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
    saveNow(baseId, reactId, baseMeta, reactMeta, $syncState.delay, getBaseCurrentTime(), baseVol, reactVol);
  }

  async function handleLoadLast() {
    const record = loadLastPair();
    if (!record) {
      alert('No saved progress found');
      return;
    }
    
    const needBaseFile = record.baseMeta?.type === 'file';
    const needReactFile = record.reactMeta?.type === 'file';
    
    if (needBaseFile || needReactFile) {
      loadLastRecord = record;
      showLoadLastPrompt = true;
      return;
    }
    
    await loadLastRecordVideos(record);
  }
  
  async function loadLastRecordVideos(record: any) {
    if (!record) return;
    
    if (record.baseMeta) {
      if (record.baseMeta.type === 'youtube' && record.baseMeta.id) {
        await waitForYouTubeAPI();
        try {
          const player = await initializePlayer(record.baseMeta.id, false);
          baseMeta = record.baseMeta;
          baseId = sigForYouTube(player);
          loadBase(null, player, baseMeta, 'youtube');
        } catch (e) {
          console.error('Failed to load YouTube base video:', e);
        }
      } else if (record.baseMeta.type === 'url' && record.baseMeta.url) {
        const metadata = getMetadataForUrl(record.baseMeta.url);
        baseMeta = metadata;
        baseId = sigForUrl(record.baseMeta.url);
        if (!baseVideoElement) {
          baseVideoElement = document.querySelector('#baseVideo') as HTMLVideoElement;
        }
        if (baseVideoElement) {
          loadDirectLink(baseVideoElement, record.baseMeta.url);
          loadBase(baseVideoElement, null, baseMeta, record.baseMeta.url.includes('real-debrid') ? 'realdebrid' : 'direct');
        }
      }
    }
    
    if (record.reactMeta) {
      if (record.reactMeta.type === 'youtube' && record.reactMeta.id) {
        await waitForYouTubeAPI();
        try {
          const player = await initializePlayer(record.reactMeta.id, true);
          reactMeta = record.reactMeta;
          reactId = sigForYouTube(player);
          loadReact(reactVideoElement, player, reactMeta, 'youtube');
        } catch (e) {
          console.error('Failed to load YouTube react video:', e);
        }
      } else if (record.reactMeta.type === 'url' && record.reactMeta.url) {
        const metadata = getMetadataForUrl(record.reactMeta.url);
        reactMeta = metadata;
        reactId = sigForUrl(record.reactMeta.url);
        if (!reactVideoElement) {
          reactVideoElement = document.querySelector('#reactVideo') as HTMLVideoElement;
        }
        if (reactVideoElement) {
          loadDirectLink(reactVideoElement, record.reactMeta.url);
          loadReact(reactVideoElement, null, reactMeta, record.reactMeta.url.includes('real-debrid') ? 'realdebrid' : 'direct');
        }
      }
    }
    
    if (record.delay != null) {
      setDelay(record.delay);
    }
    
    if (record.pos) {
      const container = document.getElementById('videoReactContainer');
      if (container) {
        container.style.left = `${record.pos.l}px`;
        container.style.top = `${record.pos.t}px`;
        if (record.pos.w) container.style.width = `${record.pos.w}px`;
        if (record.pos.h) container.style.height = `${record.pos.h}px`;
      }
    }
    
    if (record.baseVol != null) {
      updateBaseVolume(record.baseVol);
      setTimeout(() => {
        if ($baseVideo.source === 'youtube' && $baseVideo.youtubePlayer) {
          setYTVolume($baseVideo.youtubePlayer, record.baseVol * 100);
        } else if ($baseVideo.element) {
          setVolume($baseVideo.element, record.baseVol);
        }
      }, 500);
    }
    
    if (record.reactVol != null) {
      updateReactVolume(record.reactVol);
      setTimeout(() => {
        if ($reactVideo.source === 'youtube' && $reactVideo.youtubePlayer) {
          setYTVolume($reactVideo.youtubePlayer, record.reactVol * 100);
        } else if ($reactVideo.element) {
          setVolume($reactVideo.element, record.reactVol);
        }
      }, 500);
    }
    
    setTimeout(() => {
      if (record.baseTime != null) {
        markSeeking('resume');
        syncSeek(true, record.baseTime);
        const baseTime = getBaseCurrentTime();
        const reactTime = getReactCurrentTime();
        enableSync(baseTime, reactTime);
        startSyncLoop();
        setTimeout(() => {
          clearSeeking();
        }, 600);
      }
    }, 1000);
  }

  function handleClearSaved() {
    if (confirm('Clear saved video progress?')) {
      clearAll();
      alert('Saved progress cleared.');
    }
  }

  function handleForceResync() {
    syncVideos(true);
  }

  function handleEnableSync() {
    const baseTime = getBaseCurrentTime();
    const reactTime = getReactCurrentTime();
    enableSync(baseTime, reactTime);
    startSyncLoop();
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
    setDelay(resumeRecord.delay);
    if (resumeRecord.pos) {
      const container = document.getElementById('videoReactContainer');
      if (container) {
        container.style.left = `${resumeRecord.pos.l}px`;
        container.style.top = `${resumeRecord.pos.t}px`;
        if (resumeRecord.pos.w) container.style.width = `${resumeRecord.pos.w}px`;
        if (resumeRecord.pos.h) container.style.height = `${resumeRecord.pos.h}px`;
      }
    }
    if (resumeRecord.baseVol != null) {
      updateBaseVolume(resumeRecord.baseVol);
      if ($baseVideo.source === 'youtube' && $baseVideo.youtubePlayer) {
        setYTVolume($baseVideo.youtubePlayer, resumeRecord.baseVol * 100);
      } else if ($baseVideo.element) {
        setVolume($baseVideo.element, resumeRecord.baseVol);
      }
    }
    if (resumeRecord.reactVol != null) {
      updateReactVolume(resumeRecord.reactVol);
      if ($reactVideo.source === 'youtube' && $reactVideo.youtubePlayer) {
        setYTVolume($reactVideo.youtubePlayer, resumeRecord.reactVol * 100);
      } else if ($reactVideo.element) {
        setVolume($reactVideo.element, resumeRecord.reactVol);
      }
    }
    setTimeout(() => {
      markSeeking('resume');
      syncSeek(true, resumeRecord.baseTime);
      const baseTime = getBaseCurrentTime();
      const reactTime = getReactCurrentTime();
      enableSync(baseTime, reactTime);
      startSyncLoop();
      setTimeout(() => {
        clearSeeking();
      }, 600);
    }, 300);
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
    window.isVideosSynced = false;
    window.isSeeking = false;
    window.syncPlay = syncPlay;
    window.syncPause = syncPause;
    window.pauseBase = pauseBase;
    window.pauseReact = pauseReact;
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
    on:playPause={() => {
      if (isBasePlaying()) syncPause(true);
      else syncPlay(true);
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
  />

  <ReactVideo
    on:playPause={() => {
      if (isReactPlaying()) syncPause(false);
      else syncPlay(false);
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
        await handleBaseSourceSelect('local');
        const record = loadLastRecord;
        if (record) {
          setTimeout(async () => {
            if (record.delay != null) setDelay(record.delay);
            if (record.pos) {
              const container = document.getElementById('videoReactContainer');
              if (container) {
                container.style.left = `${record.pos.l}px`;
                container.style.top = `${record.pos.t}px`;
                if (record.pos.w) container.style.width = `${record.pos.w}px`;
                if (record.pos.h) container.style.height = `${record.pos.h}px`;
              }
            }
            if (record.baseVol != null) {
              updateBaseVolume(record.baseVol);
              setTimeout(() => {
                if ($baseVideo.element) {
                  setVolume($baseVideo.element, record.baseVol);
                }
              }, 100);
            }
            if (record.reactVol != null) {
              updateReactVolume(record.reactVol);
              setTimeout(() => {
                if ($reactVideo.element) {
                  setVolume($reactVideo.element, record.reactVol);
                }
              }, 100);
            }
            if (record.baseTime != null) {
              setTimeout(() => {
                markSeeking('resume');
                syncSeek(true, record.baseTime);
                const baseTime = getBaseCurrentTime();
                const reactTime = getReactCurrentTime();
                enableSync(baseTime, reactTime);
                startSyncLoop();
                setTimeout(() => {
                  clearSeeking();
                }, 600);
              }, 500);
            }
          }, 300);
          showLoadLastPrompt = false;
          loadLastRecord = null;
        }
      }}
      onChooseReact={async () => {
        await handleReactSourceSelect('local');
        const record = loadLastRecord;
        if (record) {
          setTimeout(async () => {
            if (record.delay != null) setDelay(record.delay);
            if (record.pos) {
              const container = document.getElementById('videoReactContainer');
              if (container) {
                container.style.left = `${record.pos.l}px`;
                container.style.top = `${record.pos.t}px`;
                if (record.pos.w) container.style.width = `${record.pos.w}px`;
                if (record.pos.h) container.style.height = `${record.pos.h}px`;
              }
            }
            if (record.baseVol != null) {
              updateBaseVolume(record.baseVol);
              setTimeout(() => {
                if ($baseVideo.element) {
                  setVolume($baseVideo.element, record.baseVol);
                }
              }, 100);
            }
            if (record.reactVol != null) {
              updateReactVolume(record.reactVol);
              setTimeout(() => {
                if ($reactVideo.element) {
                  setVolume($reactVideo.element, record.reactVol);
                }
              }, 100);
            }
            if (record.baseTime != null) {
              setTimeout(() => {
                markSeeking('resume');
                syncSeek(true, record.baseTime);
                const baseTime = getBaseCurrentTime();
                const reactTime = getReactCurrentTime();
                enableSync(baseTime, reactTime);
                startSyncLoop();
                setTimeout(() => {
                  clearSeeking();
                }, 600);
              }, 500);
            }
          }, 300);
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

