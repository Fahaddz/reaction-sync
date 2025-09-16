import { secondsToTime } from './utils.js';

let isVideosSynced = false;
let videoReactDelay = 0;
let baseYoutubePlayer = null;
let reactYoutubePlayer = null;
let isBaseYoutubeVideo = false;
let isReactYoutubeVideo = false;

const SYNC_THRESHOLD = 0.3;
const SYNC_INTERVAL = 500;
const MIN_SYNC_THRESHOLD = 0.3;
const MAX_SYNC_THRESHOLD = 1.0;
function getSyncThreshold(){return Math.min(MAX_SYNC_THRESHOLD,Math.max(MIN_SYNC_THRESHOLD,Math.abs(videoReactDelay)*0.05));}
function getSyncInterval(){const i=getSyncThreshold()*1000;return Math.min(1000,Math.max(200,i));}
const SEEK_COOLDOWN = 800;
const DELAY_ADJUSTMENT = 0.1;
const DEBUG = new URLSearchParams(window.location.search).get('debug') === 'true';

let syncIntervalId = null;
let lastInteractionTime = 0;
let isUserInteracting = false;
let isSeeking = false;
let seekingSource = null;
let lastBaseYTTime = 0;
let lastReactYTTime = 0;

function updateStatus(msg){const e=document.getElementById('syncStatus');if(e)e.textContent=msg;}

function initSync(baseYT, reactYT, isBaseYT, isReactYT) {
  try {
    if (isBaseYT && baseYT) {
      try {
        if (typeof baseYT.getPlayerState === 'function') {
          baseYoutubePlayer = baseYT;
        } else {
          console.warn('Base YouTube player does not have expected methods');
          baseYoutubePlayer = null;
        }
      } catch (e) {
        console.error('Error accessing base YouTube player:', e);
        baseYoutubePlayer = null;
      }
    } else {
      baseYoutubePlayer = null;
    }

    if (isReactYT && reactYT) {
      try {
        if (typeof reactYT.getPlayerState === 'function') {
          reactYoutubePlayer = reactYT;
        } else {
          console.warn('Reaction YouTube player does not have expected methods');
          reactYoutubePlayer = null;
        }
      } catch (e) {
        console.error('Error accessing reaction YouTube player:', e);
        reactYoutubePlayer = null;
      }
    } else {
      reactYoutubePlayer = null;
    }

    isBaseYoutubeVideo = !!isBaseYT;
    isReactYoutubeVideo = !!isReactYT;

    isVideosSynced = false;
    videoReactDelay = 0;
    isSeeking = false;
    seekingSource = null;
    isUserInteracting = false;
    lastInteractionTime = 0;

    window.videoReactDelay = videoReactDelay;
    window.isVideosSynced = isVideosSynced;

    if (window.seekingClearTimeout) {
      clearTimeout(window.seekingClearTimeout);
      window.seekingClearTimeout = null;
    }
    if (window.userInteractionTimeout) {
      clearTimeout(window.userInteractionTimeout);
      window.userInteractionTimeout = null;
    }

    stopSyncLoop();
    updateSyncIndicator(false);
    $("#delay").css("color", "white").text("?");

    document.addEventListener('click', function(e) {
      if (e.target && (e.target.id === 'syncButton' ||
          e.target.parentElement && e.target.parentElement.id === 'syncButton')) {
        syncNow();
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.target && e.target.id === 'forceResyncButton') { syncVideos(true); updateStatus('Force re-syncing'); setTimeout(()=>updateStatus(''),1000); e.preventDefault(); e.stopPropagation(); }
      if (e.target && (e.target.id === 'desyncButton' ||
          e.target.parentElement && e.target.parentElement.id === 'desyncButton')) {
        disableSync();
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    setupKeyboardShortcuts();
    updateUIElements();
    return true;
  } catch (e) {
    console.error("Error initializing sync module:", e);
    return false;
  }
}

function setupKeyboardShortcuts() {
  try {
    if (window._syncKeydownHandler) {
      document.removeEventListener('keydown', window._syncKeydownHandler, true);
    }
    if (window._syncKeydownHandlerBubble) {
      document.removeEventListener('keydown', window._syncKeydownHandlerBubble, false);
    }
  } catch (e) {
    console.warn('Error cleaning up previous event listeners:', e);
  }

  window._syncKeydownHandler = function(e) {
    const activeElement = document.activeElement;
    const isYouTubeIframe = activeElement && activeElement.tagName === 'IFRAME' &&
                           (activeElement.id === 'videoBaseYoutube' || activeElement.id === 'videoReactYoutube');
    const isOurShortcut = e.key === 's' || e.key === 'S' || e.key === 'd' || e.key === 'D' ||
                         ((e.key === ' ' || e.key === 'k' || e.key === 'K') && isVideosSynced) ||
                         (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ||
                         (e.key === 'PageUp' || e.keyCode === 33) || (e.key === 'PageDown' || e.keyCode === 34);

    if (e.key === 's' || e.key === 'S') {
      syncNow();
      if (isYouTubeIframe && isOurShortcut) { e.preventDefault(); e.stopPropagation(); }
      return true;
    }
    if (e.key === 'd' || e.key === 'D') {
      disableSync();
      if (isYouTubeIframe && isOurShortcut) { e.preventDefault(); e.stopPropagation(); }
      return true;
    }
    if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
      if (isVideosSynced) {
        isBasePlaying() ? pauseBase(true) : playBase(true);
        if (isYouTubeIframe && isOurShortcut) { e.preventDefault(); e.stopPropagation(); }
        return true;
      }
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const seekAmount = e.key === 'ArrowLeft' ? -5 : 5;
      if (isVideosSynced) {
        const currentTime = getBaseCurrentTime();
        seekBase(currentTime + seekAmount, true);
      } else {
        if (e.shiftKey) {
          seekReact(getReactCurrentTime() + seekAmount);
        } else {
          seekBase(getBaseCurrentTime() + seekAmount);
        }
      }
      if (isYouTubeIframe && isOurShortcut) { e.preventDefault(); e.stopPropagation(); }
      return true;
    }
    if (e.key === 'PageUp' || e.keyCode === 33) {
      if (isVideosSynced) {
        setDelay(videoReactDelay - DELAY_ADJUSTMENT);
        if (isYouTubeIframe && isOurShortcut) { e.preventDefault(); e.stopPropagation(); }
        return true;
      }
    }
    if (e.key === 'PageDown' || e.keyCode === 34) {
      if (isVideosSynced) {
        setDelay(videoReactDelay + DELAY_ADJUSTMENT);
        if (isYouTubeIframe && isOurShortcut) { e.preventDefault(); e.stopPropagation(); }
        return true;
      }
    }
    return false;
  };

  window._syncKeydownHandlerBubble = function(e) {
    if (window.keydownHandler && typeof window.keydownHandler === 'function') {
      if (window.keydownHandler(e)) return true;
    }
    return handleKeyboardShortcuts(e);
  };

  document.addEventListener('keydown', window._syncKeydownHandler, true);
  document.addEventListener('keydown', window._syncKeydownHandlerBubble, true);

  const preventYouTubeCapture = function(e) {
    const isOurShortcut = e.key === 's' || e.key === 'S' || e.key === 'd' || e.key === 'D' ||
                         ((e.key === ' ' || e.key === 'k' || e.key === 'K') && isVideosSynced) ||
                         (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ||
                         (e.key === 'PageUp' || e.keyCode === 33) || (e.key === 'PageDown' || e.keyCode === 34);
    if (isOurShortcut) { e.stopPropagation(); return false; }
  };

  if (baseYoutubePlayer && baseYoutubePlayer.iframe) {
    baseYoutubePlayer.iframe.addEventListener('keydown', preventYouTubeCapture, true);
  }
  if (reactYoutubePlayer && reactYoutubePlayer.iframe) {
    reactYoutubePlayer.iframe.addEventListener('keydown', preventYouTubeCapture, true);
  }
}

function handleKeyboardShortcuts(e) {
  const activeElement = document.activeElement;
  const isInput = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable;
  if (isInput) return false;

  let handled = false;
  if (e.key === 's' || e.key === 'S') { syncNow(); handled = true; }
  if (e.key === 'd' || e.key === 'D') { disableSync(); handled = true; }
  if (e.key === 'PageUp' || e.keyCode === 33) {
    if (isVideosSynced) { setDelay(videoReactDelay - DELAY_ADJUSTMENT); handled = true; }
  }
  if (e.key === 'PageDown' || e.keyCode === 34) {
    if (isVideosSynced) { setDelay(videoReactDelay + DELAY_ADJUSTMENT); handled = true; }
  }
  if (handled) { e.preventDefault(); e.stopPropagation(); }
  return handled;
}

function syncNow() {
  try {
    if (window.syncNow !== syncNow && window.syncNow !== ensureYouTubeReadyAndSync) { window.syncNow = syncNow; }
    if (typeof window.isVideosSynced === 'undefined') { window.isVideosSynced = isVideosSynced; }
    if (typeof window.videoReactDelay === 'undefined') { window.videoReactDelay = videoReactDelay; }

    let reactTime = 0, baseTime = 0;
    try { reactTime = getReactCurrentTime(); } catch (e) { console.error('Error getting reaction time, using 0:', e); }
    try { baseTime = getBaseCurrentTime(); } catch (e) { console.error('Error getting base time, using 0:', e); }

    let calculatedDelay = reactTime - baseTime;
    if (!isFinite(calculatedDelay) || isNaN(calculatedDelay)) {
      console.warn('Calculated delay is invalid:', calculatedDelay);
      calculatedDelay = 0;
    }
    if (Math.abs(calculatedDelay) > 300) {
      console.warn('Extremely large delay capped:', calculatedDelay);
      calculatedDelay = calculatedDelay > 0 ? 300 : -300;
    }
    calculatedDelay = Math.round(calculatedDelay * 100) / 100;
    setDelay(calculatedDelay, false);

    updateSyncIndicator(true);
    updateUIElements();
    isVideosSynced = true;
    window.isVideosSynced = true;
    startSyncLoop();

    console.log('✅ Manual sync activated. Calculated delay:', calculatedDelay.toFixed(2), 'seconds');
    updateStatus('Videos synced! Delay: ' + (calculatedDelay >= 0 ? '+' : '') + calculatedDelay.toFixed(1) + 's');
    setTimeout(() => updateStatus(''), 3000);
    
    try {
      const syncButton = $("#syncButton");
      if (syncButton.length) {
        syncButton.addClass("active").css({ "background-color": "rgba(0, 255, 0, 0.3)", "border-color": "rgba(0, 255, 0, 0.5)" }).text("Synced");
      }
    } catch (uiErr) { console.warn('Error updating sync button:', uiErr); }
    try { document.dispatchEvent(new CustomEvent('syncStateChange')); } catch (eventErr) { console.warn('Error dispatching sync event:', eventErr); }
    return true;
  } catch (e) {
    console.error('Error during manual sync:', e);
    try { setDelay(0); } catch (setDelayErr) { console.error('Error setting fallback delay:', setDelayErr); }
    isVideosSynced = true; window.isVideosSynced = true;
    try { startSyncLoop(); updateSyncIndicator(true); } catch (recoveryErr) { console.error('Error during sync recovery:', recoveryErr); }
    return true;
  }
}
window.syncNow = syncNow;

function setDelay(delay, shouldSeek = false) {
  try {
    let oldBaseTime = 0, oldReactTime = 0;
    try { oldBaseTime = getBaseCurrentTime(); } catch (e) { console.warn('Error getting base time in setDelay:', e); }
    try { oldReactTime = getReactCurrentTime(); } catch (e) { console.warn('Error getting reaction time in setDelay:', e); }

    const parsedDelay = parseFloat(delay);
    delay = !isNaN(parsedDelay) ? parsedDelay : 0;
    delay = Math.max(-300, Math.min(300, delay));
    delay = Math.round(delay * 100) / 100;
    videoReactDelay = delay;
    window.videoReactDelay = videoReactDelay;
    
    console.log('Delay set to:', delay, 'seconds. Sync enabled:', !isVideosSynced ? 'Auto-enabling sync' : 'Already synced');

    const absDelay = Math.abs(videoReactDelay);
    const sign = videoReactDelay < 0 ? "-" : "+";
    const delayText = `${sign}${secondsToTime(absDelay, 10)}`;

    try {
      $("#delay").css("color", "lightgreen").text(delayText);
      const delayValueEl = $("#delayValue");
      if (delayValueEl.length) { delayValueEl.text(delay.toFixed(1)); }
    } catch (uiErr) { console.warn('Error updating delay UI:', uiErr); }

    if (!isVideosSynced) {
      isVideosSynced = true; window.isVideosSynced = true;
      console.log('🔄 Auto-enabling sync because delay was changed. Videos will now sync automatically.');
      updateStatus('Sync enabled - videos will stay synchronized');
      try { updateSyncIndicator(true); } catch (indicatorErr) { console.warn('Error updating sync indicator:', indicatorErr); }
      try { startSyncLoop(); } catch (loopErr) { console.warn('Error starting sync loop:', loopErr); }
      try { document.dispatchEvent(new CustomEvent('syncStateChange')); } catch (eventErr) { console.warn('Error dispatching sync event:', eventErr); }
      setTimeout(() => updateStatus(''), 2000);
    }

    if (shouldSeek) {
      markUserInteraction();
      setTimeout(() => {
        try {
          const targetReactTime = oldBaseTime + videoReactDelay;
          if (isFinite(targetReactTime) && targetReactTime >= 0) {
            seekReact(targetReactTime, true);
          } else {
            console.warn('Invalid target reaction time calculated:', targetReactTime);
          }
        } catch (seekErr) { console.error('Error during position adjustment after delay change:', seekErr); }
      }, 50);
    }
    return true;
  } catch (e) {
    console.error("Error setting delay:", e);
    return false;
  }
}

function disableSync() {
  try {
    stopSyncLoop();
    isVideosSynced = false;
    window.isVideosSynced = false;
    $("#delay").css("color", "white").text("?");
    updateSyncIndicator(false);
    return true;
  } catch (e) {
    console.error("Error disabling sync:", e);
    return false;
  }
}

function updateSyncIndicator(synced) {
  try {
    const syncButton = $("#syncButton");
    if (syncButton.length) {
      if (synced) {
        syncButton.addClass("active").css({ "background-color": "rgba(0, 255, 0, 0.3)", "border-color": "rgba(0, 255, 0, 0.5)" }).text("Synced");
      } else {
        syncButton.removeClass("active").css({ "background-color": "", "border-color": "" }).text("Sync");
      }
    }
    const desyncButton = $("#desyncButton");
    if (desyncButton.length) {
      desyncButton.css({ "display": synced ? "inline-block" : "inline-block", "opacity": synced ? "1" : "0.5" });
    }
    const delayEl = $("#delay");
    if (delayEl.length) { delayEl.css("color", synced ? "lightgreen" : "white"); }
  } catch (e) { console.error("Error updating sync indicator:", e); }
}

function getBaseCurrentTime() {
  try {
    let raw,dur;
    if(isBaseYoutubeVideo&&baseYoutubePlayer&&typeof baseYoutubePlayer.getCurrentTime==='function'){
      raw=baseYoutubePlayer.getCurrentTime()||lastBaseYTTime;
      dur=baseYoutubePlayer.getDuration()||raw;
      lastBaseYTTime=raw>0?raw:lastBaseYTTime;
    }else{
      const v=$("#videoBaseLocal")[0];
      raw=v&&typeof v.currentTime==='number'&&!isNaN(v.currentTime)?v.currentTime:0;
      dur=v&&typeof v.duration==='number'&&!isNaN(v.duration)?v.duration:0;
    }
    let t=Math.max(0,raw);
    if(dur>0)t=Math.min(t,dur);
    t=parseFloat(t.toFixed(2));
    if(isBaseYoutubeVideo)lastBaseYTTime=t;
    return t;
  } catch (e) { console.error("Error getting base current time:", e); return 0; }
}

function getReactCurrentTime() {
  try {
    let raw,dur;
    if(isReactYoutubeVideo&&reactYoutubePlayer&&typeof reactYoutubePlayer.getCurrentTime==='function'){
      raw=reactYoutubePlayer.getCurrentTime()||lastReactYTTime;
      dur=reactYoutubePlayer.getDuration()||raw;
      lastReactYTTime=raw>0?raw:lastReactYTTime;
    }else{
      const v=$("#videoReact")[0];
      raw=v&&typeof v.currentTime==='number'&&!isNaN(v.currentTime)?v.currentTime:0;
      dur=v&&typeof v.duration==='number'&&!isNaN(v.duration)?v.duration:0;
    }
    let t=Math.max(0,raw);
    if(dur>0)t=Math.min(t,dur);
    t=parseFloat(t.toFixed(2));
    if(isReactYoutubeVideo)lastReactYTTime=t;
    return t;
  } catch (e) { console.error("Error getting reaction current time:", e); return 0; }
}

function isBasePlaying() {
  try {
    if (isBaseYoutubeVideo && baseYoutubePlayer && typeof baseYoutubePlayer.getPlayerState === 'function') {
      const s = baseYoutubePlayer.getPlayerState();
      return s === YT.PlayerState.PLAYING || s === YT.PlayerState.BUFFERING;
    }
    const video = $("#videoBaseLocal")[0];
    return !!(video && typeof video.paused === 'boolean' && !video.paused);
  } catch (e) { console.error("Error checking if base is playing:", e); return false; }
}

function isReactPlaying() {
  try {
    if (isReactYoutubeVideo && reactYoutubePlayer && typeof reactYoutubePlayer.getPlayerState === 'function') {
      const s = reactYoutubePlayer.getPlayerState();
      return s === YT.PlayerState.PLAYING || s === YT.PlayerState.BUFFERING;
    }
    const video = $("#videoReact")[0];
    return !!(video && typeof video.paused === 'boolean' && !video.paused);
  } catch (e) { console.error("Error checking if reaction is playing:", e); return false; }
}

function areVideosReady() {
  try {
    let reactVideoExists = false;
    let reactVideoStatus = '';
    if (isReactYoutubeVideo) {
      const hasPlayer = reactYoutubePlayer !== null;
      const hasState = hasPlayer && typeof reactYoutubePlayer.getPlayerState === 'function';
      const hasYT = typeof YT !== 'undefined' && YT.PlayerState;
      const state = hasState ? reactYoutubePlayer.getPlayerState() : 'N/A';
      const notUnstarted = hasState && state !== YT.PlayerState.UNSTARTED;
      reactVideoExists = hasPlayer && hasState && hasYT && notUnstarted;
      reactVideoStatus = `React YT: player=${hasPlayer}, state=${state}, ready=${reactVideoExists}`;
    } else {
      const video = $("#videoReact")[0];
      const hasVideo = !!video;
      const readyState = hasVideo ? video.readyState : 0;
      reactVideoExists = hasVideo && readyState >= 1;
      reactVideoStatus = `React Local: exists=${hasVideo}, readyState=${readyState}, ready=${reactVideoExists}`;
    }
    
    let baseVideoExists = false;
    let baseVideoStatus = '';
    if (isBaseYoutubeVideo) {
      const hasPlayer = baseYoutubePlayer !== null;
      const hasState = hasPlayer && typeof baseYoutubePlayer.getPlayerState === 'function';
      const hasYT = typeof YT !== 'undefined' && YT.PlayerState;
      const state = hasState ? baseYoutubePlayer.getPlayerState() : 'N/A';
      const notUnstarted = hasState && state !== YT.PlayerState.UNSTARTED;
      baseVideoExists = hasPlayer && hasState && hasYT && notUnstarted;
      baseVideoStatus = `Base YT: player=${hasPlayer}, state=${state}, ready=${baseVideoExists}`;
    } else {
      const video = $("#videoBaseLocal")[0];
      const hasVideo = !!video;
      const readyState = hasVideo ? video.readyState : 0;
      baseVideoExists = hasVideo && readyState >= 1;
      baseVideoStatus = `Base Local: exists=${hasVideo}, readyState=${readyState}, ready=${baseVideoExists}`;
    }
    
    const allReady = reactVideoExists && baseVideoExists;
    if ((DEBUG || window.DEBUG_SYNC) && !allReady) {
      console.log('Videos not ready:', baseVideoStatus, '|', reactVideoStatus);
    }
    
    return allReady;
  } catch (e) { console.error("Error checking if videos are ready:", e); return false; }
}

function getBaseDuration() {
  try {
    if (isBaseYoutubeVideo && baseYoutubePlayer && typeof baseYoutubePlayer.getDuration === 'function') {
      const duration = baseYoutubePlayer.getDuration();
      return isNaN(duration) || duration <= 0 ? 0 : duration;
    }
    const video = $("#videoBaseLocal")[0];
    return video && !isNaN(video.duration) ? video.duration : 0;
  } catch (e) { console.error("Error getting base duration:", e); return 0; }
}

function getReactDuration() {
  try {
    if (isReactYoutubeVideo && reactYoutubePlayer && typeof reactYoutubePlayer.getDuration === 'function') {
      const duration = reactYoutubePlayer.getDuration();
      return isNaN(duration) || duration <= 0 ? 0 : duration;
    }
    const video = $("#videoReact")[0];
    return video && !isNaN(video.duration) ? video.duration : 0;
  } catch (e) { console.error("Error getting reaction duration:", e); return 0; }
}

function playBase(internalCall = false) {
  try {
    if (isBaseYoutubeVideo) {
      if (baseYoutubePlayer && typeof baseYoutubePlayer.playVideo === 'function') {
        try {
          $("#basePlayPause").text("⏸"); baseYoutubePlayer.playVideo();
          setTimeout(() => { try { if (baseYoutubePlayer && typeof baseYoutubePlayer.getPlayerState === 'function' && baseYoutubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) { console.warn('Retrying base YT play'); baseYoutubePlayer.playVideo(); } } catch (retryErr) { console.error('Error in YT play retry check:', retryErr); } }, 100);
        } catch (ytPlayErr) { console.error('Error calling YouTube base playVideo:', ytPlayErr); $("#basePlayPause").text("⏵"); }
      } else { console.warn('Base YouTube player not ready for play command.'); }
    } else {
      const video = $("#videoBaseLocal")[0];
      if (video && typeof video.play === 'function') {
        try {
          $("#basePlayPause").text("⏸"); const playPromise = video.play();
          if (playPromise !== undefined) { playPromise.catch(e => { console.error("Error playing HTML5 base video:", e); $("#basePlayPause").text("⏵"); }); }
        } catch (htmlPlayErr) { console.error("Error calling HTML5 base play:", htmlPlayErr); $("#basePlayPause").text("⏵"); }
      } else { console.warn('Base HTML5 video element not ready for play command.'); }
    }
  } catch (e) { console.error("General error in playBase:", e); }
}

function pauseBase(internalCall = false) {
  try {
    if (isBaseYoutubeVideo) {
      if (baseYoutubePlayer && typeof baseYoutubePlayer.pauseVideo === 'function') {
        try {
          $("#basePlayPause").text("⏵"); baseYoutubePlayer.pauseVideo();
          setTimeout(() => { try { if (baseYoutubePlayer && typeof baseYoutubePlayer.getPlayerState === 'function' && baseYoutubePlayer.getPlayerState() === YT.PlayerState.PLAYING) { console.warn('Retrying base YT pause'); baseYoutubePlayer.pauseVideo(); } } catch (retryErr) { console.error('Error in YT pause retry check:', retryErr); } }, 100);
        } catch (ytPauseErr) { console.error('Error calling YouTube base pauseVideo:', ytPauseErr); $("#basePlayPause").text("⏸"); }
      } else { console.warn('Base YouTube player not ready for pause command.'); }
    } else {
      const video = $("#videoBaseLocal")[0];
      if (video && typeof video.pause === 'function') {
        try { $("#basePlayPause").text("⏵"); video.pause(); } catch (htmlPauseErr) { console.error("Error calling HTML5 base pause:", htmlPauseErr); $("#basePlayPause").text("⏸"); }
      } else { console.warn('Base HTML5 video element not ready for pause command.'); }
    }
  } catch (e) { console.error("General error in pauseBase:", e); }
}

function playReact(internalCall = false) {
  try {
    if (isReactYoutubeVideo) {
      if (reactYoutubePlayer && typeof reactYoutubePlayer.playVideo === 'function') {
        try {
          $("#reactPlayPauseInner").text("⏸"); reactYoutubePlayer.playVideo();
          setTimeout(() => { try { if (reactYoutubePlayer && typeof reactYoutubePlayer.getPlayerState === 'function' && reactYoutubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) { console.warn('Retrying react YT play'); reactYoutubePlayer.playVideo(); } } catch (retryErr) { console.error('Error in YT react play retry check:', retryErr); } }, 100);
        } catch (ytPlayErr) { console.error('Error calling YouTube reaction playVideo:', ytPlayErr); $("#reactPlayPauseInner").text("⏵"); }
      } else { console.warn('Reaction YouTube player not ready for play command.'); }
    } else {
      const video = $("#videoReact")[0];
      if (video && typeof video.play === 'function') {
        try {
          $("#reactPlayPauseInner").text("⏸"); const playPromise = video.play();
          if (playPromise !== undefined) { playPromise.catch(e => { console.error("Error playing HTML5 reaction video:", e); $("#reactPlayPauseInner").text("⏵"); }); }
        } catch (htmlPlayErr) { console.error("Error calling HTML5 reaction play:", htmlPlayErr); $("#reactPlayPauseInner").text("⏵"); }
      } else { console.warn('Reaction HTML5 video element not ready for play command.'); }
    }
    return true;
  } catch (e) { console.error("General error in playReact:", e); return false; }
}

function pauseReact(internalCall = false) {
  try {
    if (isReactYoutubeVideo) {
      if (reactYoutubePlayer && typeof reactYoutubePlayer.pauseVideo === 'function') {
        try {
          $("#reactPlayPauseInner").text("⏵"); reactYoutubePlayer.pauseVideo();
          setTimeout(() => { try { if (reactYoutubePlayer && typeof reactYoutubePlayer.getPlayerState === 'function' && reactYoutubePlayer.getPlayerState() === YT.PlayerState.PLAYING) { console.warn('Retrying react YT pause'); reactYoutubePlayer.pauseVideo(); } } catch (retryErr) { console.error('Error in YT react pause retry check:', retryErr); } }, 100);
        } catch (ytPauseErr) { console.error('Error calling YouTube reaction pauseVideo:', ytPauseErr); $("#reactPlayPauseInner").text("⏸"); }
      } else { console.warn('Reaction YouTube player not ready for pause command.'); }
    } else {
      const video = $("#videoReact")[0];
      if (video && typeof video.pause === 'function') {
        try { $("#reactPlayPauseInner").text("⏵"); video.pause(); } catch (htmlPauseErr) { console.error("Error calling HTML5 reaction pause:", htmlPauseErr); $("#reactPlayPauseInner").text("⏸"); }
      } else { console.warn('Reaction HTML5 video element not ready for pause command.'); }
    }
    return true;
  } catch (e) { console.error("General error in pauseReact:", e); return false; }
}

function seekBase(time, internalCall = false) {
  try {
    if (isNaN(time)) { console.warn("Invalid time value (NaN) for seekBase:", time); return; }
    time = Math.max(0, time);
    const baseDuration = getBaseDuration();
    if (baseDuration > 0) { time = Math.min(time, baseDuration); }
    if (!internalCall) { markSeeking('base'); }

    if (isBaseYoutubeVideo) {
      if (baseYoutubePlayer && typeof baseYoutubePlayer.seekTo === 'function') {
        try {
          baseYoutubePlayer.seekTo(time, true); updateBaseUI(time);
          setTimeout(() => { if (Math.abs(getBaseCurrentTime() - time) > 0.5) { baseYoutubePlayer.seekTo(time, true); updateBaseUI(time); } }, 200);
        } catch (ytSeekErr) { console.error("Error calling YouTube base seekTo:", ytSeekErr); }
      } else { console.warn('Base YouTube player not ready for seek command.'); }
    } else {
      const video = $("#videoBaseLocal")[0];
      if (video && typeof video.fastSeek === 'function') {
        try { video.fastSeek(time); updateBaseUI(time); } catch (htmlFastSeekErr) {
          console.warn('HTML5 base fastSeek failed, falling back to currentTime:', htmlFastSeekErr);
          try { video.currentTime = time; updateBaseUI(time); } catch (htmlSeekErr) { console.error("Error setting HTML5 base currentTime:", htmlSeekErr); }
        }
      } else if (video && typeof video.currentTime === 'number') {
        try { video.currentTime = time; updateBaseUI(time); } catch (htmlSeekErr) { console.error("Error setting HTML5 base currentTime:", htmlSeekErr); }
      } else { console.warn('Base HTML5 video element not ready for seek command.'); }
    }
    if (!internalCall) { clearSeekingAfterDelay(); }
  } catch (e) { if (!internalCall) { clearSeeking(); } console.error("General error in seekBase:", e); }
}

function seekReact(time, internalCall = false) {
  try {
    if (isNaN(time)) { console.warn("Invalid time value (NaN) for seekReact:", time); return false; }
    time = Math.max(0, time);
    const reactDuration = getReactDuration();
    if (reactDuration > 0) { time = Math.min(time, reactDuration); }
    if (!internalCall) { markSeeking('react'); }

    if (isReactYoutubeVideo) {
      if (reactYoutubePlayer && typeof reactYoutubePlayer.seekTo === 'function') {
        try {
          reactYoutubePlayer.seekTo(time, true); updateReactUI(time);
          setTimeout(() => { if (Math.abs(getReactCurrentTime() - time) > 0.5) { reactYoutubePlayer.seekTo(time, true); updateReactUI(time); } }, 200);
        } catch (ytSeekErr) { console.error("Error calling YouTube reaction seekTo:", ytSeekErr); }
      } else { console.warn('Reaction YouTube player not ready for seek command.'); }
    } else {
      const video = $("#videoReact")[0];
      if (video && typeof video.fastSeek === 'function') {
        try { video.fastSeek(time); updateReactUI(time); } catch (htmlFastSeekErr) {
          console.warn('HTML5 react fastSeek failed, falling back to currentTime:', htmlFastSeekErr);
          try { video.currentTime = time; updateReactUI(time); } catch (htmlSeekErr) { console.error("Error setting HTML5 react currentTime:", htmlSeekErr); }
        }
      } else if (video && typeof video.currentTime === 'number') {
        try { video.currentTime = time; updateReactUI(time); } catch (htmlSeekErr) { console.error("Error setting HTML5 react currentTime:", htmlSeekErr); }
      } else { console.warn('Reaction HTML5 video element not ready for seek command.'); }
    }
    if (!internalCall) { clearSeekingAfterDelay(); }
    return true;
  } catch (e) { if (!internalCall) { clearSeeking(); } console.error("General error in seekReact:", e); return false; }
}

function syncPlay(sourceIsBase) {
  markUserInteraction();
  if (isVideosSynced) {
    playBase(true); playReact(true);
    // Give more time for YouTube players and only retry once
    setTimeout(() => {
      if (isVideosSynced && (!isBasePlaying() || !isReactPlaying())) {
        console.warn('SyncPlay Check 1: States differ. Single retry.');
        if (!isBasePlaying()) playBase(true); 
        if (!isReactPlaying()) playReact(true);
        // Final check after longer delay - no more retries to prevent loops
        setTimeout(() => { 
          if (isVideosSynced && (!isBasePlaying() || !isReactPlaying())) { 
            console.warn('SyncPlay Check 2: Some players still differ, but continuing.');
            updatePlayPauseButtons(); 
          }
        }, 600);
      }
    }, 300);
  } else {
    if (sourceIsBase) { playBase(false); } else { playReact(false); }
  }
  setTimeout(updatePlayPauseButtons, 50);
}

function syncPause(sourceIsBase) {
  markUserInteraction();
  if (isVideosSynced) {
    pauseBase(true); pauseReact(true);
    // Give more time for YouTube players and only retry once
    setTimeout(() => {
      if (isVideosSynced && (isBasePlaying() || isReactPlaying())) {
        console.warn('SyncPause Check 1: States differ. Single retry.');
        if (isBasePlaying()) pauseBase(true); 
        if (isReactPlaying()) pauseReact(true);
        // Final check after longer delay - no more retries to prevent loops
        setTimeout(() => { 
          if (isVideosSynced && (isBasePlaying() || isReactPlaying())) { 
            console.warn('SyncPause Check 2: Some players still differ, but continuing.');
            updatePlayPauseButtons(); 
          }
        }, 600);
      }
    }, 300);
  } else {
    if (sourceIsBase) { pauseBase(false); } else { pauseReact(false); }
  }
  setTimeout(updatePlayPauseButtons, 50);
}

function syncSeek(sourceIsBase, targetTime) {
  markSeeking(sourceIsBase ? 'base' : 'react');
  if (isVideosSynced) {
    const SEEK_SEQUENCE_DELAY = 150;
    if (sourceIsBase) {
      const reactTargetTime = Math.max(0, targetTime + videoReactDelay);
      seekBase(targetTime, true); updateBaseUI(targetTime);
      setTimeout(() => { if (isSeeking && isVideosSynced) { seekReact(reactTargetTime, true); updateReactUI(reactTargetTime); } }, SEEK_SEQUENCE_DELAY);
    } else {
      const baseTargetTime = Math.max(0, targetTime - videoReactDelay);
      seekReact(targetTime, true); updateReactUI(targetTime);
      setTimeout(() => { if (isSeeking && isVideosSynced) { seekBase(baseTargetTime, true); updateBaseUI(baseTargetTime); } }, SEEK_SEQUENCE_DELAY);
    }
  } else {
    if (sourceIsBase) { seekBase(targetTime, false); } else { seekReact(targetTime, false); }
  }
  clearSeekingAfterDelay();
}

function updateBaseUI(time = null) {
  try {
    const currentTime = time !== null ? time : getBaseCurrentTime();
    const duration = getBaseDuration();
    if (duration > 0) {
      const percent = (currentTime / duration) * 100;
      $("#baseSeekBar").val(isNaN(percent) ? 0 : Math.min(100, Math.max(0, percent)));
    }
    
    if (duration > 0) {
      $("#baseTimeDisplay").text(`${secondsToTime(currentTime)} / ${secondsToTime(duration)}`);
    }
    if (isBaseYoutubeVideo && baseYoutubePlayer && typeof baseYoutubePlayer.getCurrentTime === 'function') {
      const ytTime = baseYoutubePlayer.getCurrentTime(); const ytDuration = baseYoutubePlayer.getDuration();
      if (ytDuration > 0 && !isNaN(ytTime) && !isNaN(ytDuration)) {
        $("#baseTimeDisplay").text(`${secondsToTime(ytTime)} / ${secondsToTime(ytDuration)}`);
      }
    }
    $("#basePlayPause").text(isBasePlaying() ? "⏸" : "⏵");
  } catch (e) { console.error("Error updating base UI:", e); }
}

function updateReactUI(time = null) {
  try {
    const currentTime = time !== null ? time : getReactCurrentTime();
    const duration = getReactDuration();
    if (duration > 0) {
      const percent = (currentTime / duration) * 100;
      $("#reactSeekBar").val(isNaN(percent) ? 0 : Math.min(100, Math.max(0, percent)));
    }
    $("#reactTime").text(secondsToTime(currentTime)); // This might be for an old UI element
    $("#reactTimeDisplay").text(`${secondsToTime(currentTime)} / ${secondsToTime(duration)}`); // Ensure react time display is also full format
    $("#reactPlayPauseInner").text(isReactPlaying() ? "⏸" : "⏵");
  } catch (e) { console.error("Error updating reaction UI:", e); }
}

function updatePlayPauseButtons() {
  try {
    $("#basePlayPause").text(isBasePlaying() ? "⏸" : "⏵");
    $("#reactPlayPauseInner").text(isReactPlaying() ? "⏸" : "⏵");
  } catch (e) { console.error("Error updating play/pause buttons:", e); }
}

function updateUIElements() {
  try {
    updateBaseUI(); updateReactUI(); updatePlayPauseButtons(); updateSyncIndicator(isVideosSynced);
  } catch (e) {
    console.error("Error updating UI elements:", e);
    try { updateSyncIndicator(isVideosSynced); updatePlayPauseButtons(); } catch (recoveryError) { console.error("Failed to recover from UI update error:", recoveryError); }
  }
}

function syncVideos(force = false) {
  updateStatus('');
  if (!isVideosSynced || !areVideosReady()) {
    if (DEBUG) console.log('SyncVideos early return: synced =', isVideosSynced, 'ready =', areVideosReady());
    return;
  }
  if (isSeeking && !force) {
    if (DEBUG) console.log('SyncVideos early return: seeking =', isSeeking, 'force =', force);
    return;
  }
  const timeSinceInteraction = Date.now() - lastInteractionTime;
  if (!force && isUserInteracting && timeSinceInteraction < SEEK_COOLDOWN * 2) {
    if (DEBUG) console.log('SyncVideos early return: userInteracting =', isUserInteracting, 'timeSince =', timeSinceInteraction);
    return;
  }

  try {
    const baseTime = getBaseCurrentTime();
    const reactTime = getReactCurrentTime();
    const baseIsPlaying = isBasePlaying();
    const reactIsPlaying = isReactPlaying();

    try {
      if (baseIsPlaying !== reactIsPlaying) {
        updateStatus('Correcting play state');
        baseIsPlaying ? playReact(true) : pauseReact(true);
        setTimeout(() => {
          if (isVideosSynced && (isBasePlaying() !== isReactPlaying())) {
            updateStatus('Retrying play state');
            baseIsPlaying ? playReact(true) : pauseReact(true);
          }
          updateStatus('');
        }, 150);
      }
    } catch (e) { console.error('Error enforcing play/pause in syncVideos:', e); }

    const targetReactTime = baseTime + videoReactDelay;
    const timeDifference = Math.abs(reactTime - targetReactTime);
    const canPerformTimeSync = !isSeeking && (!isUserInteracting || force);
    const needsTimeSyncDueToDrift = baseIsPlaying && reactIsPlaying && timeDifference > getSyncThreshold();
    
    if (DEBUG) {
      console.log('SyncVideos:', {
        baseTime: baseTime.toFixed(2),
        reactTime: reactTime.toFixed(2), 
        delay: videoReactDelay.toFixed(2),
        targetReactTime: targetReactTime.toFixed(2),
        timeDiff: timeDifference.toFixed(2),
        threshold: getSyncThreshold().toFixed(2),
        baseIsPlaying,
        reactIsPlaying,
        needsTimeSync: needsTimeSyncDueToDrift,
        canPerformTimeSync
      });
    }

    if (canPerformTimeSync && (force || needsTimeSyncDueToDrift)) {
      try {
        updateStatus('Correcting drift');
        markSeeking('sync');
        const adjustment = force ? targetReactTime : reactTime + (targetReactTime - reactTime) * 0.5;
        seekReact(adjustment, true);
        setTimeout(() => updateStatus(''), 500);
      } catch (e) { console.error('Error enforcing drift correction in syncVideos:', e); }
    }
    updateUIElements();
  } catch (e) { console.error('Error during sync operation:', e); clearSeeking(); }
}

function startSyncLoop() {
  try {
    stopSyncLoop();
    console.log('🔄 Starting sync loop with interval:', getSyncInterval(), 'ms');
    syncIntervalId = setInterval(() => {
      if (isVideosSynced) {
        const videosReady = areVideosReady();
        if (DEBUG || window.DEBUG_SYNC) {
          console.log('Sync loop tick: videosReady =', videosReady, 'isSeeking =', isSeeking, 'isUserInteracting =', isUserInteracting);
        }
        if (videosReady) { 
          syncVideos(false); 
        } else {
          if (DEBUG || window.DEBUG_SYNC) console.log('Videos not ready, skipping syncVideos');
        }
      } else { 
        console.log('⏹️ Stopping sync loop - videos not synced');
        stopSyncLoop(); 
      }
    }, getSyncInterval());
    return true;
  } catch (e) { console.error('Error starting sync loop:', e); return false; }
}

function stopSyncLoop() {
  try {
    if (syncIntervalId) { clearInterval(syncIntervalId); syncIntervalId = null; return true; }
    return false;
  } catch (e) { console.error('Error stopping sync loop:', e); return false; }
}

function ensureYouTubeReadyAndSync() {
  window.syncNow = syncNow; // Ensure original syncNow is available if called again
  let syncCommandSent = false;
  function triggerSync() {
    if (syncCommandSent) return; syncCommandSent = true; syncNow();
  }

  try {
    let baseReady = !isBaseYoutubeVideo, reactReady = !isReactYoutubeVideo;
    if (isBaseYoutubeVideo && baseYoutubePlayer && typeof baseYoutubePlayer.getPlayerState === 'function') {
      try { baseYoutubePlayer.playVideo(); baseReady = true; setTimeout(() => { try { if (typeof baseYoutubePlayer.pauseVideo === 'function') baseYoutubePlayer.pauseVideo(); } catch (e) { console.warn('Error pausing base video during init:', e); } }, 100); } catch (e) { console.warn('Error initializing base YouTube player:', e); baseReady = true; }
    }
    if (isReactYoutubeVideo && reactYoutubePlayer && typeof reactYoutubePlayer.getPlayerState === 'function') {
      try { reactYoutubePlayer.playVideo(); reactReady = true; setTimeout(() => { try { if (typeof reactYoutubePlayer.pauseVideo === 'function') reactYoutubePlayer.pauseVideo(); } catch (e) { console.warn('Error pausing reaction video during init:', e); } }, 100); } catch (e) { console.warn('Error initializing reaction YouTube player:', e); reactReady = true; }
    }
    if (!baseReady || !reactReady) {
      setTimeout(triggerSync, 100); setTimeout(triggerSync, 300); setTimeout(triggerSync, 700);
    } else {
      setTimeout(triggerSync, 100);
    }
  } catch (e) { console.error('Error during YouTube initialization:', e); setTimeout(triggerSync, 200); }
  setTimeout(triggerSync, 1000); // Fallback sync
  return true;
}

function ensureVideosHaveBeenPlayed() {
  let baseHasBeenPlayed = false, reactHasBeenPlayed = false;
  try {
    if ((isBaseYoutubeVideo || isReactYoutubeVideo) && (typeof YT === 'undefined' || !YT.PlayerState)) { console.warn('YouTube API (YT object) not fully loaded during video playback check'); return false; }
    if (isBaseYoutubeVideo && baseYoutubePlayer && typeof baseYoutubePlayer.getPlayerState === 'function') { try { const state = baseYoutubePlayer.getPlayerState(); baseHasBeenPlayed = (state !== YT.PlayerState.UNSTARTED && state !== -1); } catch (e) { console.error('Error checking base video state:', e); baseHasBeenPlayed = false; } } else { const baseVideo = $("#videoBaseLocal")[0]; baseHasBeenPlayed = baseVideo && (baseVideo.readyState >= 3 || baseVideo.played.length > 0); }
    if (isReactYoutubeVideo && reactYoutubePlayer && typeof reactYoutubePlayer.getPlayerState === 'function') { try { const state = reactYoutubePlayer.getPlayerState(); reactHasBeenPlayed = (state !== YT.PlayerState.UNSTARTED && state !== -1); } catch (e) { console.error('Error checking reaction video state:', e); reactHasBeenPlayed = false; } } else { const reactVideo = $("#videoReact")[0]; reactHasBeenPlayed = reactVideo && (reactVideo.readyState >= 3 || reactVideo.played.length > 0); }
    return baseHasBeenPlayed && reactHasBeenPlayed;
  } catch (error) { console.error('Error in ensureVideosHaveBeenPlayed:', error); return false; }
}

function exposeSyncFunctions() {
  window.setDelay = setDelay; window.disableSync = disableSync; window.syncNow = ensureYouTubeReadyAndSync; window.syncVideos = syncVideos;
  window.playBase = playBase; window.pauseBase = pauseBase; window.playReact = playReact; window.pauseReact = pauseReact; window.seekBase = seekBase; window.seekReact = seekReact;
  window.isBasePlaying = isBasePlaying; window.isReactPlaying = isReactPlaying; window.getBaseCurrentTime = getBaseCurrentTime; window.getReactCurrentTime = getReactCurrentTime; window.getBaseDuration = getBaseDuration; window.getReactDuration = getReactDuration; window.areVideosReady = areVideosReady;
  window.updatePlayPauseButtons = updatePlayPauseButtons; window.updateUIElements = updateUIElements;
  window.markUserInteraction = markUserInteraction;
  window.isVideosSynced = isVideosSynced; window.videoReactDelay = videoReactDelay;
}
exposeSyncFunctions();

function markSeeking(source) {
  clearSeeking(); isSeeking = true; seekingSource = source; lastInteractionTime = Date.now();
  if (window.seekingClearTimeout) { clearTimeout(window.seekingClearTimeout); window.seekingClearTimeout = null; }
}

function clearSeekingAfterDelay() {
  if (window.seekingClearTimeout) { clearTimeout(window.seekingClearTimeout); }
  window.seekingClearTimeout = setTimeout(() => { clearSeeking(); syncVideos(true); }, SEEK_COOLDOWN);
}

function clearSeeking() {
  isSeeking = false; seekingSource = null;
  if (window.seekingClearTimeout) { clearTimeout(window.seekingClearTimeout); window.seekingClearTimeout = null; }
}

function markUserInteraction() {
  if (window.userInteractionTimeout) { clearTimeout(window.userInteractionTimeout); }
  isUserInteracting = true; lastInteractionTime = Date.now();
  window.userInteractionTimeout = setTimeout(() => { isUserInteracting = false; window.userInteractionTimeout = null; }, SEEK_COOLDOWN);
}

export {
  initSync, setDelay, disableSync, syncNow,
  getBaseCurrentTime, getReactCurrentTime, getBaseDuration, getReactDuration, isBasePlaying, isReactPlaying, areVideosReady,
  playBase, pauseBase, playReact, pauseReact, seekBase, seekReact,
  syncPlay, syncPause, syncSeek,
  updateBaseUI, updateReactUI, updatePlayPauseButtons, updateUIElements,
  syncVideos, startSyncLoop, stopSyncLoop,
  markUserInteraction, markSeeking, clearSeeking, clearSeekingAfterDelay,
  isVideosSynced, videoReactDelay
};
