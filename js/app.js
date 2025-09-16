import {
  secondsToTime,
  getYoutubeId
} from './utils.js';

import {
  initializeYouTubePlayer
} from './youtube.js';

import {
  selectLocalVideo,
  loadSubtitles
} from './local-video.js';

import {
  initSync,
  setDelay,
  disableSync,
  syncNow,
  getBaseCurrentTime,
  getReactCurrentTime,
  getBaseDuration,
  getReactDuration,
  updatePlayPauseButtons,
  updateBaseUI,
  updateReactUI,
  syncVideos,
  isVideosSynced,
  markUserInteraction,
  syncPlay,
  syncPause,
  syncSeek,
  seekBase,
  seekReact,
  playBase,
  pauseBase,
  playReact,
  pauseReact,
  isBasePlaying,
  isReactPlaying
} from './sync.js';

window.syncPlay = syncPlay;
window.syncPause = syncPause;
window.syncSeek = syncSeek;
window.playBase = playBase;
window.pauseBase = pauseBase;
window.playReact = playReact;
window.pauseReact = pauseReact;
window.seekBase = seekBase;
window.seekReact = seekReact;
window.isBasePlaying = isBasePlaying;
window.isReactPlaying = isReactPlaying;
window.isVideosSynced = isVideosSynced;

let baseYoutubePlayer = null;
let reactYoutubePlayer = null;
let isBaseYoutubeVideo = false;
let isReactYoutubeVideo = false;

function updateYouTubePlayers() {
  import('./youtube.js').then(youtubeModule => {
    baseYoutubePlayer = youtubeModule.baseYoutubePlayer;
    reactYoutubePlayer = youtubeModule.reactYoutubePlayer;
    isBaseYoutubeVideo = youtubeModule.isBaseYoutubeVideo;
    isReactYoutubeVideo = youtubeModule.isReactYoutubeVideo;

    const playersChanged =
      window.previousBaseYoutubePlayer !== baseYoutubePlayer ||
      window.previousReactYoutubePlayer !== reactYoutubePlayer;

    if (playersChanged) {
      initSync(baseYoutubePlayer, reactYoutubePlayer, isBaseYoutubeVideo, isReactYoutubeVideo);
      window.previousBaseYoutubePlayer = baseYoutubePlayer;
      window.previousReactYoutubePlayer = reactYoutubePlayer;

      if (isBaseYoutubeVideo && typeof window.setupYouTubeBaseControls === 'function') {
        window.setupYouTubeBaseControls();
      }
      if (isReactYoutubeVideo && typeof window.setupYouTubeReactControls === 'function') {
        window.setupYouTubeReactControls();
      }
    }
  }).catch(err => {
    console.error('Error updating YouTube player references:', err);
  });
}

if (window.location.protocol === 'file:') {
  alert('Note: For YouTube to work properly, you need to serve this page through a local web server (not file://)');
}

async function selectVideo(videoSelector, callback, isLink = false) {
  if (isLink) {
    let videoUrl = prompt("Enter YouTube URL or direct video link:");
    if (!videoUrl) return;

    const youtubeId = getYoutubeId(videoUrl);

    if (youtubeId) {
      if (videoSelector === "#videoBaseLocal") {
        $("#videoBaseLocal").hide();
        $("#videoBaseYoutube").show();
        $("#videoBaseYoutube").css({
          width: "100%",
          height: "100%",
          display: "block"
        });
        initializeYouTubePlayer(youtubeId, false);
        isBaseYoutubeVideo = true;
        setTimeout(() => {
          if (typeof window.setupYouTubeBaseControls === 'function') {
            window.setupYouTubeBaseControls();
          }
          updateYouTubePlayers();
        }, 2000);
      } else {
        $("#videoReact").hide();
        $("#videoReactYoutube").css({
          width: "100%",
          height: "100%",
          display: "block"
        });
        initializeYouTubePlayer(youtubeId, true);
        isReactYoutubeVideo = true;
        setTimeout(() => {
          updateYouTubePlayers();
        }, 2000);
      }
    } else {
      // Handle direct video links (non-YouTube)
      if (videoSelector === "#videoBaseLocal") {
        // Reset YouTube state for base video
        isBaseYoutubeVideo = false;
        $("#videoBaseYoutube").hide();
        $("#videoBaseLocal").show();
        
        // Set the video source directly
        $(videoSelector).attr("src", videoUrl);
        $(videoSelector)[0].load();
        
        // Set document title to URL filename
        try {
          const urlObj = new URL(videoUrl);
          const filename = urlObj.pathname.split('/').pop() || 'Direct Video Link';
          document.title = filename;
        } catch (e) {
          document.title = 'Direct Video Link';
        }
        
        $(videoSelector).trigger("loadedmetadata");
      } else {
        // Handle reaction video direct link
        isReactYoutubeVideo = false;
        $("#videoReactYoutube").hide();
        $("#videoReact").show();
        
        // Set the video source directly
        $(videoSelector).attr("src", videoUrl);
        $(videoSelector)[0].load();
        
        $(videoSelector).trigger("loadedmetadata");
        
        // Check for delay token in filename (same as local files)
        try {
          const urlObj = new URL(videoUrl);
          const filename = urlObj.pathname.split('/').pop() || '';
          let tokens = filename.split(".");
          let num = tokens.find(
            (token) => token.split("dt")[0] == "" && !isNaN(token.split("dt")[1])
          );
          if (num) {
            num = num.split("dt")[1];
            setDelay(Number(num) / 10);
          }
        } catch (e) {
          console.log('Could not parse filename for delay token:', e);
        }
      }
      
      // Call callback if provided
      if (callback) {
        try {
          const urlObj = new URL(videoUrl);
          const filename = urlObj.pathname.split('/').pop() || videoUrl;
          callback({ name: filename, url: videoUrl });
        } catch (e) {
          callback({ name: videoUrl, url: videoUrl });
        }
      }
    }
  } else {
    selectLocalVideo(videoSelector, callback);
  }
}

function trySyncVideos() {
  updateYouTubePlayers();
  syncVideos(true);
}

export {
  selectVideo,
  trySyncVideos
};

document.addEventListener('DOMContentLoaded', function() {
  window.selectVideo = selectVideo;
  

  document.addEventListener('syncStateChange', function() {
    trySyncVideos();
  });

  

  window.setDelay = function(delay) {
    setDelay(delay);
  };

  window.syncNow = syncNow;
  window.disableSync = disableSync;
  window.loadSubtitles = loadSubtitles;
  window.updatePlayPauseButtons = updatePlayPauseButtons;
  window.getBaseCurrentTime = getBaseCurrentTime;
  window.getReactCurrentTime = getReactCurrentTime;

  $("#basePlayPause").on('click', function() {
    const isCurrentlyPlaying = isBasePlaying();
    if (isCurrentlyPlaying) {
      syncPause(true);
    } else {
      syncPlay(true);
    }
  });

  $("#reactPlayPauseInner").on('click', function() {
    const isCurrentlyPlaying = isReactPlaying();
    if (isCurrentlyPlaying) {
      syncPause(false);
    } else {
      syncPlay(false);
    }
  });

  let isBaseSeeking = false;
  let lastBaseSeekTime = 0;
  let lastReactSeekTime = 0;
  const seekCooldown = 50;

  $("#baseSeekBar").on('mousedown touchstart', function() {
    isBaseSeeking = true;
  });

  $(document).on('mouseup touchend', function() {
    if (isBaseSeeking) {
      isBaseSeeking = false;
    }
  });

  $("#baseSeekBar").on('mousedown touchstart', function() {
    window.isBaseSeeking = true;
    markUserInteraction();
  });

  $("#baseSeekBar").on('input', function() {
    const now = Date.now();
    if (now - lastBaseSeekTime < seekCooldown) return;
    lastBaseSeekTime = now;

    const percent = parseFloat(this.value);
    const duration = getBaseDuration();
    if (isNaN(duration) || duration <= 0) {
      console.log('Cannot seek: invalid base video duration');
      return;
    }
    const targetTime = (percent / 100) * duration;
    markUserInteraction();
    try {
      syncSeek(true, targetTime);
    } catch (e) {
      console.error('Error during base video seeking:', e);
    }
  });

  window.isReactSeeking = false;
  window.isBaseSeeking = false;

  $(document).on('mouseup touchend', function() {
    if (window.isReactSeeking || window.isBaseSeeking) {
      const wasReactSeeking = window.isReactSeeking;
      const wasBaseSeeking = window.isBaseSeeking;
      window.isReactSeeking = false;
      window.isBaseSeeking = false;
      setTimeout(() => {
        if (isVideosSynced) {
          syncVideos(true, !wasReactSeeking);
        }
      }, 100);
    }
  });

  $("#reactSeekBar").on('mousedown touchstart', function() {
    window.isReactSeeking = true;
    markUserInteraction();
  });

  $("#reactSeekBar").on('input', function() {
    const now = Date.now();
    if (now - lastReactSeekTime < seekCooldown) return;
    lastReactSeekTime = now;

    const percent = parseFloat(this.value);
    const duration = getReactDuration();
    if (isNaN(duration) || duration <= 0) {
      console.log('Cannot seek: invalid reaction video duration');
      return;
    }
    const targetTime = (percent / 100) * duration;
    markUserInteraction();
    try {
      syncSeek(false, targetTime);
    } catch (e) {
      console.error('Error during reaction video seeking:', e);
    }
  });

  $("#videoBaseLocal").on('click', function(e) {
    if (e.target === this) {
      e.preventDefault();
      e.stopPropagation();
      const isPlaying = !this.paused;
      if (isPlaying) {
        syncPause(true);
      } else {
        syncPlay(true);
      }
    }
  });

  $("#videoReact").on('click', function(e) {
    if (e.target === this) {
      e.preventDefault();
      e.stopPropagation();
      const isPlaying = !this.paused;
      if (isPlaying) {
        syncPause(false);
      } else {
        syncPlay(false);
      }
    }
  });

  $("#videoBaseContainer").on('mouseenter click', function() {
    document.getElementById('videoBaseContainer').dataset.lastInteracted = Date.now();
  });

  $("#videoReactContainer").on('mouseenter click', function() {
    document.getElementById('videoReactContainer').dataset.lastInteracted = Date.now();
  });

  document.getElementById('videoBaseContainer').dataset.lastInteracted = 0;
  document.getElementById('videoReactContainer').dataset.lastInteracted = 0;

  window.onYouTubeBasePlayerStateChange = function(event) {
    updatePlayPauseButtons();
  };

  window.onYouTubeReactPlayerStateChange = function(event) {
    updatePlayPauseButtons();
  };

  document.addEventListener('keydown', function(e) {
    if (window.keydownHandler && typeof window.keydownHandler === 'function') {
      if (window.keydownHandler(e)) {
        return;
      }
    }

    const isArrowKey = [37, 38, 39, 40].includes(e.keyCode);
    if (isArrowKey) {
      e.preventDefault();
      e.stopPropagation();
      const targetIsBase = e.shiftKey;
      let seekAmount = 0;

      if (e.keyCode === 37) {
        seekAmount = -5;
      } else if (e.keyCode === 39) {
        seekAmount = 5;
      } else if (e.keyCode === 38) { // Up arrow
        const volumeSlider = targetIsBase ? $("#baseVolumeSlider") : $("#reactVolumeSlider");
        let currentVolume = parseFloat(volumeSlider.val());
        let newVolume = Math.min(1, currentVolume + 0.1);
        volumeSlider.val(newVolume);
        if (targetIsBase) {
          if (isBaseYoutubeVideo && baseYoutubePlayer && typeof baseYoutubePlayer.setVolume === 'function') {
            baseYoutubePlayer.setVolume(newVolume * 100);
          } else if ($("#videoBaseLocal")[0]) {
            $("#videoBaseLocal")[0].volume = newVolume;
          }
        } else {
          if (isReactYoutubeVideo && reactYoutubePlayer && typeof reactYoutubePlayer.setVolume === 'function') {
            reactYoutubePlayer.setVolume(newVolume * 100);
          } else if ($("#videoReact")[0]) {
            $("#videoReact")[0].volume = newVolume;
          }
        }
        return;
      } else if (e.keyCode === 40) { // Down arrow
        const volumeSlider = targetIsBase ? $("#baseVolumeSlider") : $("#reactVolumeSlider");
        let currentVolume = parseFloat(volumeSlider.val());
        let newVolume = Math.max(0, currentVolume - 0.1);
        volumeSlider.val(newVolume);
        if (targetIsBase) {
          if (isBaseYoutubeVideo && baseYoutubePlayer && typeof baseYoutubePlayer.setVolume === 'function') {
            baseYoutubePlayer.setVolume(newVolume * 100);
          } else if ($("#videoBaseLocal")[0]) {
            $("#videoBaseLocal")[0].volume = newVolume;
          }
        } else {
          if (isReactYoutubeVideo && reactYoutubePlayer && typeof reactYoutubePlayer.setVolume === 'function') {
            reactYoutubePlayer.setVolume(newVolume * 100);
          } else if ($("#videoReact")[0]) {
            $("#videoReact")[0].volume = newVolume;
          }
        }
        return;
      }

      if (seekAmount !== 0) {
        markUserInteraction();
        let currentTime = 0;
        if (targetIsBase) {
          currentTime = getBaseCurrentTime();
          const newTime = Math.max(0, currentTime + seekAmount);
          syncSeek(true, newTime);
        } else {
          currentTime = getReactCurrentTime();
          const newTime = Math.max(0, currentTime + seekAmount);
          syncSeek(false, newTime);
        }
        return;
      }
    }

    if (e.keyCode === 32) { // Space key
      e.preventDefault();
      const baseContainer = document.getElementById('videoBaseContainer');
      const reactContainer = document.getElementById('videoReactContainer');
      const reactRect = reactContainer.getBoundingClientRect();
      const isMouseOverReact = (
        e.clientX >= reactRect.left &&
        e.clientX <= reactRect.right &&
        e.clientY >= reactRect.top &&
        e.clientY <= reactRect.bottom
      );
      const reactLastInteracted = reactContainer.dataset.lastInteracted || 0;
      const baseLastInteracted = baseContainer.dataset.lastInteracted || 0;
      const isReactFocused = isMouseOverReact || (parseInt(reactLastInteracted) > parseInt(baseLastInteracted));
      const sourceIsBase = !isReactFocused;

      if (sourceIsBase) {
        isBasePlaying() ? syncPause(true) : syncPlay(true);
      } else {
        isReactPlaying() ? syncPause(false) : syncPlay(false);
      }
    }
  });

  $("#baseVolumeSlider").on('input', function() {
    const volume = parseFloat(this.value);
    if (isBaseYoutubeVideo && baseYoutubePlayer) {
      baseYoutubePlayer.setVolume(volume * 100);
    } else if ($("#videoBaseLocal")[0]) {
      $("#videoBaseLocal")[0].volume = volume;
    }
  });

  $("#reactVolumeSlider").on('input', function() {
    const volume = parseFloat(this.value);
    if (isReactYoutubeVideo && reactYoutubePlayer) {
      reactYoutubePlayer.setVolume(volume * 100);
    } else if ($("#videoReact")[0]) {
      $("#videoReact")[0].volume = volume;
    }
  });

  setInterval(function() {
    if (!isBaseYoutubeVideo && $("#videoBaseLocal").attr("src")) {
      const video = $("#videoBaseLocal")[0];
      if (video.readyState > 0) { // Ensure metadata is loaded
        const current = secondsToTime(video.currentTime);
        const total = secondsToTime(video.duration || 0);
        $("#baseTimeDisplay").text(`${current} / ${total}`);
        if (video.duration) { // Avoid division by zero or NaN
             $("#baseSeekBar").val((video.currentTime / video.duration) * 100);
        }
      }
    }

    if (!isReactYoutubeVideo && $("#videoReact").attr("src")) {
      const video = $("#videoReact")[0];
       if (video.readyState > 0) { // Ensure metadata is loaded
        const current = secondsToTime(video.currentTime);
        const total = secondsToTime(video.duration || 0);
        $("#reactTimeDisplay").text(`${current} / ${total}`);
        if (video.duration) { // Avoid division by zero or NaN
            $("#reactSeekBar").val((video.currentTime / video.duration) * 100);
        }
      }
    }
  }, 1000);

  $(window).on('resize', function() {
    updateVideoContainers();
  });
});

window.addEventListener('DOMContentLoaded', function() {
  if (typeof updateUIElements === 'function') {
    updateUIElements();
  }
  updateVideoContainers();
});

function updateVideoContainers() {
  try {
    const baseContainer = $("#videoBaseContainer");
    if (baseContainer.length) {
      if (isBaseYoutubeVideo && baseYoutubePlayer && typeof baseYoutubePlayer.setSize === 'function') {
        const width = baseContainer.width();
        const height = baseContainer.height() - 40;
        baseYoutubePlayer.setSize(width, height);
      }
    }
    const reactContainer = $("#videoReactContainer");
    if (reactContainer.length) {
      if (isReactYoutubeVideo && reactYoutubePlayer && typeof reactYoutubePlayer.setSize === 'function') {
        const width = reactContainer.width();
        const height = reactContainer.height() - 40;
        reactYoutubePlayer.setSize(width, height);
      }
    }
  } catch (e) {
    console.error('Error updating video containers:', e);
  }
}
