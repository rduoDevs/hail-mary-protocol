import { useEffect } from 'react'
import socket from './socket'
import { useGameStore } from './store/gameStore'
import PixiSceneCanvas from './pixi/PixiSceneCanvas'
import HUD from './components/HUD'
import ModeSelector from './components/ModeSelector'
import ObserverControls from './components/ObserverControls'
import AgentPopupDashboard from './components/AgentPopupDashboard'
import ChatPanel from './components/ChatPanel'
import ResolutionBanner from './components/ResolutionBanner'

export default function App() {
  const joined           = useGameStore((s) => s.joined)
  const isObserver       = useGameStore((s) => s.isObserver)
  const selectedMode     = useGameStore((s) => s.selectedMode)
  const setConnected     = useGameStore((s) => s.setConnected)
  const setJoined        = useGameStore((s) => s.setJoined)
  const setGameState     = useGameStore((s) => s.setGameState)
  const setPhaseInfo     = useGameStore((s) => s.setPhaseInfo)
  const addMessage       = useGameStore((s) => s.addMessage)
  const addWhisper       = useGameStore((s) => s.addWhisper)
  const setPrivateOxygen = useGameStore((s) => s.setPrivateOxygen)
  const setLastResolution= useGameStore((s) => s.setLastResolution)

  useEffect(() => {
    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('game:joined', (payload: { playerId: string; name: string }) => {
      setJoined(payload.playerId, payload.name)
    })

    socket.on('game:state', (state) => setGameState(state))
    socket.on('game:private', (payload: { privateOxygen: number }) => setPrivateOxygen(payload.privateOxygen))
    socket.on('game:phase', (info) => setPhaseInfo(info))
    socket.on('game:message', (msg) => addMessage(msg))
    socket.on('game:whisper', (w) => addWhisper(w))

    socket.on('game:round_resolved', (data: { round: number; summary: {
      ejectionResult: string | null
      oxygenDeathsThisRound: string[]
      sacrificeThisRound: string | null
      publicOxygenStart: number
      publicOxygenEnd: number
      votesCast: { voterPlayerId: string; targetPlayerId: string | null }[]
    } }) => {
      setLastResolution({
        round:             data.round,
        ejectedId:         data.summary.ejectionResult,
        oxygenDeadIds:     data.summary.oxygenDeathsThisRound,
        sacrificeId:       data.summary.sacrificeThisRound,
        publicOxygenStart: data.summary.publicOxygenStart,
        publicOxygenEnd:   data.summary.publicOxygenEnd,
        votesCast:         data.summary.votesCast,
      })
    })

    socket.on('game:over', () => {})

    return () => {
      socket.off('connect'); socket.off('disconnect'); socket.off('game:joined')
      socket.off('game:state'); socket.off('game:private'); socket.off('game:phase')
      socket.off('game:message'); socket.off('game:whisper')
      socket.off('game:round_resolved'); socket.off('game:over')
    }
  }, [])

  // Show mode selector if not yet in a session
  if (!joined && !selectedMode) {
    return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#060610' }}>
        <ModeSelector />
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#060610' }}>
      <PixiSceneCanvas />

      {/* Human-vs-AI mode: full HUD */}
      {joined && !isObserver && <HUD />}

      {/* Observer mode: simplified observer panel + read-only chat + resolution banner */}
      {isObserver && (
        <>
          <ObserverHUD />
          <ObserverControls />
          <ChatPanel readOnly />
          <ResolutionBanner />
        </>
      )}

      {/* Agent popup dashboard (both modes) */}
      <AgentPopupDashboard />
    </div>
  )
}

// Lightweight observer HUD (no action menus)
function ObserverHUD() {
  const FONT = "'Press Start 2P', monospace"
  const SCAN = 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.1) 3px,rgba(0,0,0,0.1) 4px)'

  const phase     = useGameStore((s) => s.phaseInfo?.phase ?? s.gameState?.phase)
  const round     = useGameStore((s) => s.gameState?.round ?? 0)
  const totalRnds = useGameStore((s) => 5)
  const publicOxy = useGameStore((s) => s.gameState?.publicOxygen ?? 0)
  const players   = useGameStore((s) => s.gameState?.players ?? [])

  const phaseColor =
    phase === 'whisper'  ? '#cc88ff'
    : phase === 'chat'     ? '#00e5ff'
    : phase === 'donation' ? '#ffd700'
    : phase === 'voting'   ? '#ff8833'
    : '#888'

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: 44,
      background: 'rgba(4,4,18,0.94)', borderBottom: '2px solid #2a1a4a',
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 20,
      fontFamily: FONT, backgroundImage: SCAN, zIndex: 10,
    }}>
      <span style={{ fontSize: 7, color: '#cc88ff', letterSpacing: 2 }}>OBSERVER</span>
      <span style={{ fontSize: 6, color: '#223344' }}>RND {round}/{totalRnds}</span>
      <span style={{ fontSize: 6, color: phaseColor, letterSpacing: 1 }}>[{phase === 'voting' ? 'EJECT' : phase?.toUpperCase()}]</span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
        <span style={{ fontSize: 6, color: '#00e5ff' }}>
          PUB O₂: <strong style={{ color: '#00ffaa' }}>{publicOxy}</strong>
        </span>
        <span style={{ fontSize: 6, color: '#334455' }}>
          ALIVE: {players.filter(p => p.alive).length}/{players.length}
        </span>
      </div>
    </div>
  )
}
