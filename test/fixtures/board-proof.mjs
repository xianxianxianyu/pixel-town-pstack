// Real-browser board proofs: Chrome uses a disposable directory and an ephemeral loopback server,
// never DSH or a user's profile. Only the host boundary is a fixture.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { constants } from 'node:fs'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

export async function chromeExecutable() {
  const candidates = process.env.CHROME_BIN ? [process.env.CHROME_BIN] : [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ...(process.env.PATH ?? '').split(delimiter).filter(Boolean).flatMap(directory =>
      ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].map(name => join(directory, name))),
  ]
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return candidate } catch {}
  }
  throw new Error('Chrome/Chromium is required for the real board proof; set CHROME_BIN to its executable.')
}

/**
 * Serve the shipped board under /<mode>/town/ with each fixture payload at /<mode>/board, run
 * `exercise` in a parent page that holds `<iframe id="board">`, and resolve with the JSON it POSTs
 * to /result plus every request the server saw.
 */
export async function boardProof({ fixtures, exercise, title }) {
  const chrome = await chromeExecutable()
  const assets = new Map(await Promise.all(['index.html', 'town.js', 'town.css', 'art.js', 'live-data.js', 'navigation.js'].map(async file =>
    [file, await readFile(new URL(`../../board/${file}`, import.meta.url))])))
  const result = Promise.withResolvers()
  const requests = []
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname
      requests.push(`${request.method} ${path}`)
      response.setHeader('Cache-Control', 'no-store')
      if (path === '/result' && request.method === 'POST') {
        let body = ''
        for await (const chunk of request) body += chunk
        result.resolve(JSON.parse(body))
        response.end('ok')
      } else if (path === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(`<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{margin:0}iframe{width:1200px;height:900px;border:0}</style><iframe id="board"></iframe><script type="module">(${exercise.toString()})()</script>`)
      } else {
        const [, mode, kind, file] = path.split('/')
        if (fixtures.has(mode) && kind === 'board') {
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify(fixtures.get(mode)))
        } else if (fixtures.has(mode) && kind === 'town' && assets.has(file)) {
          response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8')
          response.end(assets.get(file))
        } else { response.writeHead(404); response.end() }
      }
    } catch (error) { response.writeHead(500); response.end(String(error)); result.reject(error) }
  })
  const profile = await mkdtemp(join(tmpdir(), 'board-proof-chrome-'))
  let child, closed, deadline, stderr = ''
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const url = `http://127.0.0.1:${server.address().port}/`
    child = spawn(chrome, [
      '--headless', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
      '--disable-component-update', '--disable-default-apps', '--disable-extensions', '--disable-sync',
      '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--force-prefers-reduced-motion', '--window-size=1280,1000', `--user-data-dir=${profile}`, url,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', text => { stderr = (stderr + text).slice(-16000) })
    closed = new Promise(resolve => child.once('close', (code, signal) => {
      result.reject(new Error(`Chrome exited before proof completion (${code ?? signal})\n${stderr}`))
      resolve()
    }))
    child.once('error', error => result.reject(error))
    deadline = setTimeout(() => result.reject(new Error(`Board proof timed out\n${stderr}`)), 30000)
    return { evidence: await result.promise, requests }
  } finally {
    clearTimeout(deadline)
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    if (closed) {
      const force = setTimeout(() => child.kill('SIGKILL'), 3000)
      await closed
      clearTimeout(force)
    }
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await rm(profile, { recursive: true, force: true })
  }
}
