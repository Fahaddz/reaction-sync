const downloadPattern = /\/items\/([^/]+)\/download/i;

function toBaseUrl(url: URL) {
  const idx = url.pathname.toLowerCase().indexOf('/items/');
  const prefix = idx > 0 ? url.pathname.slice(0, idx) : '';
  return url.origin + prefix;
}

export function isJellyfinDownload(url: string) {
  try {
    const parsed = new URL(url);
    return downloadPattern.test(parsed.pathname);
  } catch {
    return false;
  }
}

export async function jellyfinManifest(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const match = parsed.pathname.match(downloadPattern);
  const apiKey = parsed.searchParams.get('api_key');
  if (!match || !apiKey) return null;
  const itemId = match[1];
  const base = toBaseUrl(parsed);
  const playbackUrl = `${base}/Items/${itemId}/PlaybackInfo?api_key=${apiKey}`;
  let info: any = null;
  try {
    const res = await fetch(playbackUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (res.ok) info = await res.json();
  } catch {}
  const mediaSource = info?.MediaSources?.[0];
  const playSessionId = info?.PlaySessionId;
  const ensureParams = (target: URL) => {
    if (!target.searchParams.get('api_key')) target.searchParams.set('api_key', apiKey);
    if (mediaSource?.Id && !target.searchParams.get('MediaSourceId')) target.searchParams.set('MediaSourceId', mediaSource.Id);
    if (playSessionId && !target.searchParams.get('PlaySessionId')) target.searchParams.set('PlaySessionId', playSessionId);
    target.searchParams.set('AllowVideoStreamCopy', 'true');
    target.searchParams.set('AllowAudioStreamCopy', 'true');
    target.searchParams.delete('MaxStreamingBitrate');
    target.searchParams.delete('VideoBitrate');
    return target;
  };
  if (mediaSource?.TranscodingUrl) {
    const target = new URL(mediaSource.TranscodingUrl, base);
    target.searchParams.set('TranscodingProtocol', 'hls');
    return ensureParams(target).toString();
  }
  const manifest = new URL(`${base}/Videos/${itemId}/main.m3u8`);
  manifest.searchParams.set('TranscodingProtocol', 'hls');
  manifest.searchParams.set('SegmentContainer', 'ts');
  manifest.searchParams.set('Container', 'ts');
  return ensureParams(manifest).toString();
}

