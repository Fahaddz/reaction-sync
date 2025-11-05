export async function checkCodecSupport(file: File): Promise<{ supported: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const mediaSource = window.MediaSource || (window as any).WebKitMediaSource;
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
  });
}

export function showCodecError(reason: string): boolean {
  const userChoice = confirm(
    `⚠️ Video Format Not Supported\n\n` +
    `Problem: ${reason}\n\n` +
    `Solutions:\n` +
    `1. Convert your video to MP4/H.264 format using:\n` +
    `   • HandBrake (free, recommended)\n` +
    `   • VLC Media Player (free)\n` +
    `   • FFmpeg (command line)\n` +
    `   • Online converters\n\n` +
    `2. Try using Microsoft Edge browser (better codec support)\n\n` +
    `3. Use a different video file\n\n` +
    `Click OK to open HandBrake download page, or Cancel to choose a different video.`
  );
  if (userChoice) {
    window.open('https://handbrake.fr/downloads.php', '_blank');
  }
  return userChoice;
}

