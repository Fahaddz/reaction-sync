# reaction-sync v2

TypeScript + SvelteKit + Rust/WASM version of reaction-sync

## Features

- Video synchronization with adjustable delay
- Support for local files, YouTube, direct links, Real-Debrid
- Subtitle support (SRT format)
- Resizable and draggable reaction video window
- YouTube quality selection
- Volume controls
- Codec compatibility checking
- Hold-to-adjust delay buttons
- Keyboard shortcuts
- Resume/continue system with 7-day retention
- Manual save and auto-save
- Debug mode

## Prerequisites

### 1. Install Bun (Recommended)

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### 3. Install wasm-pack

```bash
cargo install wasm-pack
```

Alternative installation method:
```bash
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
```

### 4. Verify Installation

```bash
bun --version
rustc --version
cargo --version
wasm-pack --version
```

## Installation

### Using Bun (Recommended)

```bash
# Install dependencies
bun install

# Build WASM module (required first time, or after Rust changes)
bun run build:wasm

# Start development server
bun run dev
```

### Using npm

```bash
# Install dependencies
npm install

# Build WASM module
npm run build:wasm

# Start development server
npm run dev
```

**Note**: You must build WASM (`build:wasm`) before running the app the first time.

The app will be available at `http://localhost:5173`

## Building WASM

The WASM module needs to be built before running the app:

```bash
bun run build:wasm
```

This compiles the Rust sync engine to WebAssembly and outputs to `src/lib/sync-engine-wasm/pkg/`

After building WASM, you can run `bun run dev` without rebuilding (unless you change Rust code).

## Development

```bash
# Run dev server (default: http://localhost:5173)
bun run dev

# The dev server will automatically reload on file changes
```

## Building for Production

```bash
# Build WASM + SvelteKit app
bun run build

# Preview production build
bun run preview
```

Output: `build/` directory (static files)

## Deployment

### GitHub Pages

This project is configured for automatic deployment to GitHub Pages at `https://<username>.github.io/reaction-sync/`.

#### Setup Instructions

1. **Push to GitHub**: Create a repository named `reaction-sync` and push your code:
   ```bash
   git remote add origin https://github.com/<username>/reaction-sync.git
   git branch -M main
   git push -u origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository Settings → Pages
   - Under "Source", select "GitHub Actions"
   - The workflow will automatically build and deploy on every push to `main`

3. **Access your site**: Once deployed, your app will be available at:
   ```
   https://<username>.github.io/reaction-sync/
   ```

#### Automatic Deployment

The GitHub Actions workflow (`.github/workflows/deploy.yml`) will:
- Build the WASM module using Rust and wasm-pack
- Build the SvelteKit app
- Deploy to GitHub Pages automatically

No manual steps required after the initial setup!

### Other Platforms

You can also deploy the `build/` directory to:
- Vercel
- Netlify
- Render

## Troubleshooting

### wasm-pack not found

If `wasm-pack` is not found after installation:
- Make sure `~/.cargo/bin` is in your PATH
- Add to `~/.bashrc` or `~/.zshrc`: `export PATH="$HOME/.cargo/bin:$PATH"`
- Restart your terminal or run: `source ~/.bashrc`

### Notes

- Bun uses its own package manager, so `bun install` is faster than npm
- The WASM build step requires Rust and wasm-pack
- The build output goes to `build/` directory (static files ready for deployment)
