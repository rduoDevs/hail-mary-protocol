import { useEffect, useState } from 'react'
import socket from './socket'
import { useGameStore } from './store/gameStore'
import ShipSceneCanvas from './three/ShipSceneCanvas'
import HUD from './components/HUD'

// ─── Join Screen ────────────────────────────────────────────────────────────

function JoinScreen() {
  const [name, setName] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const setConnected = useGameStore((s) => s.setConnected)
  const setJoined = useGameStore((s) => s.setJoined)

  const join = () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Enter a name to join.'); return }
    setConnecting(true)
    setError('')

    if (!socket.connected) {
      socket.connect()
    }

    socket.once('connect', () => {
      setConnected(true)
      socket.emit('game:join', { name: trimmed, type: 'human' })
      setJoined(socket.id ?? 'local', trimmed)
    })

    socket.once('connect_error', () => {
      setConnecting(false)
      setError('Could not connect to server (localhost:3001)')
    })

    // If already connected
    if (socket.connected) {
      setConnected(true)
      socket.emit('game:join', { name: trimmed, type: 'human' })
      setJoined(socket.id ?? 'local', trimmed)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') join()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0f',
        zIndex: 200,
        fontFamily: "'Space Mono', monospace",
      }}
    >
      {/* Animated starfield background hint */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle at 50% 50%, rgba(0,191,255,0.04) 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          background: 'rgba(10,10,20,0.95)',
          border: '1px solid rgba(0,191,255,0.4)',
          borderRadius: 10,
          padding: '48px 56px',
          textAlign: 'center',
          maxWidth: 400,
          width: '90%',
          boxShadow: '0 0 60px rgba(0,191,255,0.1)',
        }}
      >
        <div style={{ fontSize: 10, color: '#555', letterSpacing: 4, marginBottom: 12 }}>
          MULTIPLAYER SURVIVAL
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#00bfff',
            letterSpacing: 3,
            marginBottom: 8,
            textShadow: '0 0 20px rgba(0,191,255,0.6)',
          }}
        >
          HAIL MARY
        </div>
        <div style={{ fontSize: 14, color: '#4fc3f7', letterSpacing: 4, marginBottom: 36 }}>
          PROTOCOL
        </div>

        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Enter callsign..."
            maxLength={20}
            autoFocus
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(0,191,255,0.3)',
              borderRadius: 5,
              color: '#e0e0e0',
              padding: '10px 14px',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
              textAlign: 'center',
            }}
          />
        </div>

        {error && (
          <div style={{ fontSize: 10, color: '#ef5350', marginBottom: 12 }}>{error}</div>
        )}

        <button
          onClick={join}
          disabled={connecting}
          style={{
            width: '100%',
            background: connecting ? 'rgba(0,191,255,0.05)' : 'rgba(0,191,255,0.15)',
            border: '1px solid rgba(0,191,255,0.5)',
            color: connecting ? '#555' : '#00bfff',
            padding: '11px',
            borderRadius: 5,
            fontSize: 12,
            cursor: connecting ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            letterSpacing: 2,
            transition: 'all 0.2s',
          }}
        >
          {connecting ? 'CONNECTING...' : 'JOIN AS HUMAN'}
        </button>

        <div style={{ marginTop: 24, fontSize: 9, color: '#333' }}>
          Connecting to localhost:3001
        </div>
      </div>
    </div>
  )
}

// ─── App Root ────────────────────────────────────────────────────────────────

export default function App() {
  const joined = useGameStore((s) => s.joined)
  const gameState = useGameStore((s) => s.gameState)
  const setConnected = useGameStore((s) => s.setConnected)
  const setJoined = useGameStore((s) => s.setJoined)
  const setGameState = useGameStore((s) => s.setGameState)
  const setPhaseInfo = useGameStore((s) => s.setPhaseInfo)
  const addMessage = useGameStore((s) => s.addMessage)
  const setActionResults = useGameStore((s) => s.setActionResults)
  const addWhisper = useGameStore((s) => s.addWhisper)

  useEffect(() => {
    // Socket event listeners
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('game:state', (state) => {
      setGameState(state)
      const localName = useGameStore.getState().localPlayerName
      if (localName) {
        const self = state.players.find(
          (p: any) => p.name === localName && p.type === 'human'
        )
        if (self) {
          useGameStore.setState({ localPlayerId: self.id })
        }
      }
    })

    socket.on('game:phase', (info) => {
      setPhaseInfo(info)
      // Also reset action sent state when phase changes
    })

    socket.on('game:message', (msg) => {
      addMessage(msg)
    })

    socket.on('game:action_result', (payload) => {
      setActionResults(payload.results ?? [])
      // Append results as system messages
      if (payload.results) {
        payload.results.forEach((r: any) => {
          addMessage({
            playerId: '__system__',
            playerName: 'SYSTEM',
            text: `[Round ${payload.round}] ${r.result ?? JSON.stringify(r)}`,
            timestamp: Date.now(),
          })
        })
      }
    })

    socket.on('game:whisper', (whisper) => {
      addWhisper(whisper)
    })

    socket.on('game:over', (payload) => {
      // Merge outcome into current game state
      const current = useGameStore.getState().gameState
      if (current) {
        setGameState({
          ...current,
          phase: 'over',
          outcome: { result: payload.outcome, survivors: payload.survivors, message: payload.message },
        })
      }
    })

    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('game:state')
      socket.off('game:phase')
      socket.off('game:message')
      socket.off('game:action_result')
      socket.off('game:over')
      socket.off('game:whisper')
    }
  }, [])

  const showGame = joined

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0a0f' }}>
      {showGame && (
        <>
          <ShipSceneCanvas />
          <HUD />
        </>
      )}
      {!showGame && <JoinScreen />}
    </div>
  )
}
