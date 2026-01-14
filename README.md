# Reaction Sync v3

A lightweight web app for synchronizing reaction videos with their source content. Watch a reactor's video alongside the original — perfectly synced.

Built with Svelte 5 + Tailwind CSS.

## Features

### Video Sources
- **Local Files** — Load videos directly from your computer
- **YouTube** — Paste any YouTube URL
- **Direct URLs** — Works with mp4, webm, or streaming links

### Sync Engine
- **One-click sync** — Press `S` to sync at current positions
- **Adaptive drift correction** — Automatically keeps videos in sync
- **Playback rate micro-adjustment** — Smooth correction for small drifts
- **Force resync** — Snap videos back to sync instantly
- **Adaptive thresholds** — Adjusts sync tolerance based on source types
- **Buffering handling** — Pauses both videos when one buffers

### Controls
- **Delay adjustment** — Fine-tune timing offset
- **Independent volume** — Separate volume for each video
- **Quality selection** — Choose YouTube playback quality
- **Subtitle support** — Load .srt/.vtt files
- **Playback speed** — 0.5x to 2x while maintaining sync

### UI
- **Draggable reaction window** — Position anywhere on screen
- **Resizable** — Maintains 16:9 aspect ratio
- **Hover controls** — Clean interface, controls appear on hover
- **Sync health indicator** — Green/yellow/red dot shows sync status
- **Debug panel** — Real-time sync stats

### Progress Persistence
- **Auto-save** — Progress saved every 10 seconds
- **Resume prompt** — Pick up where you left off
- **Cross-session** — Works after closing browser

## Quick Start

```bash
bun install
bun run dev
```

Open `http://localhost:3000`

## Development

```bash
bun install        # Install dependencies
bun run dev        # Start dev server
bun run test       # Run tests
bun run build      # Production build
bun run preview    # Preview build
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/pause |
| `S` | Enable sync |
| `D` | Disable sync |
| `F` | Force resync |
| `←` / `→` | Seek ±5s |
| `↑` / `↓` | Volume ±10% |
| `Page Up/Down` | Delay ±0.1s |
| `,` / `.` | Delay ±0.033s |
| `G` | Toggle debug panel |

## Project Structure

```
src/
├── main.ts              # Entry point
├── App.svelte           # Root component
├── app.css              # Global styles + Tailwind
├── lib/                 # Core logic
│   ├── stores.ts        # Svelte stores
│   ├── sync.ts          # Sync engine
│   ├── player.ts        # Player interface
│   ├── youtube.ts       # YouTube player
│   ├── storage.ts       # Persistence
│   ├── keyboard.ts      # Shortcuts
│   ├── video-loading.ts # Video loading
│   └── utils.ts         # Helpers
├── components/          # UI components
│   ├── BaseVideo.svelte
│   ├── ReactOverlay.svelte
│   ├── Controls.svelte
│   ├── DebugPanel.svelte
│   ├── Toast.svelte
│   ├── TipsScreen.svelte
│   ├── ResumePrompt.svelte
│   ├── QualityMenu.svelte
│   └── SourceMenu.svelte
├── actions/             # Svelte actions
│   ├── draggable.ts
│   └── resizable.ts
└── tests/               # Property-based tests
```

## Tech Stack

- **Svelte 5** — Reactive UI with runes
- **Tailwind CSS** — Utility-first styling
- **TypeScript** — Type safety
- **Vite** — Dev server + bundling
- **Vitest + fast-check** — Property-based testing

## License

MIT
