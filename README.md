# Reaction Sync v2

A lightweight web app for synchronizing reaction videos with their source content. Watch a reactor's video alongside the original — perfectly synced.

## Features

### Video Sources
- **Local Files** — Load videos directly from your computer
- **YouTube** — Paste any YouTube URL
- **Direct URLs** — Works with mp4, webm, or streaming links (Real-Debrid, etc.)

### Sync Engine
- **One-click sync** — Press `S` to sync at current positions
- **Adaptive drift correction** — Automatically keeps videos in sync
- **Playback rate micro-adjustment** — Smooth correction for small drifts
- **Force resync** — Snap videos back to sync instantly

### Controls
- **Delay adjustment** — Fine-tune timing offset (hold buttons for faster adjustment)
- **Independent volume** — Separate volume for each video
- **Quality selection** — Choose YouTube playback quality
- **Subtitle support** — Load .srt files for the base video

### UI
- **Draggable reaction window** — Position anywhere on screen
- **Resizable** — Maintains 16:9 aspect ratio
- **Hover controls** — Clean interface, controls appear on hover
- **Sync health indicator** — Green/yellow/red dot shows sync status
- **Single default design** — Brutalist Signal styling (no runtime theme switcher)

### Progress Persistence
- **Auto-save** — Progress saved every 10 seconds
- **Resume prompt** — Pick up where you left off
- **Load Last** — Restore previous session instantly
- **Cross-session** — Works after closing browser

### YouTube Reliability
- **Resilient API loader** — Retries API bootstrap with timeout and recovery
- **Stale callback protection** — Old iframe callbacks are ignored after re-init
- **Retry cleanup** — Pending retry timers are canceled on destroy/reload
- **Container reset** — Old iframe nodes are cleared before new player creation

## Quick Start

```bash
bun install
bun run dev
```

Open `http://localhost:3000` in your browser.

## Usage

### Loading Videos

1. Click **Base** → Choose **Local** or **Link**
2. Click **React** → Choose **Local** or **Link**
3. Position videos to your desired sync point
4. Press **S** to sync

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/pause focused video |
| `S` | Enable sync at current positions |
| `D` | Disable sync |
| `←` / `→` | Seek ±5 seconds |
| `↑` / `↓` | Volume ±10% |
| `Shift + ←/→` | Seek base video |
| `Page Up/Down` | Adjust delay ±0.1s |

### Delay Adjustment

The delay value shows the time offset between videos:
- **Positive (+)** — Reaction video is ahead of base
- **Negative (-)** — Reaction video is behind base

Hold the `−` or `+` buttons for accelerated adjustment.

### Filename Delay Tokens

Name your reaction files with a delay token for automatic delay setting:
```
reactor-video.dt35.mp4  →  Sets delay to 3.5 seconds
```

### Sync Health Indicator

The colored dot next to the delay shows sync status:
- 🟢 **Green** — Perfectly synced
- 🟡 **Yellow** — Correcting minor drift
- 🔴 **Red** — Significant drift detected

## Tech Stack

- **TypeScript** — Full type safety
- **Vite** — Fast dev server and bundling
- **Zero runtime dependencies** — Just vanilla JS in production
- **YouTube IFrame API** — Loaded dynamically when needed
- **IndexedDB** — Progress persistence with localStorage fallback
- **Pointer Events API** — Unified mouse/touch/pen input

## Project Structure

```
src/
├── main.ts               # Entry point
├── state.ts              # Reactive state management
├── sync.ts               # Sync engine algorithm
├── player.ts             # Player interface + LocalPlayer
├── youtube.ts            # YouTube player implementation
├── storage.ts            # Progress persistence
├── keyboard.ts           # Keyboard shortcuts
├── drag-resize.ts        # Pointer events drag/resize
├── utils.ts              # Helper functions
├── styles.css            # All styles
├── ui/
│   ├── index.ts          # UI bootstrap/exports
│   ├── controls.ts       # Playback + seek + volume controls
│   ├── menus.ts          # Source + quality menus
│   ├── toast.ts          # Toasts and prompts
│   └── video-loading.ts  # Local/URL/YouTube load flow
├── controls.test.ts
├── storage.test.ts
├── youtube.test.ts
└── ui/video-loading.test.ts
```

## Build

```bash
bun run build      # Production build
bun run preview    # Preview production build
```

## Testing

```bash
bun run test       # Run unit and property tests
```

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

Mobile browsers supported with touch controls.

## Tips

- **YouTube not loading?** Make sure you're serving via HTTP, not `file://`
- **YouTube still fails on a specific video?** The uploader may block embedding (`101`/`150`).
- **Sync drifting?** Try clicking **FR** (Force Resync)
- **Videos out of sync on load?** Pause both, position manually, then press **S**
- **Local file won't play?** Convert to H.264/MP4 using HandBrake

## License

MIT
