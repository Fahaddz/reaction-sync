import { createFFmpeg, fetchFile } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.6/dist/ffmpeg.min.js';
const ffmpeg = createFFmpeg({ log: true });

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
              reason = 'Video codec not supported (possibly HEVC/H.265). Try converting to H.246 or use Microsoft Edge browser.'; // Corrected H.264 in the message
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

/**
 * Transcodes a video file to MP4/H.264 using ffmpeg.wasm.
 */
async function transcodeToMp4(file) {
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }
  ffmpeg.FS('writeFile', file.name, await fetchFile(file));
  await ffmpeg.run('-i', file.name, '-c:v', 'libx264', '-c:a', 'aac', 'output.mp4');
  const data = ffmpeg.FS('readFile', 'output.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}

export {
  secondsToTime,
  srt2webvtt,
  getYoutubeId,
  checkCodecSupport,
  transcodeToMp4
};
