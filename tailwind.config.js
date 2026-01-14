/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,ts}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0a0a0f',
        'bg-secondary': '#12121a',
        'bg-tertiary': '#1a1a24',
        'text-primary': '#e4e4e7',
        'text-secondary': '#a1a1aa',
        accent: '#6366f1',
        'accent-hover': '#818cf8',
        success: '#22c55e',
        warning: '#eab308',
        error: '#ef4444',
        border: '#27272a',
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
