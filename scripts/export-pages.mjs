import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { spawn } from 'node:child_process'

const port = Number(process.env.EXPORT_PAGES_PORT || 4173)
const host = '127.0.0.1'
const origin = `http://${host}:${port}`
const outputDir = '.pages'

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })
await cp('.output/public', outputDir, { recursive: true, force: true })
await writeFile(`${outputDir}/.nojekyll`, '', 'utf8')

const child = spawn('bun', ['.output/server/index.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port)
  },
  stdio: 'ignore'
})

try {
  const html = await waitForHtml(`${origin}/`)
  await writeFile(`${outputDir}/index.html`, html, 'utf8')
  await writeFile(`${outputDir}/404.html`, html, 'utf8')
} finally {
  child.kill('SIGTERM')
  await onceExit(child)
}

async function waitForHtml(url) {
  let lastError

  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`)
      }
      return await response.text()
    } catch (error) {
      lastError = error
      await delay(500)
    }
  }

  throw lastError || new Error('Failed to fetch rendered HTML for Pages export')
}

function onceExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve()
      return
    }
    child.once('exit', () => resolve())
  })
}
