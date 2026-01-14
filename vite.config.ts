import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022'
  },
  server: {
    port: 3000,
    host: true
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true
  }
})
