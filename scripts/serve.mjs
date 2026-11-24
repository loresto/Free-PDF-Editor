#!/usr/bin/env node
// Tiny dependency-free static server for the built app (dist/client).
// Used by "start" / install scripts so the editor can be opened offline.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const root = resolve(process.argv[2] ?? 'dist/client')
const port = Number(process.env.PORT ?? 4173)
const host = process.env.HOST ?? '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.map': 'application/json; charset=utf-8',
}

async function fileAt(path) {
  try {
    const info = await stat(path)
    if (info.isFile()) return path
  } catch {
    return null
  }
  return null
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`)
    const decoded = decodeURIComponent(url.pathname)
    const safe = decoded
      .split(/[\\/]+/)
      .filter((part) => part && part !== '..' && part !== '.')
      .join('/')
    let file = await fileAt(join(root, safe))
    if (!file) file = await fileAt(join(root, safe, 'index.html'))
    if (!file) file = await fileAt(join(root, 'index.html'))
    if (!file) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('404')
      return
    }
    const data = await readFile(file)
    response.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=600',
    })
    response.end(data)
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end(String(error))
  }
})

server.listen(port, host, () => {
  const url = `http://${host}:${port}`
  console.log(`PDF редактор: ${url}`)
  console.log('Закройте это окно, чтобы остановить сервер.')
  if (process.argv.includes('--open')) {
    const command =
      process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref()
  }
})
