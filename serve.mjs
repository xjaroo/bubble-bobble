#!/usr/bin/env node
/**
 * Static dev server with no-cache headers so JS module changes take effect immediately.
 */
import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { pipeline } from 'node:stream/promises'
import { WebSocketServer } from 'ws'

const PORT = 3000
const DEFAULT_HOST = '0.0.0.0'
const WS_PATH = '/ws'
const ROOM_CODE_LEN = 4
const ROOM_CODE_ALPHABET = '0123456789'
const HIGHSCORE_DB_FILE = path.resolve(process.cwd(), 'data', 'highscores.json')
const HIGHSCORE_DB_DIR = path.dirname(HIGHSCORE_DB_FILE)
const MAX_HIGHSCORES = 100
const MAX_NAME_LEN = 16
const MAX_BODY_BYTES = 16 * 1024
let highscoreWriteChain = Promise.resolve()
const wsRooms = new Map()
const wsClientState = new WeakMap()

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...NO_CACHE,
  })
  res.end(body)
}

function wsSend(ws, payload) {
  if (!ws || ws.readyState !== 1) return false
  try {
    ws.send(JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

function normalizeLobbyName(name, fallback = 'PLAYER') {
  if (typeof name !== 'string') return fallback
  const cleaned = name.replace(/\s+/g, ' ').trim()
  if (!cleaned) return fallback
  return cleaned.slice(0, MAX_NAME_LEN)
}

function wsGenerateRoomCode() {
  for (let tries = 0; tries < 1200; tries++) {
    let out = ''
    for (let i = 0; i < ROOM_CODE_LEN; i++) {
      const idx = (Math.random() * ROOM_CODE_ALPHABET.length) | 0
      out += ROOM_CODE_ALPHABET[idx]
    }
    if (!wsRooms.has(out)) return out
  }
  return null
}

function wsSetClientState(ws, roomCode = '', role = 'none') {
  wsClientState.set(ws, { roomCode, role })
}

function wsGetClientState(ws) {
  return wsClientState.get(ws) || { roomCode: '', role: 'none' }
}

function wsDeleteRoomIfEmpty(roomCode) {
  if (!roomCode) return
  const room = wsRooms.get(roomCode)
  if (!room) return
  if (!room.host && !room.guest) wsRooms.delete(roomCode)
}

function wsLobbyPayload(room) {
  return {
    type: 'lobby-state',
    roomCode: room.code,
    matchActive: !!room.matchActive,
    players: {
      host: {
        connected: !!room.host,
        name: room.hostName || 'HOST',
        ready: !!room.hostReady,
      },
      guest: {
        connected: !!room.guest,
        name: room.guestName || 'GUEST',
        ready: !!room.guestReady,
      },
    },
  }
}

function wsBroadcastLobbyState(room) {
  if (!room) return
  const payload = wsLobbyPayload(room)
  if (room.host) wsSend(room.host, payload)
  if (room.guest) wsSend(room.guest, payload)
}

function wsResetRoomReady(room) {
  if (!room) return
  room.hostReady = false
  room.guestReady = false
  room.matchActive = false
}

function wsCollectWaitingRooms() {
  const out = []
  for (const room of wsRooms.values()) {
    if (!room || !room.host) continue
    if (room.guest) continue
    if (room.matchActive) continue
    out.push({
      roomCode: room.code,
      hostName: room.hostName || 'HOST',
      createdAt: room.createdAt || Date.now(),
    })
  }
  out.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    return String(a.roomCode).localeCompare(String(b.roomCode))
  })
  return out
}

function wsHandleListRooms(ws) {
  wsSend(ws, {
    type: 'room-list',
    rooms: wsCollectWaitingRooms(),
  })
}

function wsTryStartMatch(room) {
  if (!room || room.matchActive) return
  if (!room.host || !room.guest) return
  if (!room.hostReady || !room.guestReady) return
  room.matchActive = true
  const payload = {
    type: 'match-start',
    roomCode: room.code,
    players: {
      host: room.hostName || 'HOST',
      guest: room.guestName || 'GUEST',
    },
  }
  wsSend(room.host, payload)
  wsSend(room.guest, payload)
}

function wsLeaveRoom(ws, notify = true) {
  const state = wsGetClientState(ws)
  if (!state.roomCode || state.role === 'none') {
    wsSetClientState(ws)
    return
  }

  const room = wsRooms.get(state.roomCode)
  if (!room) {
    wsSetClientState(ws)
    return
  }

  if (state.role === 'host' && room.host === ws) {
    wsResetRoomReady(room)
    room.host = null
    if (notify && room.guest) {
      wsSend(room.guest, { type: 'peer-left', role: 'host' })
      wsSend(room.guest, { type: 'error', message: 'HOST_DISCONNECTED' })
      wsSend(room.guest, { type: 'left-room' })
      wsSetClientState(room.guest)
      room.guest = null
      room.guestName = ''
    }
  } else if (state.role === 'guest' && room.guest === ws) {
    room.guestReady = false
    room.matchActive = false
    room.guest = null
    room.guestName = ''
    if (notify && room.host) wsSend(room.host, { type: 'peer-left', role: 'guest' })
    wsBroadcastLobbyState(room)
  }

  wsSetClientState(ws)
  wsDeleteRoomIfEmpty(state.roomCode)
}

function wsHandleHostCreate(ws) {
  wsLeaveRoom(ws, true)
  const roomCode = wsGenerateRoomCode()
  if (!roomCode) {
    wsSend(ws, { type: 'error', message: 'ROOM_CREATE_FAILED' })
    return
  }
  const room = {
    code: roomCode,
    host: ws,
    guest: null,
    createdAt: Date.now(),
    hostName: 'HOST',
    guestName: '',
    hostReady: false,
    guestReady: false,
    matchActive: false,
  }
  wsRooms.set(roomCode, room)
  wsSetClientState(ws, roomCode, 'host')
  wsSend(ws, { type: 'room-created', roomCode })
  wsBroadcastLobbyState(room)
}

function wsHandleJoinRoom(ws, rawCode) {
  const roomCode = String(rawCode || '')
    .trim()
    .replace(/\D/g, '')
    .slice(0, ROOM_CODE_LEN)
  if (roomCode.length !== ROOM_CODE_LEN) {
    wsSend(ws, { type: 'error', message: 'ROOM_CODE_INVALID' })
    return
  }

  const room = wsRooms.get(roomCode)
  if (!room || !room.host) {
    wsSend(ws, { type: 'error', message: 'ROOM_NOT_FOUND' })
    return
  }
  if (room.guest) {
    wsSend(ws, { type: 'error', message: 'ROOM_FULL' })
    return
  }

  wsLeaveRoom(ws, true)
  room.guest = ws
  room.guestName = 'GUEST'
  wsResetRoomReady(room)
  wsSetClientState(ws, roomCode, 'guest')
  wsSend(ws, { type: 'room-joined', roomCode })
  wsSend(room.host, { type: 'peer-joined', role: 'guest' })
  wsBroadcastLobbyState(room)
}

function wsHandleSetName(ws, rawName) {
  const state = wsGetClientState(ws)
  if (state.role === 'none' || !state.roomCode) return
  const room = wsRooms.get(state.roomCode)
  if (!room) return

  if (state.role === 'host' && room.host === ws) {
    room.hostName = normalizeLobbyName(rawName, 'HOST')
  } else if (state.role === 'guest' && room.guest === ws) {
    room.guestName = normalizeLobbyName(rawName, 'GUEST')
  } else {
    return
  }
  wsBroadcastLobbyState(room)
}

function wsHandleSetReady(ws, rawReady) {
  const state = wsGetClientState(ws)
  if (state.role === 'none' || !state.roomCode) return
  const room = wsRooms.get(state.roomCode)
  if (!room) return
  const ready = !!rawReady

  if (state.role === 'host' && room.host === ws) {
    room.hostReady = ready
  } else if (state.role === 'guest' && room.guest === ws) {
    room.guestReady = ready
  } else {
    return
  }

  if (!ready) room.matchActive = false
  wsBroadcastLobbyState(room)
  wsTryStartMatch(room)
}

function wsHandleHostState(ws, statePayload) {
  const state = wsGetClientState(ws)
  if (state.role !== 'host' || !state.roomCode) return
  const room = wsRooms.get(state.roomCode)
  if (!room || room.host !== ws || !room.guest) return
  wsSend(room.guest, { type: 'host-state', state: statePayload || null })
}

function wsHandleGuestInput(ws, inputPayload) {
  const state = wsGetClientState(ws)
  if (state.role !== 'guest' || !state.roomCode) return
  const room = wsRooms.get(state.roomCode)
  if (!room || room.guest !== ws || !room.host) return
  wsSend(room.host, { type: 'guest-input', input: inputPayload || {} })
}

function attachWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const pathname = fileUrlPath(req.url || '/')
    if (pathname !== WS_PATH) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws) => {
    wsSetClientState(ws)
    wsSend(ws, { type: 'hello', path: WS_PATH })

    ws.on('message', (raw) => {
      let msg = null
      try {
        msg = JSON.parse(String(raw || '{}'))
      } catch {
        wsSend(ws, { type: 'error', message: 'INVALID_JSON' })
        return
      }
      if (!msg || typeof msg !== 'object') {
        wsSend(ws, { type: 'error', message: 'INVALID_PAYLOAD' })
        return
      }
      const type = String(msg.type || '')
      switch (type) {
        case 'host-create':
          wsHandleHostCreate(ws)
          break
        case 'join-room':
          wsHandleJoinRoom(ws, msg.roomCode)
          break
        case 'list-rooms':
          wsHandleListRooms(ws)
          break
        case 'set-name':
          wsHandleSetName(ws, msg.name)
          break
        case 'set-ready':
          wsHandleSetReady(ws, msg.ready)
          break
        case 'leave-room':
          wsLeaveRoom(ws, true)
          wsSend(ws, { type: 'left-room' })
          break
        case 'host-state':
          wsHandleHostState(ws, msg.state)
          break
        case 'guest-input':
          wsHandleGuestInput(ws, msg.input)
          break
        default:
          wsSend(ws, { type: 'error', message: 'UNKNOWN_TYPE' })
          break
      }
    })

    ws.on('close', () => {
      wsLeaveRoom(ws, true)
    })
  })

  return wss
}

function parseArgs() {
  const argv = process.argv.slice(2)
  let host = DEFAULT_HOST
  let port = PORT
  let maxPortTries = 20
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--host') host = argv[++i] ?? DEFAULT_HOST
    else if (a === '--port') port = Number.parseInt(argv[++i], 10) || PORT
    else if (a === '--max-port-tries')
      maxPortTries = Math.max(1, Number.parseInt(argv[++i], 10) || 20)
  }
  return { host, port, maxPortTries }
}

function fileUrlPath(reqUrl) {
  try {
    return new URL(reqUrl, 'http://x').pathname
  } catch {
    return '/'
  }
}

function normalizeHighscoreName(name) {
  if (typeof name !== 'string') return 'PLAYER'
  const cleaned = name.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'PLAYER'
  return cleaned.slice(0, MAX_NAME_LEN)
}

function normalizeHighscoreScore(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  const s = Math.floor(score)
  if (s < 0) return null
  return Math.min(99999999, s)
}

function sortHighscores(scores) {
  return [...scores].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const at = String(a.createdAt || '')
    const bt = String(b.createdAt || '')
    return at.localeCompare(bt)
  })
}

function normalizeHighscoreDb(raw) {
  const base = { version: 1, scores: [] }
  if (!raw || typeof raw !== 'object') return base
  const scores = Array.isArray(raw.scores) ? raw.scores : []
  base.scores = scores
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const score = normalizeHighscoreScore(entry.score)
      if (score === null) return null
      return {
        name: normalizeHighscoreName(entry.name),
        score,
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
      }
    })
    .filter(Boolean)
  base.scores = sortHighscores(base.scores).slice(0, MAX_HIGHSCORES)
  return base
}

async function ensureHighscoreDb() {
  await fsp.mkdir(HIGHSCORE_DB_DIR, { recursive: true })
  try {
    await fsp.access(HIGHSCORE_DB_FILE, fs.constants.R_OK | fs.constants.W_OK)
  } catch {
    const initial = { version: 1, scores: [] }
    await fsp.writeFile(HIGHSCORE_DB_FILE, JSON.stringify(initial, null, 2))
  }
}

async function readHighscoreDb() {
  await ensureHighscoreDb()
  try {
    const raw = await fsp.readFile(HIGHSCORE_DB_FILE, 'utf8')
    return normalizeHighscoreDb(JSON.parse(raw))
  } catch {
    return { version: 1, scores: [] }
  }
}

async function writeHighscoreDb(db) {
  await ensureHighscoreDb()
  await fsp.writeFile(HIGHSCORE_DB_FILE, JSON.stringify(db, null, 2))
}

function queueHighscoreUpdate(mutator) {
  highscoreWriteChain = highscoreWriteChain.then(async () => {
    const db = await readHighscoreDb()
    const next = await mutator(db)
    const normalized = normalizeHighscoreDb(next)
    await writeHighscoreDb(normalized)
    return normalized
  })
  return highscoreWriteChain
}

function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('BODY_TOO_LARGE'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}'
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('INVALID_JSON'))
      }
    })
    req.on('error', reject)
  })
}

async function handleHighscoreApi(req, res) {
  const method = req.method || 'GET'
  const urlObj = new URL(req.url ?? '/', 'http://localhost')

  if (method === 'GET') {
    const limitRaw = Number.parseInt(urlObj.searchParams.get('limit') || '20', 10)
    const limit = Math.min(50, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20))
    const db = await readHighscoreDb()
    const scores = sortHighscores(db.scores).slice(0, limit)
    sendJson(res, 200, {
      ok: true,
      top: scores[0] || null,
      scores,
    })
    return
  }

  if (method === 'POST') {
    try {
      const body = await readJsonBody(req)
      const score = normalizeHighscoreScore(body.score)
      if (score === null) {
        sendJson(res, 400, { ok: false, error: 'INVALID_SCORE' })
        return
      }
      const name = normalizeHighscoreName(body.name)
      const entry = {
        name,
        score,
        createdAt: new Date().toISOString(),
      }

      const db = await queueHighscoreUpdate((prev) => {
        const next = normalizeHighscoreDb(prev)
        next.scores.push(entry)
        next.scores = sortHighscores(next.scores).slice(0, MAX_HIGHSCORES)
        return next
      })
      const scores = sortHighscores(db.scores).slice(0, 20)
      const rank = sortHighscores(db.scores).findIndex(
        (s) => s.score === entry.score && s.name === entry.name && s.createdAt === entry.createdAt
      )

      sendJson(res, 201, {
        ok: true,
        entry,
        rank: rank >= 0 ? rank + 1 : null,
        top: scores[0] || null,
        scores,
      })
      return
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'UNKNOWN'
      const status = msg === 'BODY_TOO_LARGE' ? 413 : 400
      sendJson(res, status, { ok: false, error: msg })
      return
    }
  }

  res.writeHead(405, { Allow: 'GET, POST', ...NO_CACHE })
  res.end('Method Not Allowed')
}

function resolvePath(root, urlPath) {
  const segments = urlPath.split('/').filter((s) => s && s !== '.')
  if (segments.some((s) => s === '..')) return null
  const full = path.resolve(root, ...segments)
  const rootResolved = path.resolve(root)
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) return null
  return full
}

function mimeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function htmlEscape(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function sendDirectory(res, dirPath, urlPath) {
  const index = path.join(dirPath, 'index.html')
  try {
    await fsp.access(index, fs.constants.R_OK)
    await sendFile(res, index)
    return
  } catch {
    /* no index */
  }

  const names = await fsp.readdir(dirPath)
  const rows = [...names]
    .sort()
    .map((name) => {
      const href = path.posix.join(urlPath.replace(/\/$/, ''), name)
      const suffix = name.includes('.') ? '' : '/'
      return `<li><a href="${htmlEscape(href)}${suffix}">${htmlEscape(name)}</a></li>`
    })
    .join('\n')

  const body = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Index of ${htmlEscape(urlPath)}</title></head>
<body><h1>Index of ${htmlEscape(urlPath)}</h1><ul>\n${rows}\n</ul></body></html>`

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...NO_CACHE })
  res.end(body)
}

async function sendFile(res, filePath) {
  const st = await fsp.stat(filePath)
  res.writeHead(200, {
    'Content-Type': mimeFor(filePath),
    'Content-Length': st.size,
    ...NO_CACHE,
  })
  await pipeline(fs.createReadStream(filePath), res)
}

function createServer(root) {
  return http.createServer(async (req, res) => {
    const pathname = fileUrlPath(req.url ?? '/')
    if (pathname === '/api/highscores') {
      await handleHighscoreApi(req, res)
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, NO_CACHE)
      res.end('Method Not Allowed')
      return
    }

    let target = resolvePath(root, pathname)
    if (!target) {
      res.writeHead(403, NO_CACHE)
      res.end('Forbidden')
      return
    }

    try {
      const st = await fsp.stat(target)
      if (st.isDirectory()) {
        const trail = pathname.endsWith('/') ? pathname : `${pathname}/`
        if (!pathname.endsWith('/')) {
          res.writeHead(301, { Location: trail, ...NO_CACHE })
          res.end()
          return
        }
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...NO_CACHE })
          res.end()
          return
        }
        await sendDirectory(res, target, pathname)
        return
      }

      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Type': mimeFor(target),
          'Content-Length': st.size,
          ...NO_CACHE,
        })
        res.end()
        return
      }

      await sendFile(res, target)
    } catch {
      res.writeHead(404, NO_CACHE)
      res.end('Not Found')
    }
  })
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function isWildcardHost(host) {
  const h = String(host || '').trim()
  return h === '' || h === '0.0.0.0' || h === '::'
}

function localIpv4Addrs() {
  const nets = os.networkInterfaces()
  const out = []
  for (const infos of Object.values(nets)) {
    if (!Array.isArray(infos)) continue
    for (const info of infos) {
      if (!info || info.internal) continue
      const fam = typeof info.family === 'string' ? info.family : String(info.family)
      if (fam !== 'IPv4') continue
      if (!info.address) continue
      out.push(info.address)
    }
  }
  return [...new Set(out)]
}

function printServerAddresses(host, port) {
  console.log(`Serving on http://${host}:${port}`)
  console.log(`WebSocket endpoint ws://${host}:${port}${WS_PATH}`)

  if (!isWildcardHost(host)) return

  const ips = localIpv4Addrs()
  console.log(`Local URL: http://127.0.0.1:${port}`)
  console.log(`Local WS : ws://127.0.0.1:${port}${WS_PATH}`)
  if (ips.length === 0) {
    console.log('LAN URLs : (no external IPv4 address detected)')
    return
  }
  for (const ip of ips) {
    console.log(`LAN URL : http://${ip}:${port}`)
    console.log(`LAN WS  : ws://${ip}:${port}${WS_PATH}`)
  }
}

async function main() {
  const { host, port: startPort, maxPortTries } = parseArgs()
  const root = process.cwd()
  let lastErr = null

  for (let offset = 0; offset < maxPortTries; offset++) {
    const port = startPort + offset
    const server = createServer(root)
    let wss = null
    try {
      await listen(server, host, port)
      wss = attachWebSocket(server)
      if (port !== startPort) {
        console.log(`Port ${startPort} is in use, using ${port} instead.`)
      }
      printServerAddresses(host, port)
      return
    } catch (err) {
      lastErr = err
      if (wss) {
        try {
          wss.close()
        } catch {
          /* ignore */
        }
      }
      server.close()
      const code = err && typeof err === 'object' && 'code' in err ? err.code : null
      if (code === 'EADDRINUSE') continue
      throw err
    }
  }

  console.error(
    `Unable to start server: no free port in range [${startPort}, ${startPort + maxPortTries - 1}] (last error: ${lastErr})`
  )
  process.exit(1)
}

main()
