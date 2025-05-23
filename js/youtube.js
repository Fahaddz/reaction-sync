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

function retryYouTubeCommand(player,command,verifyFn,attempt=1){if(attempt>MAX_YOUTUBE_RETRIES)return;try{player[command]()}catch(e){}setTimeout(()=>{const s=player.getPlayerState&&player.getPlayerState();if(!verifyFn(s))retryYouTubeCommand(player,command,verifyFn,attempt+1)},500)}

function initializeYouTubePlayer(videoId, isReaction = false, retryCount = 0) {
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
          if (isReaction) {
            reactYoutubePlayer = player; isReactYoutubeVideo = true; isReactYoutubePlayerReady = true;
            try {
              reactYoutubePlayer.setVolume($("#reactVolumeSlider").val() * 100);
              reactYoutubePlayer.setSize($("#videoReactContainer").width(), $("#videoReactContainer").height() - 40);
              setupYouTubeReactControls();
            } catch (e) { console.error("Error setting reaction volume/size:", e); }
          } else {
            baseYoutubePlayer = player; isBaseYoutubeVideo = true; isBaseYoutubePlayerReady = true;
            try { baseYoutubePlayer.addEventListener('onPlaybackQualityChange', onQualityChange); } catch (e) { console.error('Error adding quality change listener:', e); }
            setTimeout(() => { createQualityButton(); setupQualityMenu(); }, 1000);
            try {
              baseYoutubePlayer.setVolume($("#baseVolumeSlider").val() * 100);
              setupYouTubeBaseControls();
            } catch (e) { console.error("Error setting base volume or initializing controls:", e); }
          }
          try {
            setTimeout(() => { setHighestQuality(player, isReaction); retryYouTubeCommand(player,'playVideo',s=>s===YT.PlayerState.PLAYING||s===YT.PlayerState.BUFFERING); }, 500);
          } catch (e) {
            console.error('Initial player setup failed:', e);
            setTimeout(() => initializeYouTubePlayer(videoId, isReaction, retryCount + 1), 2000 * (retryCount + 1));
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
    setTimeout(() => initializeYouTubePlayer(videoId, isReaction, retryCount + 1), 2000 * (retryCount + 1));
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
      if (!isReaction) {
        const qualityButton = $('#youtubeQuality');
        if (qualityButton.length) { qualityButton.text(`Quality: ${qualityLabels[highestQuality] || highestQuality}`); }
      }
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
  if ($('#youtubeQuality').length === 0) {
    const qualityBtn = $(`<button id="youtubeQuality" class="control-button" style="background-color: rgba(50, 50, 50, 0.9); color: white; border: 1px solid rgba(100, 100, 255, 0.5); padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; margin-left: 10px; position: relative; z-index: 1001;">Quality: Auto</button>`);
    $('#baseVideoControls').append(qualityBtn);
    qualityBtn.on('click', function(e) { e.stopPropagation(); toggleQualityMenu(); });
    if (!$('#qualityMenuStyle').length) {
      $('head').append(`<style id="qualityMenuStyle">.quality-menu { position: absolute; bottom: 50px; right: 10px; background-color: rgba(0, 0, 0, 0.9); border-radius: 4px; padding: 10px; z-index: 9999; display: flex; flex-direction: column; gap: 5px; min-width: 180px; border: 1px solid rgba(100, 100, 255, 0.3); box-shadow: 0 5px 15px rgba(0, 0, 0, 0.7); } .quality-option { background-color: rgba(50, 50, 50, 0.8); color: white; border: none; padding: 8px 12px; cursor: pointer; text-align: left; border-radius: 3px; transition: background-color 0.2s; font-size: 13px; } .quality-option:hover { background-color: rgba(80, 80, 80, 0.9); } .quality-option.active { background-color: rgba(60, 60, 180, 0.6); font-weight: bold; }</style>`);
    }
    setTimeout(() => {
      if (baseYoutubePlayer && typeof baseYoutubePlayer.getAvailableQualityLevels === 'function') {
        try { setHighestQuality(baseYoutubePlayer, false); } catch (e) { console.error('Error setting initial quality:', e); }
      }
    }, 2000);
  }
}

function toggleQualityMenu() {
  const menu = $('.quality-menu');
  if (menu.length) {
    menu.is(':visible') ? menu.hide() : (updateQualityMenu(), menu.show());
  } else {
    setupQualityMenu(); $('.quality-menu').show();
  }
}

function setupQualityMenu() {
  $('.quality-menu').remove();
  const qualityMenu = $('<div class="quality-menu"></div>');
  if (!baseYoutubePlayer || typeof baseYoutubePlayer.getAvailableQualityLevels !== 'function') {
    console.error('Cannot setup quality menu - Invalid base player'); return;
  }
  try {
    const availableQualities = baseYoutubePlayer.getAvailableQualityLevels();
    const currentQuality = baseYoutubePlayer.getPlaybackQuality();
    const allQualities = ['auto', 'highres', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
    let availableQualitiesCount = 0;
    for (const quality of allQualities) {
      if (quality !== 'auto' && !availableQualities.includes(quality)) continue;
      availableQualitiesCount++;
      const isActive = quality === currentQuality || (quality === 'auto' && currentQuality === 'default');
      const option = $(`<button class="quality-option ${isActive ? 'active' : ''}" data-quality="${quality}">${qualityLabels[quality] || quality}</button>`);
      option.on('click', function(e) {
        e.stopPropagation(); const selectedQuality = $(this).data('quality');
        if (baseYoutubePlayer && typeof baseYoutubePlayer.setPlaybackQuality === 'function') {
          baseYoutubePlayer.setPlaybackQuality(selectedQuality === 'auto' ? 'default' : selectedQuality);
          $('#youtubeQuality').text(`Quality: ${qualityLabels[selectedQuality] || selectedQuality}`);
          $('.quality-option').removeClass('active'); $(this).addClass('active');
        }
        $('.quality-menu').hide();
      });
      qualityMenu.append(option);
    }
    if (availableQualitiesCount === 0) { qualityMenu.append($('<div style="color:white;padding:10px;text-align:center;">No quality options available</div>')); }
    qualityMenu.append('<hr style="border-color: rgba(255,255,255,0.2); margin: 5px 0;">');
    const closeButton = $('<button class="quality-option">Close</button>');
    closeButton.on('click', function(e) { e.stopPropagation(); $('.quality-menu').hide(); });
    qualityMenu.append(closeButton);
    document.body.appendChild(qualityMenu[0]);
    const positionMenu = () => {
      const qualityButton = $('#youtubeQuality');
      if (qualityButton.length) {
        const buttonPos = qualityButton.offset();
        if (buttonPos) { $(qualityMenu).css({ 'position': 'absolute', 'bottom': (window.innerHeight - buttonPos.top) + 'px', 'left': buttonPos.left + 'px', 'z-index': '10000', 'display': 'none', 'min-width': '200px' }); }
      }
    };
    positionMenu(); $(window).on('resize', positionMenu);
    $(document).on('click', function(e) { if (!$(e.target).closest('#youtubeQuality').length && !$(e.target).closest('.quality-menu').length) { $('.quality-menu').hide(); } });
  } catch (e) { console.error('Error setting up quality menu:', e); }
}

function updateQualityMenu() {
  try {
    if (!baseYoutubePlayer || typeof baseYoutubePlayer.getPlaybackQuality !== 'function') { return; }
    const currentQuality = baseYoutubePlayer.getPlaybackQuality();
    $('.quality-option').removeClass('active');
    $(`.quality-option[data-quality="${currentQuality}"]`).addClass('active');
    if (currentQuality === 'default') { $('.quality-option[data-quality="auto"]').addClass('active'); }
  } catch (e) { console.error('Error updating quality menu:', e); }
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
  } else if (event.data === YT.PlayerState.PAUSED) {
    isReaction ? $("#reactPlayPauseInner").text("⏵") : $("#basePlayPause").text("⏵");
    if(!isReaction) window.baseManuallyPaused = Date.now();
  }
  if (!isReaction && typeof window.onYouTubeBasePlayerStateChange === 'function') {
    window.onYouTubeBasePlayerStateChange(event);
  } else if (isReaction && typeof window.onYouTubeReactPlayerStateChange === 'function') {
    window.onYouTubeReactPlayerStateChange(event);
  }
}

function onQualityChange(event) {
  const newQuality = event.data;
  $('#youtubeQuality').text(`Quality: ${qualityLabels[newQuality] || newQuality}`); // Ensure button has text property for Quality:
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
  $("#baseSeekBar").off("input").on("input", function() {
    if (!baseYoutubePlayer || typeof baseYoutubePlayer.getDuration !== 'function') return;
    const seekPercent = parseFloat($(this).val()); const duration = baseYoutubePlayer.getDuration();
    if (duration > 0) {
      const seekTime = (seekPercent / 100) * duration; baseYoutubePlayer.seekTo(seekTime, true);
      $("#baseTimeDisplay").text(`${secondsToTime(seekTime)} / ${secondsToTime(duration)}`);
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
