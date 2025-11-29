
function secondsToTime(seconds, prec = 1) {
  if (isNaN(seconds)) return "0:00";
  const rounded = Math.round(seconds * 10) / 10;
  const [whole, decimal] = rounded.toString().split('.');
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}${decimal ? `.${decimal}` : ''}`;
}

function srt2webvtt(srt) {
  let webvttArr = ["WEBVTT Kind: captions; Language: en"];
  let lines = srt.split("\n");
  let i = 0;
  while (i < lines.length) {
    if (
      lines[i] &&
      lines[i].trim() &&
      (!lines[i + 1] || lines[i + 1].indexOf("-->") == -1)
    ) {
      if (lines[i].indexOf("-->") != -1) {
        webvttArr.push("");
        lines[i] = lines[i].replaceAll(",", ".");
      }
      webvttArr.push(lines[i].trim());
    }
    i++;
  }
  return webvttArr.join("\n");
}

function getYoutubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

function checkCodecSupport(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    try {
      const mediaSource = window.MediaSource || window.WebKitMediaSource;
      if (!mediaSource) {
        resolve({ supported: false, reason: 'MediaSource API not supported' });
        return;
      }
      video.onloadedmetadata = () => {
        resolve({ supported: true });
      };
      video.onerror = () => {
        let reason = 'Unknown error';
        if (video.error) {
          switch (video.error.code) {
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
              reason = 'Video codec not supported (possibly HEVC/H.265). Try converting to H.264 or use Microsoft Edge browser.';
              break;
            case MediaError.MEDIA_ERR_DECODE:
              reason = 'Video decode error';
              break;
            case MediaError.MEDIA_ERR_NETWORK:
              reason = 'Network error';
              break;
            default:
              reason = `Error code: ${video.error.code}`;
          }
        }
        resolve({ supported: false, reason });
      };
      video.src = URL.createObjectURL(file);
    } catch (e) {
      resolve({ supported: false, reason: e.message });
    }
  });
}

function debounce(fn, ms = 30) {
  let t = null;
  return function(...args) {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn.apply(this, args); }, ms);
  };
}

export {
  secondsToTime,
  srt2webvtt,
  getYoutubeId,
  checkCodecSupport,
  debounce
};
