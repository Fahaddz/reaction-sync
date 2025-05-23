// FFmpeg functionality disabled - see Option 2 approach
// Uncomment the section below if you want to use Option 1 (FFmpeg integration)

let ffmpeg;
let fetchFile;
let toBlobURL;

async function initFFmpeg() {
  if (ffmpeg) return { ffmpeg, fetchFile, toBlobURL };
  
  const cdnOptions = [
    {
      name: 'UNPKG',
      packageUrl: 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js',
      utilUrl: 'https://unpkg.com/@ffmpeg/util@0.12.15/dist/esm/index.js',
      coreUrl: 'https://unpkg.com/@ffmpeg/core@0.12.15/dist/esm/ffmpeg-core.js',
      wasmUrl: 'https://unpkg.com/@ffmpeg/core@0.12.15/dist/esm/ffmpeg-core.wasm'
    },
    {
      name: 'JSDelivr',
      packageUrl: 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js',
      utilUrl: 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.15/dist/esm/index.js',
      coreUrl: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.15/dist/esm/ffmpeg-core.js',
      wasmUrl: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.15/dist/esm/ffmpeg-core.wasm'
    }
  ];
  
  for (const cdn of cdnOptions) {
    try {
      console.log(`Attempting to load FFmpeg from ${cdn.name}...`);
      
      const [ffmpegModule, utilModule] = await Promise.all([
        import(cdn.packageUrl),
        import(cdn.utilUrl)
      ]);
      
      const { FFmpeg } = ffmpegModule;
      fetchFile = utilModule.fetchFile;
      toBlobURL = utilModule.toBlobURL;
      
      ffmpeg = new FFmpeg();
      
      console.log(`Successfully loaded FFmpeg from ${cdn.name}`);
      return { ffmpeg, fetchFile, toBlobURL };
    } catch (error) {
      console.warn(`Failed to load FFmpeg from ${cdn.name}:`, error.message);
      continue;
    }
  }
  
  console.error('All CDNs failed to load FFmpeg');
  throw new Error('FFmpeg could not be loaded from any CDN. This feature requires FFmpeg.wasm to transcode unsupported video formats. Please check your internet connection and try refreshing the page.');
}

async function transcodeToMp4(file) {
  try {
    const { ffmpeg: ffmpegInstance, fetchFile: fetchFileInstance, toBlobURL: toBlobURLInstance } = await initFFmpeg();
    
    const loaded = ffmpegInstance.loaded;
    if (!loaded) {
      console.log('Loading FFmpeg core...');
      
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.15/dist/esm';
      await ffmpegInstance.load({
        coreURL: await toBlobURLInstance(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURLInstance(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      console.log('FFmpeg loaded successfully');
    }
    
    console.log('Starting transcoding process...');
    await ffmpegInstance.writeFile(file.name, await fetchFileInstance(file));
    
    await ffmpegInstance.exec([
      '-i', file.name,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      'output.mp4'
    ]);
    
    const data = await ffmpegInstance.readFile('output.mp4');
    console.log('Transcoding completed successfully');
    
    await ffmpegInstance.deleteFile(file.name);
    await ffmpegInstance.deleteFile('output.mp4');
    
    return new Blob([data], { type: 'video/mp4' });
  } catch (error) {
    console.error('FFmpeg transcoding failed:', error);
    throw new Error(`Video transcoding failed: ${error.message}. The video format may not be supported or FFmpeg failed to load.`);
  }
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

export {
  secondsToTime,
  srt2webvtt,
  getYoutubeId,
  checkCodecSupport,
  transcodeToMp4,
  initFFmpeg
};
