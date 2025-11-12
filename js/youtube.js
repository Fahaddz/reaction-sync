import { secondsToTime, getYoutubeId } from './utils.js';

let baseYoutubePlayer = null;
let reactYoutubePlayer = null;
let isBaseYoutubeVideo = false;
let isReactYoutubeVideo = false;
let isBaseYoutubePlayerReady = false;
let isReactYoutubePlayerReady = false;
let baseYoutubeRetryCount = 0;
let reactYoutubeRetryCount = 0;
const MAX_YOUTUBE_RETRIES = 3;

const qualityLabels = {
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
let qualityMenuTarget = 'base';
let qualityMenuAnchor = null;
let qualityMenuBound = false;

function retryYouTubeCommand(player,command,verifyFn,attempt=1){if(attempt>MAX_YOUTUBE_RETRIES)return;try{player[command]()}catch(e){}setTimeout(()=>{const s=player.getPlayerState&&player.getPlayerState();if(!verifyFn(s))retryYouTubeCommand(player,command,verifyFn,attempt+1)},500)}

function initializeYouTubePlayer(videoId, isReaction = false, retryCount = 0, startSeconds = null) {
  if (retryCount > MAX_YOUTUBE_RETRIES) { // Changed from 3 to MAX_YOUTUBE_RETRIES
    alert('Failed to initialize YouTube player after ' + MAX_YOUTUBE_RETRIES + ' attempts');
    return;
  }

  try {
    const containerId = isReaction ? 'videoReactYoutube' : 'videoBaseYoutube';
    if (isReaction) {
      if (reactYoutubePlayer) { try { reactYoutubePlayer.destroy(); } catch (e) { console.error('Error destroying reaction player:', e); } }
    } else {
      if (baseYoutubePlayer) { try { baseYoutubePlayer.destroy(); } catch (e) { console.error('Error destroying base player:', e); } }
    }

    const player = new YT.Player(containerId, {
      videoId: videoId,
      height: '100%',
      width: '100%',
      playerVars: {
        controls: 0, disablekb: 1, modestbranding: 1, rel: 0, enablejsapi: 1,
        playsinline: 1, iv_load_policy: 3,
        origin: window.location.hostname === 'localhost' ? `http://${window.location.hostname}:${window.location.port || '80'}` : window.location.origin // More robust origin
      },
      events: {
        onReady: () => {
          if (isReaction) { reactYoutubePlayer = player; isReactYoutubeVideo = true; isReactYoutubePlayerReady = true; } else { baseYoutubePlayer = player; isBaseYoutubeVideo = true; isBaseYoutubePlayerReady = true; }
          try { if (startSeconds!=null && isFinite(startSeconds) && startSeconds>=0 && typeof player.cueVideoById==='function') { player.cueVideoById({ videoId: videoId, startSeconds: startSeconds }); } } catch(e) {}
          createQualityButton();
          if (isReaction) {
            try { reactYoutubePlayer.addEventListener('onPlaybackQualityChange', onQualityChange); } catch (e) { console.error('Error adding reaction quality change listener:', e); }
            try { reactYoutubePlayer.setVolume($("#reactVolumeSlider").val() * 100); reactYoutubePlayer.setSize($("#videoReactContainer").width(), $("#videoReactContainer").height() - 40); setupYouTubeReactControls(); } catch (e) { console.error("Error setting reaction volume/size:", e); }
          } else {
            try { baseYoutubePlayer.addEventListener('onPlaybackQualityChange', onQualityChange); } catch (e) { console.error('Error adding quality change listener:', e); }
            try { baseYoutubePlayer.setVolume($("#baseVolumeSlider").val() * 100); setupYouTubeBaseControls(); } catch (e) { console.error("Error setting base volume or initializing controls:", e); }
          }
          try {
            try { if (typeof player.pauseVideo === 'function') player.pauseVideo(); } catch (pe) {}
            setTimeout(() => {
              setHighestQuality(player, isReaction);
              try { if (typeof player.pauseVideo === 'function') player.pauseVideo(); } catch (pe) {}
              if (isReaction) { window._suppressYouTubeAutoplayReact = false; } else { window._suppressYouTubeAutoplayBase = false; }
              window._suppressYouTubeAutoplay = false;
            }, 500);
            setTimeout(() => setupQualityMenu(), 800);
          } catch (e) {
            console.error('Initial player setup failed:', e);
            setTimeout(() => initializeYouTubePlayer(videoId, isReaction, retryCount + 1, startSeconds), 2000 * (retryCount + 1));
          }
          exposeYoutubeFunctions(); // Update window variables after player is ready
        },
        onStateChange: (event) => onYoutubeStateChange(event, isReaction),
        onError: (event) => {
          console.error(`YouTube ${isReaction ? 'reaction' : 'base'} player error:`, event.data);
          handleYouTubeError(event.data, isReaction); // Call centralized error handler
        }
      }
    });
    setTimeout(() => {
      if (isReaction) {
        if (reactYoutubePlayer && typeof reactYoutubePlayer.setSize === 'function') {
          const container = $("#videoReactContainer");
          reactYoutubePlayer.setSize(container.width(), container.height() - 40);
        }
      } else {
        if (baseYoutubePlayer && typeof baseYoutubePlayer.setSize === 'function') {
          baseYoutubePlayer.setSize(window.innerWidth, window.innerHeight - 40);
        }
      }
    }, 1000);
  } catch (e) {
    console.error('Player creation error:', e);
    setTimeout(() => initializeYouTubePlayer(videoId, isReaction, retryCount + 1, startSeconds), 2000 * (retryCount + 1));
  }
}

function setHighestQuality(player, isReaction) {
  if (!player || typeof player.getAvailableQualityLevels !== 'function') {
    console.error('Invalid player for quality setting'); return;
  }
  try {
    const preferredOrder = ['highres', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
    const availableQualities = player.getAvailableQualityLevels();
    if (availableQualities.length === 0) { console.warn('No quality levels available'); return; }
    let highestQuality = 'default';
    for (const quality of preferredOrder) {
      if (availableQualities.includes(quality)) { highestQuality = quality; break; }
    }
    let retryCount = 0; const maxRetries = 3;
    function trySetQuality() {
      player.setPlaybackQuality(highestQuality);
      updateQualityButtonLabel(highestQuality, isReaction ? 'react' : 'base');
      setTimeout(() => {
        const currentQuality = player.getPlaybackQuality();
        if (currentQuality !== highestQuality && availableQualities.includes(highestQuality) && retryCount < maxRetries) {
          retryCount++; trySetQuality();
        } else if (retryCount >= maxRetries) {
          console.warn(`Couldn't set ${isReaction ? 'reaction' : 'base'} quality to ${highestQuality} after ${maxRetries} attempts`);
        }
      }, 1000);
    }
    trySetQuality();
  } catch (e) { console.error('Error setting highest quality:', e); }
}

function createQualityButton() {
  let qualityBtn = $('#youtubeQuality');
  if (!qualityBtn.length) {
    qualityBtn = $(`<button id="youtubeQuality" class="control-button" style="background-color: rgba(50, 50, 50, 0.9); color: white; border: 1px solid rgba(100, 100, 255, 0.5); padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; margin-left: 10px; position: relative; z-index: 1001; pointer-events: auto;">Quality: Auto</button>`);
    $('#baseVideoControls').append(qualityBtn);
  }
  qualityBtn.css({'pointer-events': 'auto', 'z-index': '1001', 'position': 'relative'});
  qualityBtn.off('click').on('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    toggleQualityMenu();
    return false;
  });
  if (!$('#qualityMenuStyle').length) {
    $('head').append(`<style id="qualityMenuStyle">.quality-menu { position: fixed; background-color: rgba(0, 0, 0, 0.92); border-radius: 6px; padding: 12px 10px; z-index: 10000; display: none; flex-direction: column; gap: 6px; min-width: 180px; border: 1px solid rgba(100, 100, 255, 0.25); box-shadow: 0 12px 24px rgba(0, 0, 0, 0.6); pointer-events: auto; } .quality-option { background-color: rgba(50, 50, 50, 0.85); color: white; border: none; padding: 8px 12px; cursor: pointer; text-align: left; border-radius: 4px; transition: background-color 0.2s; font-size: 13px; pointer-events: auto; } .quality-option:hover { background-color: rgba(80, 80, 80, 0.9); } .quality-option.active { background-color: rgba(60, 60, 180, 0.6); font-weight: bold; } .quality-empty { color: rgba(255,255,255,0.7); text-align: center; font-size: 12px; padding: 6px; }</style>`);
  }
  qualityMenuAnchor = qualityBtn;
  setupQualityMenu();
}

function toggleQualityMenu() {
  const anchor = qualityMenuAnchor && qualityMenuAnchor.length ? qualityMenuAnchor : $('#youtubeQuality');
  if (!anchor.length) return;
  const existing = $('.quality-menu');
  if (existing.length && existing.is(':visible')) {
    existing.remove();
    return;
  }
  const context = resolveQualityContext();
  if (!context) {
    console.warn('Quality menu unavailable: no YouTube player ready');
    return;
  }
  qualityMenuTarget = context.key;
  renderQualityMenu(context, anchor);
}

function setupQualityMenu() {
  bindQualityMenuEvents();
  const context = resolveQualityContext();
  if (context && context.player && typeof context.player.getPlaybackQuality === 'function') {
    qualityMenuTarget = context.key;
    updateQualityButtonLabel(context.player.getPlaybackQuality(), context.key);
  } else {
    updateQualityButtonLabel('auto', 'base');
  }
}

function updateQualityMenu() {
  try {
    const menu = $('.quality-menu');
    if (!menu.length) return;
    const context = resolveQualityContext();
    if (!context || !context.player || typeof context.player.getPlaybackQuality !== 'function') return;
    const currentQuality = normalizeQualityValue(context.player.getPlaybackQuality());
    $('.quality-option').removeClass('active');
    $(`.quality-option[data-quality="${currentQuality}"]`).addClass('active');
  } catch (e) { console.error('Error updating quality menu:', e); }
}

function resolveQualityContext() {
  const contexts = [];
  if (isBaseYoutubeVideo && baseYoutubePlayer && typeof baseYoutubePlayer.getAvailableQualityLevels === 'function') {
    contexts.push({ player: baseYoutubePlayer, key: 'base' });
  }
  if (isReactYoutubeVideo && reactYoutubePlayer && typeof reactYoutubePlayer.getAvailableQualityLevels === 'function') {
    contexts.push({ player: reactYoutubePlayer, key: 'react' });
  }
  if (!contexts.length) return null;
  const preferred = contexts.find(ctx => ctx.key === qualityMenuTarget);
  return preferred || contexts[0];
}

function renderQualityMenu(context, anchor) {
  try {
    $('.quality-menu').remove();
    if (!context || !context.player || typeof context.player.getAvailableQualityLevels !== 'function') return null;
    const menu = $('<div class="quality-menu"></div>');
    const levels = context.player.getAvailableQualityLevels() || [];
    const options = buildQualityOptions(levels);
    const currentQuality = normalizeQualityValue(context.player.getPlaybackQuality ? context.player.getPlaybackQuality() : 'default');
    if (!options.length) {
      menu.append('<div class="quality-empty">No quality options available</div>');
    } else {
      options.forEach((quality) => {
        const labelKey = quality === 'auto' ? 'auto' : quality;
        const option = $(`<button class="quality-option${quality === currentQuality ? ' active' : ''}" data-quality="${quality}">${qualityLabels[labelKey] || labelKey}</button>`);
        option.css({'pointer-events': 'auto', 'cursor': 'pointer'});
        option.on('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          applyQualitySelection(context, quality);
          $('.quality-menu').remove();
          return false;
        });
        menu.append(option);
      });
    }
    $('body').append(menu);
    qualityMenuAnchor = anchor;
    menu.css('display', 'flex');
    positionQualityMenu(menu, anchor);
    bindQualityMenuEvents();
    updateQualityButtonLabel(currentQuality, context.key);
    return menu;
  } catch (e) {
    console.error('Error rendering quality menu:', e);
    return null;
  }
}

function buildQualityOptions(levels) {
  const available = Array.isArray(levels) ? levels.slice() : [];
  const unique = Array.from(new Set(available));
  const ordered = [];
  if (unique.includes('default') || unique.includes('auto') || unique.length) { ordered.push('auto'); }
  const preference = ['highres', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  preference.forEach((quality) => {
    if (unique.includes(quality)) ordered.push(quality);
  });
  const filtered = Array.from(new Set(ordered));
  return filtered;
}

function applyQualitySelection(context, quality) {
  try {
    if (!context || !context.player || typeof context.player.setPlaybackQuality !== 'function') return;
    const targetQuality = quality === 'auto' ? 'default' : quality;
    context.player.setPlaybackQuality(targetQuality);
    updateQualityButtonLabel(targetQuality, context.key);
    setTimeout(() => {
      try {
        const resolved = normalizeQualityValue(context.player.getPlaybackQuality ? context.player.getPlaybackQuality() : targetQuality);
        updateQualityButtonLabel(resolved, context.key);
      } catch (innerErr) { console.error('Error confirming quality selection:', innerErr); }
    }, 250);
  } catch (e) { console.error('Error applying quality selection:', e); }
}

function updateQualityButtonLabel(quality, targetKey) {
  const button = $('#youtubeQuality');
  if (!button.length) return;
  const normalized = normalizeQualityValue(quality);
  const label = qualityLabels[normalized === 'auto' ? 'auto' : normalized] || normalized;
  const suffix = targetKey === 'react' ? ' (React)' : '';
  button.text(`Quality: ${label}${suffix}`);
}

function positionQualityMenu(menu, anchor) {
  if (!menu || !menu.length || !anchor || !anchor.length) return;
  const rect = anchor[0].getBoundingClientRect();
  const menuWidth = menu.outerWidth();
  const menuHeight = menu.outerHeight();
  let top = rect.top - menuHeight - 8;
  if (top < 8) top = rect.bottom + 8;
  let left = rect.left;
  const maxLeft = window.innerWidth - menuWidth - 8;
  if (left > maxLeft) left = maxLeft;
  if (left < 8) left = 8;
  menu.css({ top: `${top}px`, left: `${left}px` });
}

function bindQualityMenuEvents() {
  if (qualityMenuBound) return;
  qualityMenuBound = true;
  $(document).on('click.ytQuality', function(e) {
    if (!$(e.target).closest('#youtubeQuality').length && !$(e.target).closest('.quality-menu').length) {
      $('.quality-menu').remove();
    }
  });
  $(window).on('resize.ytQuality', function() {
    const menu = $('.quality-menu');
    const anchor = qualityMenuAnchor && qualityMenuAnchor.length ? qualityMenuAnchor : $('#youtubeQuality');
    if (menu.length && anchor.length) {
      positionQualityMenu(menu, anchor);
    }
  });
}

function normalizeQualityValue(value) {
  if (!value) return 'auto';
  return value === 'default' ? 'auto' : value;
}

function handleYouTubeError(errorCode, isReaction = false) {
  const errors = { 2: "Invalid URL parameters", 5: "HTML5 player error", 100: "Video not found", 101: "Embedding disabled", 150: "Embedding disabled" };
  let retryCount = isReaction ? reactYoutubeRetryCount : baseYoutubeRetryCount;

  if (retryCount < MAX_YOUTUBE_RETRIES) {
    isReaction ? reactYoutubeRetryCount++ : baseYoutubeRetryCount++;
    retryCount++; // use updated count for log
    console.warn(`YouTube ${isReaction ? 'Reaction' : 'Base'} Error: ${errors[errorCode] || "Unknown error"} - Retrying (${retryCount}/${MAX_YOUTUBE_RETRIES})`);
    setTimeout(() => {
      try {
        const player = isReaction ? reactYoutubePlayer : baseYoutubePlayer;
        if (player && typeof player.getVideoData === 'function') {
          const videoId = player.getVideoData().video_id;
          if (videoId) { initializeYouTubePlayer(videoId, isReaction, retryCount); return; } // Re-initialize with current retryCount
        }
        throw new Error("YouTube player not ready for retry or no videoId.");
      } catch (e) {
        console.error(`${isReaction ? 'Reaction' : 'Base'} retry/reinitialization failed:`, e);
         // If re-initialization failed here, it might loop if initializeYouTubePlayer itself errors out.
         // The main initializeYouTubePlayer has its own retry for creation errors.
      }
    }, 2000 * retryCount); // Exponential backoff for retry
    return;
  }
  alert(`YouTube ${isReaction ? 'Reaction' : 'Base'} Error: ${errors[errorCode] || "Unknown error"} (Failed after ${MAX_YOUTUBE_RETRIES} retries)`);
  if (isReaction) {
    isReactYoutubeVideo = false; $("#videoReactYoutube").hide(); $("#videoReact").show(); reactYoutubeRetryCount = 0;
  } else {
    isBaseYoutubeVideo = false; $("#videoBaseYoutube").hide(); $("#videoBaseLocal").show(); baseYoutubeRetryCount = 0;
  }
  exposeYoutubeFunctions(); // Update global state
}

function onYoutubeStateChange(event, isReaction = false) {
  if (event.data === YT.PlayerState.BUFFERING) {
    if (window.isVideosSynced) {
      if (isReaction) { window.pauseBase && window.pauseBase(true); } else { window.pauseReact && window.pauseReact(true); }
    }
  }
  if (event.data === YT.PlayerState.ERROR) {
    handleYouTubeError(event.data, isReaction); return; // Already handled by onError in player init for some cases, but good to have
  }
  if (event.data === YT.PlayerState.PLAYING) {
    isReaction ? reactYoutubeRetryCount = 0 : baseYoutubeRetryCount = 0;
    isReaction ? $("#reactPlayPauseInner").text("⏸") : $("#basePlayPause").text("⏸");
    if(!isReaction) window.baseManuallyPaused = null;
    
    // Trigger sync when user clicks YouTube video to play (only if not already in a sync operation)
    if (window.isVideosSynced && window.syncPlay && typeof window.syncPlay === 'function' && !window.isSeeking) {
      if (!isReaction) {
        setTimeout(() => {
          if (window.isVideosSynced && !window.isSeeking) window.syncPlay(true);
        }, 50); // Small delay to prevent feedback loops
      } else {
        setTimeout(() => {
          if (window.isVideosSynced && !window.isSeeking) window.syncPlay(false);
        }, 50);
      }
    }
  } else if (event.data === YT.PlayerState.PAUSED) {
    isReaction ? $("#reactPlayPauseInner").text("⏵") : $("#basePlayPause").text("⏵");
    if(!isReaction) window.baseManuallyPaused = Date.now();
    
    // Trigger sync when user clicks YouTube video to pause (only if not already in a sync operation)
    if (window.isVideosSynced && window.syncPause && typeof window.syncPause === 'function' && !window.isSeeking) {
      if (!isReaction) {
        setTimeout(() => {
          if (window.isVideosSynced && !window.isSeeking) window.syncPause(true);
        }, 50); // Small delay to prevent feedback loops
      } else {
        setTimeout(() => {
          if (window.isVideosSynced && !window.isSeeking) window.syncPause(false);
        }, 50);
      }
    }
  }
  if (!isReaction && typeof window.onYouTubeBasePlayerStateChange === 'function') {
    window.onYouTubeBasePlayerStateChange(event);
  } else if (isReaction && typeof window.onYouTubeReactPlayerStateChange === 'function') {
    window.onYouTubeReactPlayerStateChange(event);
  }
}

function onQualityChange(event) {
  const newQuality = event.data;
  const targetKey = event && event.target === reactYoutubePlayer ? 'react' : 'base';
  updateQualityButtonLabel(newQuality, targetKey);
  updateQualityMenu();
}

function setupYouTubeReactControls() {
  let seekIntervalReact = null;
  const updateReactSeekBar = () => {
    if (reactYoutubePlayer && typeof reactYoutubePlayer.getCurrentTime === 'function' && typeof reactYoutubePlayer.getDuration === 'function') {
      const currentTime = reactYoutubePlayer.getCurrentTime(); const duration = reactYoutubePlayer.getDuration();
      if (duration > 0) {
        $("#reactSeekBar").val((currentTime / duration) * 100);
        $("#reactTimeDisplay").text(`${secondsToTime(currentTime)} / ${secondsToTime(duration)}`);
      }
    }
  };
  if (window.reactSeekInterval) clearInterval(window.reactSeekInterval); // Clear previous interval
  window.reactSeekInterval = setInterval(updateReactSeekBar, 1000);
  if (reactYoutubePlayer && typeof reactYoutubePlayer.addEventListener === 'function') {
    reactYoutubePlayer.addEventListener('onStateChange', (event) => { if (event.data === YT.PlayerState.ENDED) { clearInterval(window.reactSeekInterval); } });
  }
  
  // Add seek bar handlers for YouTube reaction video (missing critical sync functionality)
  let lastReactYTSeekTime = 0;
  const seekCooldown = 50;

  $("#reactSeekBar").off("mousedown touchstart").on('mousedown touchstart', function() {
    if (window.isReactSeeking !== undefined) window.isReactSeeking = true;
    if (window.markUserInteraction && typeof window.markUserInteraction === 'function') {
      window.markUserInteraction();
    }
  });

  $("#reactSeekBar").off("input").on("input", function() {
    if (!reactYoutubePlayer || typeof reactYoutubePlayer.getDuration !== 'function') return;
    
    const now = Date.now();
    if (now - lastReactYTSeekTime < seekCooldown) return;
    lastReactYTSeekTime = now;

    const seekPercent = parseFloat($(this).val()); 
    const duration = reactYoutubePlayer.getDuration();
    if (isNaN(duration) || duration <= 0) {
      console.log('Cannot seek: invalid YouTube reaction video duration');
      return;
    }
    
    const seekTime = (seekPercent / 100) * duration;
    if (window.markUserInteraction && typeof window.markUserInteraction === 'function') {
      window.markUserInteraction();
    }
    
    try {
      if (window.syncSeek && typeof window.syncSeek === 'function') {
        window.syncSeek(false, seekTime);
      } else {
        reactYoutubePlayer.seekTo(seekTime, true);
        $("#reactTimeDisplay").text(`${secondsToTime(seekTime)} / ${secondsToTime(duration)}`);
      }
    } catch (e) {
      console.error('Error during YouTube reaction video seeking:', e);
    }
  });
  
  $(".reactControls").css({ "position": "absolute", "bottom": "0", "left": "0", "right": "0", "z-index": "1000" });
  const container = $("#videoReactContainer");
  if (reactYoutubePlayer && typeof reactYoutubePlayer.setSize === 'function') {
    reactYoutubePlayer.setSize(container.width(), container.height() - 40);
  }
}

function setupYouTubeBaseControls() {
  let seekIntervalBase = null;
  const updateBaseSeekBar = () => {
    if (baseYoutubePlayer && typeof baseYoutubePlayer.getCurrentTime === 'function' && typeof baseYoutubePlayer.getDuration === 'function') {
      const currentTime = baseYoutubePlayer.getCurrentTime(); const duration = baseYoutubePlayer.getDuration();
      if (duration > 0) {
        $("#baseSeekBar").val((currentTime / duration) * 100);
        $("#baseTimeDisplay").text(`${secondsToTime(currentTime)} / ${secondsToTime(duration)}`);
      }
    } else { console.warn("Base YouTube player not ready for time update in setupYouTubeBaseControls"); }
  };
  if (window.baseSeekInterval) clearInterval(window.baseSeekInterval); // Clear previous interval
  window.baseSeekInterval = setInterval(updateBaseSeekBar, 1000);
  if (baseYoutubePlayer && typeof baseYoutubePlayer.addEventListener === 'function') {
    baseYoutubePlayer.addEventListener('onStateChange', (event) => { if (event.data === YT.PlayerState.ENDED) { clearInterval(window.baseSeekInterval); } });
  }
  let lastBaseYTSeekTime = 0;
  const seekCooldown = 50;

  $("#baseSeekBar").off("mousedown touchstart").on('mousedown touchstart', function() {
    if (window.isBaseSeeking !== undefined) window.isBaseSeeking = true;
    if (window.markUserInteraction && typeof window.markUserInteraction === 'function') {
      window.markUserInteraction();
    }
  });

  $("#baseSeekBar").off("input").on("input", function() {
    if (!baseYoutubePlayer || typeof baseYoutubePlayer.getDuration !== 'function') return;
    
    const now = Date.now();
    if (now - lastBaseYTSeekTime < seekCooldown) return;
    lastBaseYTSeekTime = now;

    const seekPercent = parseFloat($(this).val()); 
    const duration = baseYoutubePlayer.getDuration();
    if (isNaN(duration) || duration <= 0) {
      console.log('Cannot seek: invalid YouTube base video duration');
      return;
    }
    
    const seekTime = (seekPercent / 100) * duration;
    if (window.markUserInteraction && typeof window.markUserInteraction === 'function') {
      window.markUserInteraction();
    }
    
    try {
      if (window.syncSeek && typeof window.syncSeek === 'function') {
        window.syncSeek(true, seekTime);
      } else {
        baseYoutubePlayer.seekTo(seekTime, true);
        $("#baseTimeDisplay").text(`${secondsToTime(seekTime)} / ${secondsToTime(duration)}`);
      }
    } catch (e) {
      console.error('Error during YouTube base video seeking:', e);
    }
  });
}

function exposeYoutubeFunctions() {
  window.baseYoutubePlayer = baseYoutubePlayer; window.reactYoutubePlayer = reactYoutubePlayer;
  window.isBaseYoutubeVideo = isBaseYoutubeVideo; window.isReactYoutubeVideo = isReactYoutubeVideo;
  window.isBaseYoutubePlayerReady = isBaseYoutubePlayerReady; window.isReactYoutubePlayerReady = isReactYoutubePlayerReady;
  window.initializeYouTubePlayer = initializeYouTubePlayer; window.setHighestQuality = setHighestQuality;
  window.toggleQualityMenu = toggleQualityMenu; window.setupQualityMenu = setupQualityMenu;
  window.setupYouTubeReactControls = setupYouTubeReactControls; window.setupYouTubeBaseControls = setupYouTubeBaseControls;
}
exposeYoutubeFunctions();
// The interval for updateYoutubeReferences can be removed if exposeYoutubeFunctions is called whenever player instances change.
// For now, per user request not to break features, it's kept commented out but effectively replaced by calls within onReady.
// setInterval(exposeYoutubeFunctions, 5000); 

export {
  initializeYouTubePlayer, handleYouTubeError, onYoutubeStateChange, onQualityChange,
  setupYouTubeReactControls, setupYouTubeBaseControls,
  baseYoutubePlayer, reactYoutubePlayer, isBaseYoutubeVideo, isReactYoutubeVideo,
  isBaseYoutubePlayerReady, isReactYoutubePlayerReady, setHighestQuality
};
