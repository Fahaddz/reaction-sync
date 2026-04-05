import { Download, Save, Subtitles, Unlink2, WandSparkles } from 'lucide-react'
import { useEffect } from 'react'
import { startReactionSyncApp } from '../bootstrap.ts'
import { clearSessions, loadLastSession } from '../storage.ts'
import { selectSubtitleFile } from '../ui/video-loading.ts'
import { QualityMenu } from './quality-menu.tsx'
import { SourceActionMenu } from './source-action-menu.tsx'

export function ReactionSyncApp() {
  useEffect(() => {
    startReactionSyncApp()
  }, [])

  const handleLoadLast = () => {
    void loadLastSession()
    const tips = document.getElementById('tipsScreen')
    if (tips) {
      tips.style.display = 'none'
    }
  }

  const handleClearSaved = () => {
    if (window.confirm('Clear saved video progress?')) {
      void clearSessions().then(() => {
        window.alert('Saved progress cleared.')
      })
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-64 bg-[radial-gradient(circle_at_top,rgba(255,161,59,0.32),transparent_68%)]" />

      <div id="videoReactContainer" className="react-shell">
        <div className="react-video-wrapper">
          <video id="videoReact" className="media-layer" />
          <div id="videoReactYoutube" className="media-layer" />
        </div>

        <div className="reactTopBar">
          <button id="reactDragHandle" type="button" className="drag-handle" aria-label="Drag reaction window">
            :::
          </button>
          <button id="reactPlayPause" type="button" className="compact-button" aria-label="Play or pause reaction video">
            ▶
          </button>
          <input type="range" id="reactSeekBar" min="0" max="100" defaultValue="0" step="any" aria-label="Reaction seek" />
          <div id="reactTimeDisplay" className="time-pill">
            0:00 / 0:00
          </div>
          <input
            type="range"
            id="reactVolumeSlider"
            min="0"
            max="1"
            defaultValue="1"
            step="any"
            aria-label="Reaction volume"
          />
        </div>

        <div id="reactResizeHandle" aria-hidden="true" />
      </div>

      <div id="videoBaseContainer" className="base-shell">
        <video id="videoBaseLocal" className="media-layer" />
        <div id="videoBaseYoutube" className="media-layer" />
      </div>

      <section className="control-dock">
        <div className="control-row">
          <div className="group-row">
            <SourceActionMenu which="base" buttonId="baseVideoSourceBtn" />
            <button id="basePlayPause" type="button" className="compact-button" aria-label="Play or pause base video">
              ▶
            </button>
          </div>

          <div className="group-row seek-row">
            <input type="range" id="baseSeekBar" min="0" max="100" defaultValue="0" step="any" aria-label="Base seek" />
            <div id="baseTimeDisplay" className="time-pill">
              0:00 / 0:00
            </div>
          </div>

          <div className="group-row">
            <button id="decreaseDelayBtn" type="button" className="compact-button mini" aria-label="Decrease delay">
              −
            </button>
            <span id="delayDisplay" className="metric-pill">
              +0.0s
            </span>
            <span id="syncHealthDot" />
            <button id="increaseDelayBtn" type="button" className="compact-button mini" aria-label="Increase delay">
              +
            </button>
          </div>

          <div className="group-row">
            <SourceActionMenu which="react" buttonId="reactVideoSourceBtn" />
            <button
              id="addSubBtn"
              type="button"
              className="icon-button"
              aria-label="Attach subtitles"
              onClick={selectSubtitleFile}
            >
              <Subtitles className="h-4 w-4" />
            </button>
            <QualityMenu />
            <input
              type="range"
              id="baseVolumeSlider"
              min="0"
              max="1"
              defaultValue="1"
              step="any"
              aria-label="Base volume"
            />
            <input
              type="range"
              id="playbackSpeedSlider"
              min="0.25"
              max="2"
              defaultValue="1"
              step="0.05"
              aria-label="Playback speed"
            />
            <span id="playbackSpeedDisplay" className="time-pill">
              1.00x
            </span>
          </div>

          <div className="group-row">
            <button id="syncButton" type="button" className="icon-button" aria-label="Sync videos">
              <WandSparkles className="h-4 w-4" />
            </button>
            <button id="desyncButton" type="button" className="icon-button" aria-label="Disable sync">
              <Unlink2 className="h-4 w-4" />
            </button>
            <button id="forceResyncButton" type="button" className="icon-button" aria-label="Force resync">
              <Download className="h-4 w-4" />
            </button>
            <button id="saveNowButton" type="button" className="icon-button" aria-label="Save progress">
              <Save className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <aside id="tipsScreen" className="tips-card">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <p className="eyebrow">TanStack Start rebuild</p>
            <h1 className="mt-2 text-2xl font-black tracking-[0.03em] text-[var(--text-primary)] sm:text-3xl">
              Reaction Sync Control Room
            </h1>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="secondary-action" onClick={handleLoadLast}>
              Load Last
            </button>
            <button type="button" className="secondary-action" onClick={handleClearSaved}>
              Clear Saved
            </button>
            <button
              id="tipsClose"
              type="button"
              className="primary-action"
              onClick={() => {
                const tips = document.getElementById('tipsScreen')
                if (tips) {
                  tips.style.display = 'none'
                }
              }}
            >
              Close
            </button>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-6 sm:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm leading-7 text-[var(--text-secondary)]">
              Load a base video and a reaction video from local files, direct URLs, HLS playlists, or YouTube. Once both are loaded,
              sync them, trim the delay, and keep them locked while you scrub.
            </p>

            <ul className="mt-5 grid gap-3 text-sm text-[var(--text-secondary)]">
              <li className="tip-item">Use <b>S</b> to sync, <b>D</b> to desync, and <b>F</b> to force a hard re-alignment.</li>
              <li className="tip-item">Tap <b>[</b> or <b>]</b> to trim playback speed. Press <b>\</b> to reset to 1.00x.</li>
              <li className="tip-item">Use <b>,</b> and <b>.</b> for frame-scale delay adjustments when sync is close.</li>
              <li className="tip-item">Hold <b>Shift</b> with arrows to target base video seek and volume controls directly.</li>
            </ul>
          </div>

          <div className="grid gap-3">
            <div className="info-panel">
              <span className="panel-kicker">Sources</span>
              <p>Base and reaction inputs now use Radix menus with direct URL entry, including HLS manifests via `hls.js`.</p>
            </div>
            <div className="info-panel">
              <span className="panel-kicker">Controls</span>
              <p>The playback engine is unchanged underneath, so saved sessions, keyboard shortcuts, and YouTube sync behavior still carry over.</p>
            </div>
            <div className="info-panel">
              <span className="panel-kicker">Runtime</span>
              <p>Bun drives install, dev, test, and build. TanStack Start and Vite 7 handle routing and app delivery.</p>
            </div>
          </div>
        </div>
      </aside>

      <div id="toastContainer" />
      <div id="resumePrompt" />
    </main>
  )
}
