import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import cors from 'cors'
import { GameEngine } from './game/GameEngine'
import { GameMode } from './game/config'
import { initBatchRun } from './logging/BatchCollector'

const PORT = 3003
const app  = express()
app.use(cors())
app.use(express.json())

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

// ── Game instance ─────────────────────────────────────────────────────────────

let engine = new GameEngine({ headless: false, gameMode: 'human_vs_ai' })

function wireEngine(eng: GameEngine) {
  eng.on('game:state', (state) => io.emit('game:state', state))
  eng.on('game:phase', (payload) => io.emit('game:phase', payload))
  eng.on('game:message', (msg) => io.emit('game:message', msg))

  eng.on('game:whisper', (w: {
    fromPlayerId: string; toPlayerId: string
    fromPlayerName: string; text: string; timestampMs: number; round: number
  }) => {
    const from = eng.getPlayer(w.fromPlayerId)
    const to   = eng.getPlayer(w.toPlayerId)
    const payload = {
      fromPlayerId:   w.fromPlayerId,
      fromPlayerName: w.fromPlayerName,
      toPlayerId:     w.toPlayerId,
      text:           w.text,
      timestamp:      w.timestampMs,
    }
    if (eng.gameMode === 'all_ai_observer') {
      // Observers see all whispers with full text
      io.emit('game:whisper', payload)
    } else {
      if (from?.socketId) io.to(from.socketId).emit('game:whisper', payload)
      if (to?.socketId)   io.to(to.socketId).emit('game:whisper', payload)
    }
    io.emit('game:whisper_meta', {
      fromPlayerId: w.fromPlayerId, toPlayerId: w.toPlayerId, round: w.round,
    })
  })

  eng.on('game:private_update', (updates: { playerId: string; privateOxygen: number }[]) => {
    for (const u of updates) {
      const p = eng.getPlayer(u.playerId)
      if (p?.socketId) io.to(p.socketId).emit('game:private', { privateOxygen: u.privateOxygen })
    }
  })

  eng.on('game:round_resolved', (data) => io.emit('game:round_resolved', data))

  eng.on('game:over', (summary) => {
    io.emit('game:over', summary)
    setTimeout(() => {
      engine = new GameEngine({ headless: false, gameMode: 'human_vs_ai' })
      wireEngine(engine)
      io.emit('game:state', engine.getPublicState())
      console.log('[reset] New game ready.')
    }, 30_000)
  })
}

wireEngine(engine)

// ── Socket connections ────────────────────────────────────────────────────────

io.on('connection', (socket: Socket) => {
  console.log(`[connect] ${socket.id}`)
  socket.emit('game:state', engine.getPublicState())

  // ── Mode selection ────────────────────────────────────────────────────────
  socket.on('game:select_mode', (payload: { mode: GameMode }) => {
    if (engine.phase !== 'lobby') {
      socket.emit('game:error', 'Game already in progress.')
      return
    }
    const mode = payload.mode ?? 'human_vs_ai'
    // Reset engine with chosen mode
    engine = new GameEngine({ headless: mode === 'all_ai_observer', gameMode: mode })
    wireEngine(engine)
    io.emit('game:state', engine.getPublicState())
    console.log(`[mode] Selected: ${mode}`)

    if (mode === 'all_ai_observer') {
      // Start immediately with all AIs
      engine.fillWithAI()
      trackGame(engine.start().catch(console.error))
    }
  })

  // ── join (human_vs_ai mode) ───────────────────────────────────────────────
  socket.on('game:join', (payload: { name: string; type: 'human' | 'ai' }) => {
    if (engine.phase !== 'lobby') {
      socket.emit('game:error', 'Game already in progress.')
      return
    }
    const player = engine.addPlayer(payload.name, payload.type, socket.id)
    if (!player) {
      socket.emit('game:error', 'Game is full or already started.')
      return
    }

    socket.emit('game:joined', { playerId: player.id, name: player.name })
    socket.emit('game:private', { privateOxygen: player.privateOxygen })

    io.emit('game:message', {
      playerId: '__system__', playerName: 'SYSTEM',
      text: `${player.name} connected.`, timestamp: Date.now(),
    })

    console.log(`[join] ${player.name} (${player.type})`)

    // Fill remaining slots with AI then start
    if (engine.gameMode === 'human_vs_ai' && engine.playerCount < engine.maxPlayers) {
      engine.fillWithAI()
    }
    if (engine.playerCount >= engine.maxPlayers && engine.phase === 'lobby') {
      trackGame(engine.start().catch(console.error))
    }
  })

  // ── whisper ───────────────────────────────────────────────────────────────
  socket.on('game:whisper', (payload: { toPlayerId: string; text: string }) => {
    const sender = engine.getPlayerBySocket(socket.id)
    if (!sender) return
    engine.submitWhisper(sender.id, payload.toPlayerId, payload.text)
  })

  // ── public message ────────────────────────────────────────────────────────
  socket.on('game:message', (payload: { text: string }) => {
    const sender = engine.getPlayerBySocket(socket.id)
    if (!sender) return
    engine.submitPublicMessage(sender.id, payload.text)
  })

  // ── donation ──────────────────────────────────────────────────────────────
  socket.on('game:donate', (payload: { entries: { toPlayerId: string; amount: number }[] }) => {
    const sender = engine.getPlayerBySocket(socket.id)
    if (!sender) return
    engine.submitDonation(sender.id, { entries: payload.entries })
    const priv = engine.getPlayerPrivate(sender.id)
    if (priv) socket.emit('game:private', priv)
  })

  // ── sacrifice ─────────────────────────────────────────────────────────────
  socket.on('game:sacrifice', () => {
    const sender = engine.getPlayerBySocket(socket.id)
    if (!sender) return
    engine.submitSacrifice(sender.id)
  })

  // ── vote ──────────────────────────────────────────────────────────────────
  socket.on('game:vote', (payload: { targetIds: string[] }) => {
    const sender = engine.getPlayerBySocket(socket.id)
    if (!sender) return
    engine.submitVotes(sender.id, payload.targetIds ?? [])
  })

  // ── observer: get agent dashboard ─────────────────────────────────────────
  socket.on('game:get_dashboard', (payload: { playerId: string }) => {
    const dashboard = engine.getAgentDashboard(payload.playerId)
    socket.emit('game:dashboard', dashboard)
  })

  socket.on('disconnect', () => {
    const player = engine.getPlayerBySocket(socket.id)
    if (player) {
      console.log(`[disconnect] ${player.name}`)
      engine.removePlayerSocket(socket.id)
    }
  })
})

// ── REST endpoints ────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', gameId: engine.gameId, phase: engine.phase, round: engine.round })
})

app.get('/state', (_req, res) => res.json(engine.getPublicState()))

app.get('/dashboard/:playerId', (req, res) => {
  const data = engine.getAgentDashboard(req.params.playerId)
  if (!data) { res.status(404).json({ error: 'Player not found' }); return }
  res.json(data)
})

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`HAIL MARY PROTOCOL → http://localhost:${PORT}`)
  console.log(`Cerebras key:${process.env.CEREBRAS_API_KEY ? 'SET' : 'NOT SET (heuristic fallback)'}`)
  console.log(`Dedalus key: ${process.env.DEDALUS_API_KEY ? 'SET' : 'NOT SET (Groq fallback)'}`)
  initBatchRun(15)
})

// ── Graceful shutdown — waits for any running game analysis to finish ─────────

let pendingGame: Promise<void> | null = null

function trackGame(p: Promise<void>) { pendingGame = p.finally(() => { pendingGame = null }) }

// Patch engine.start() calls to be tracked
const _origAllAi = engine.start.bind(engine)
void _origAllAi  // suppress unused warning

async function shutdown(signal: string) {
  console.log(`\n[shutdown] ${signal} received — waiting for any pending analysis...`)
  if (pendingGame) {
    await pendingGame.catch(() => {})
    console.log('[shutdown] Analysis complete.')
  }
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
