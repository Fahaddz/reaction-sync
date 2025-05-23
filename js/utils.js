let ffmpeg;
let fetchFile;

async function initFFmpeg() {
  if (ffmpeg) return { ffmpeg, fetchFile };
  
  const cdnOptions = [
    {
      name: 'UNPKG',
      moduleUrl: 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js',
      coreUrl: 'https://unpkg.com/@ffmpeg/core@0.12.15/dist/esm/ffmpeg-core.js'
    },
    {
      name: 'JSDelivr',
      moduleUrl: 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js',
      coreUrl: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.15/dist/esm/ffmpeg-core.js'
    },
    {
      name: 'CDNjs',
      moduleUrl: 'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/esm/index.min.js',
      coreUrl: 'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/esm/ffmpeg-core.js'
    }
  ];
  
  for (const cdn of cdnOptions) {
    try {
      console.log(`Attempting to load FFmpeg from ${cdn.name}...`);
      const { createFFmpeg, fetchFile: fetchFileImport } = await import(cdn.moduleUrl);
      fetchFile = fetchFileImport;
      ffmpeg = createFFmpeg({ 
        log: false,
        corePath: cdn.coreUrl
      });
      console.log(`Successfully loaded FFmpeg from ${cdn.name}`);
      return { ffmpeg, fetchFile };
    } catch (error) {
      console.warn(`Failed to load FFmpeg from ${cdn.name}:`, error.message);
      continue;
    }
  }
  
  console.error('All CDNs failed to load FFmpeg');
  throw new Error('FFmpeg could not be loaded from any CDN. This feature requires FFmpeg.wasm to transcode unsupported video formats. Please check your internet connection and try refreshing the page.');
}

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
  try {
    const { ffmpeg: ffmpegInstance, fetchFile: fetchFileInstance } = await initFFmpeg();
    
    if (!ffmpegInstance.isLoaded()) {
      console.log('Loading FFmpeg core...');
      await ffmpegInstance.load();
      console.log('FFmpeg loaded successfully');
    }
    
    console.log('Starting transcoding process...');
    ffmpegInstance.FS('writeFile', file.name, await fetchFileInstance(file));
    
    await ffmpegInstance.run(
      '-i', file.name,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      'output.mp4'
    );
    
    const data = ffmpegInstance.FS('readFile', 'output.mp4');
    console.log('Transcoding completed successfully');
    
    ffmpegInstance.FS('unlink', file.name);
    ffmpegInstance.FS('unlink', 'output.mp4');
    
    return new Blob([data.buffer], { type: 'video/mp4' });
  } catch (error) {
    console.error('FFmpeg transcoding failed:', error);
    throw new Error(`Video transcoding failed: ${error.message}. The video format may not be supported or FFmpeg failed to load.`);
  }
}

export {
  secondsToTime,
  srt2webvtt,
  getYoutubeId,
  checkCodecSupport,
  transcodeToMp4,
  initFFmpeg
};
