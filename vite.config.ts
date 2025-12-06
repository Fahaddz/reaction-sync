import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  base: '/reaction-sync/',
  build: {
    outDir: 'dist',
    target: 'es2022'
  },
  server: {
    port: 3000,
    host: true
  }
})
