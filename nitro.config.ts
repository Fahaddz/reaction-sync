import { defineNitroConfig } from 'nitro/config'

export default defineNitroConfig({
  preset: (process.env.NITRO_PRESET as string | undefined) || 'bun',
  compatibilityDate: '2026-04-05'
})
