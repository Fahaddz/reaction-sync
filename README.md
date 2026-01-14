# Reaction Sync v3

A lightweight web app for synchronizing reaction videos with their source content. Watch a reactor's video alongside the original — perfectly synced.

Built with Svelte 5 + Tailwind CSS.

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
- **Adaptive thresholds** — Automatically adjusts sync tolerance based on source types
- **Buffering handling** — Pauses both videos when one buffers

### Controls
- **Delay adjustment** — Fine-tune timing offset (hold buttons for faster adjustment)
- **Independent volume** — Separate volume for each video
- **Quality selection** — Choose YouTube playback quality
- **Subtitle support** — Load .srt files for the base video
- **Playback speed** — 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x while maintaining sync

### UI
- **Draggable reaction window** — Position anywhere on screen
- **Resizable** — Maintains 16:9 aspect ratio
- **Hover controls** — Clean interface, controls appear on hover
- **Sync health indicator** — Green/yellow/red dot shows sync status
- **Debug panel** — Real-time sync stats (drift, rate, threshold mode)

### Progress Persistence
- **Auto-save** — Progress saved every 10 seconds
- **Resume prompt** — Pick up where you left off
- **Load Last** — Restore previous session instantly
- **Cross-session** — Works after closing browser

## Quick Start

```bash
bun install
bun run dev
```

Open `http://localhost:3000` in your browser.

## Development

```bash
bun install        # Install dependencies
bun run dev        # Start dev server with HMR
bun run test       # Run tests
bun run build      # Production build
bun run preview    # Preview production build
```

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
| `F` | Force resync |
| `←` / `→` | Seek ±5 seconds |
| `↑` / `↓` | Volume ±10% |
| `Shift + ←/→` | Seek base video |
| `Page Up/Down` | Adjust delay ±0.1s |
| `,` / `.` | Micro-adjust delay ±0.033s |
| `?` | Toggle debug panel |

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

- **Svelte 5** — Reactive UI components with runes
- **Tailwind CSS** — Utility-first styling
- **TypeScript** — Full type safety
- **Vite** — Fast dev server and bundling
- **Vitest** — Testing with fast-check for property-based tests
- **YouTube IFrame API** — Loaded dynamically when needed
- **localStorage** — Progress persistence

## Project Structure

```
src/
├── main.ts              # Entry point, mounts Svelte app
├── App.svelte           # Root component
├── stores.ts            # Svelte stores for state management
├── sync.ts              # Sync engine algorithm
├── player.ts            # Player interface + LocalPlayer
├── youtube.ts           # YouTube player implementation
├── storage.ts           # Progress persistence
├── keyboard.ts          # Keyboard shortcuts
├── utils.ts             # Helper functions
├── components/
│   ├── BaseVideo.svelte     # Main video player
│   ├── ReactOverlay.svelte  # Draggable reaction overlay
│   ├── Controls.svelte      # Playback controls bar
│   ├── DebugPanel.svelte    # Sync stats display
│   ├── Toast.svelte         # Notifications
│   ├── TipsScreen.svelte    # Help modal
│   ├── ResumePrompt.svelte  # Session restore prompt
│   ├── QualityMenu.svelte   # YouTube quality selector
│   └── SourceMenu.svelte    # Video source selector
└── actions/
    ├── draggable.ts     # Svelte action for drag behavior
    └── resizable.ts     # Svelte action for resize behavior
```

## Build & Deploy

```bash
bun run build      # Production build to dist/
bun run preview    # Preview production build locally
```

Deploys automatically to GitHub Pages via GitHub Actions on push to main.

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

Mobile browsers supported with touch controls.

## Tips

- **YouTube not loading?** Make sure you're serving via HTTP, not `file://`
- **Sync drifting?** Try clicking **FR** (Force Resync)
- **Videos out of sync on load?** Pause both, position manually, then press **S**
- **Local file won't play?** Convert to H.264/MP4 using HandBrake
- **Check sync stats** — Press `?` to toggle the debug panel

## License

MIT
