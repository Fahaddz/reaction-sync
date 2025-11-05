export function getYoutubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

export function normalizeUrl(url: string): string {
  try {
    const x = new URL(url, window.location.href);
    return x.href;
  } catch {
    return url;
  }
}

export function waitForYouTubeAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
    } else {
      window.addEventListener('youtube-api-ready', () => resolve(), { once: true });
    }
  });
}

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

