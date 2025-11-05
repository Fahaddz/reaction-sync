export async function loadSRT(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target?.result as string);
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function srt2webvtt(srt: string): string {
  let webvttArr = ["WEBVTT Kind: captions; Language: en"];
  let lines = srt.split("\n");
  let i = 0;
  while (i < lines.length) {
    if (lines[i] && lines[i].trim() && (!lines[i + 1] || lines[i + 1].indexOf("-->") == -1)) {
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

export function attachSubtitles(element: HTMLVideoElement, webvtt: string): void {
  const track = document.createElement('track');
  track.kind = 'captions';
  track.srclang = 'en';
  track.label = 'English';
  track.default = true;
  track.src = `data:text/vtt;base64,${btoa(unescape(encodeURIComponent(webvtt)))}`;
  element.appendChild(track);
}

