import { useGameStore } from '../store/gameStore'
import ResourceBars from './ResourceBars'
import PlayerCards from './PlayerCards'
import ChatPanel from './ChatPanel'
import ActionMenu from './ActionMenu'
import PhaseTimer from './PhaseTimer'
import GameOver from './GameOver'

export default function HUD() {
  const gameState = useGameStore((s) => s.gameState)
  const phaseInfo = useGameStore((s) => s.phaseInfo)

  const phase = gameState?.phase ?? 'lobby'
  const round = gameState?.round ?? 0

  const phaseColor =
    phase === 'discussion' ? '#00bfff'
    : phase === 'action' ? '#ffd700'
    : phase === 'resolution' ? '#ff6b35'
    : '#aaa'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
        fontFamily: "'Space Mono', monospace",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          background: 'rgba(0,0,0,0.75)',
          borderBottom: '1px solid rgba(0,191,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#00bfff', letterSpacing: 3, textShadow: '0 0 10px #00bfff' }}>
          HAIL MARY PROTOCOL
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: 1 }}>
            ROUND <span style={{ color: '#e0e0e0', fontSize: 14, fontWeight: 700 }}>{round}</span>
          </div>
          <div
            style={{
              fontSize: 10,
              color: phaseColor,
              letterSpacing: 2,
              border: `1px solid ${phaseColor}44`,
              padding: '3px 10px',
              borderRadius: 3,
              textShadow: `0 0 6px ${phaseColor}`,
            }}
          >
            {phase.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Side panels */}
      <ResourceBars />
      <PlayerCards />

      {/* Bottom panels */}
      <div style={{ pointerEvents: 'all' }}>
        <ChatPanel />
        <ActionMenu />
      </div>
      <PhaseTimer />

      {/* Game over overlay */}
      <GameOver />
    </div>
  )
}
