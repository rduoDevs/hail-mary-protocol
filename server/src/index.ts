import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { GameEngine } from './game/GameEngine';
import { DummyAI } from './agents/DummyAI';
import {
  JoinPayload,
  ActionPayload,
  MessagePayload,
  WhisperPayload,
  WhisperMessage,
  PlayerState,
} from './game/types';

const PORT = 3001;
const FILL_TIMEOUT_MS = 10_000; // 10s after first human joins

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── Single game instance ────────────────────────────────────────────────────
let engine = new GameEngine();
const aiAgents: Map<string, DummyAI> = new Map();
let fillTimer: ReturnType<typeof setTimeout> | null = null;
let firstJoinTime: number | null = null;

// ── Helper: broadcast full state to all clients ─────────────────────────────
function broadcastState() {
  io.emit('game:state', engine.getPublicState());
}

// ── Helper: create and register a dummy AI ──────────────────────────────────
function addAI(name: string) {
  const player = engine.addPlayer({ name, type: 'ai' });
  if (!player) return;

  const ai = new DummyAI(
    engine,
    player,
    (playerId, playerName, text) => {
      const msg = { playerId, playerName, text, timestamp: Date.now() };
      io.emit('game:message', msg);
    },
    (fromId, fromName, toId, text) => {
      const whisper: WhisperMessage = { fromPlayerId: fromId, fromPlayerName: fromName, toPlayerId: toId, text, timestamp: Date.now() };
      const fromPlayer = engine.getPlayer(fromId);
      const toPlayer = engine.getPlayer(toId);
      if (fromPlayer?.socketId) io.to(fromPlayer.socketId).emit('game:whisper', whisper);
      if (toPlayer?.socketId) io.to(toPlayer.socketId).emit('game:whisper', whisper);
      console.log(`[whisper] ${fromName} → ${toId}: ${text}`);
    }
  );
  aiAgents.set(player.id, ai);
}

// ── Helper: fill remaining slots with dummy AIs and start ───────────────────
function fillWithAIsAndStart() {
  const needed = engine.maxPlayers - engine.playerCount;
  const aiNames = ['ARIA-7', 'NEXUS-3', 'VEGA-9', 'ORION-2', 'HELIX-5'];
  for (let i = 0; i < needed; i++) {
    addAI(aiNames[i % aiNames.length]);
  }
  startGame();
}

// ── Helper: start the game and wire AI triggers ─────────────────────────────
function startGame() {
  broadcastState();
  engine.start();
}

// ── Wire engine events to socket broadcasts ─────────────────────────────────
function wireEngineEvents() {
  engine.on('game:state', (state) => {
    io.emit('game:state', state);
  });

  engine.on('game:phase', (payload) => {
    io.emit('game:phase', payload);
  });

  engine.on('game:action_result', (payload) => {
    io.emit('game:action_result', payload);
  });

  engine.on('game:over', (payload) => {
    io.emit('game:over', payload);
  });

  engine.on('playerAdded', (player: PlayerState) => {
    broadcastState();
  });

  // When action phase starts, trigger all AI agents
  engine.on('actionPhaseStarted', () => {
    for (const [playerId, ai] of aiAgents.entries()) {
      const player = engine.getPlayer(playerId);
      if (player?.alive) {
        ai.triggerAction();
      }
    }
  });
}

wireEngineEvents();

// ── Socket.IO connection handler ─────────────────────────────────────────────
io.on('connection', (socket: Socket) => {
  console.log(`[connect] ${socket.id}`);

  // Send current state immediately on connect
  socket.emit('game:state', engine.getPublicState());

  // ── game:join ──────────────────────────────────────────────────────────────
  socket.on('game:join', (payload: JoinPayload) => {
    if (engine.phase !== 'lobby') {
      socket.emit('game:message', {
        playerId: 'server',
        playerName: 'SERVER',
        text: 'Game already in progress.',
        timestamp: Date.now(),
      });
      return;
    }

    const player = engine.addPlayer(payload, socket.id);
    if (!player) {
      socket.emit('game:message', {
        playerId: 'server',
        playerName: 'SERVER',
        text: 'Game is full.',
        timestamp: Date.now(),
      });
      return;
    }

    console.log(`[join] ${player.name} (${player.role}) — socket ${socket.id}`);

    // Notify everyone
    io.emit('game:message', {
      playerId: player.id,
      playerName: player.name,
      text: `${player.name} joined as ${player.role}.`,
      timestamp: Date.now(),
    });

    // Track first join time for fill timer
    if (firstJoinTime === null) {
      firstJoinTime = Date.now();
      fillTimer = setTimeout(() => {
        if (engine.phase === 'lobby' && engine.playerCount < engine.maxPlayers) {
          console.log('[timer] Filling remaining slots with AI.');
          fillWithAIsAndStart();
        }
      }, FILL_TIMEOUT_MS);
    }

    // Auto-start: immediately fill with AIs when first human connects (easy testing)
    // Comment out the block below to disable instant start and use the 10s timer instead
    if (engine.playerCount === 1 && payload.type === 'human') {
      if (fillTimer) clearTimeout(fillTimer);
      console.log('[autostart] First human connected — filling with 3 AIs and starting.');
      fillWithAIsAndStart();
      return;
    }

    // Start immediately once full
    if (engine.playerCount === engine.maxPlayers) {
      if (fillTimer) clearTimeout(fillTimer);
      fillWithAIsAndStart();
    }
  });

  // ── game:action ────────────────────────────────────────────────────────────
  socket.on('game:action', (payload: ActionPayload) => {
    const player = engine.getPlayerBySocket(socket.id);
    if (!player) return;

    engine.submitAction(player.id, {
      type: payload.type,
      target: payload.target,
      resource: payload.resource,
    });

    console.log(`[action] ${player.name} → ${payload.type}`);
  });

  // ── game:whisper ───────────────────────────────────────────────────────────
  socket.on('game:whisper', (payload: WhisperPayload) => {
    const sender = engine.getPlayerBySocket(socket.id);
    if (!sender) return;
    const target = engine.getPlayer(payload.toPlayerId);
    if (!target) return;

    const whisper: WhisperMessage = {
      fromPlayerId: sender.id,
      fromPlayerName: sender.name,
      toPlayerId: target.id,
      text: payload.text,
      timestamp: Date.now(),
    };
    socket.emit('game:whisper', whisper);
    if (target.socketId) io.to(target.socketId).emit('game:whisper', whisper);
    console.log(`[whisper] ${sender.name} → ${target.name}: ${payload.text}`);
  });

  // ── game:message ───────────────────────────────────────────────────────────
  socket.on('game:message', (payload: MessagePayload) => {
    const player = engine.getPlayerBySocket(socket.id);
    if (!player) return;

    const msg = {
      playerId: player.id,
      playerName: player.name,
      text: payload.text,
      timestamp: Date.now(),
    };
    io.emit('game:message', msg);
  });

  // ── disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const player = engine.getPlayerBySocket(socket.id);
    if (player) {
      console.log(`[disconnect] ${player.name}`);
      engine.removePlayerSocket(socket.id);
    }
  });
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', gameId: engine.gameId, phase: engine.phase, round: engine.round });
});

app.get('/state', (_req, res) => {
  res.json(engine.getPublicState());
});

// ── Start server ─────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`HAIL MARY PROTOCOL server running on http://localhost:${PORT}`);
});
