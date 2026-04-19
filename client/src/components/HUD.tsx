import { useGameStore } from '../store/gameStore'
import ChatPanel from './ChatPanel'
import PhaseTimer from './PhaseTimer'
import ActionMenu from './ActionMenu'
import PlayerCards from './PlayerCards'
import GameOver from './GameOver'
import ResolutionBanner from './ResolutionBanner'

const FONT = "'Press Start 2P', monospace"
const SCAN = 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.1) 3px,rgba(0,0,0,0.1) 4px)'

function OxygenBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const segs   = 12
  const filled = Math.round((Math.max(0, value) / Math.max(1, max)) * segs)
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 6, color, letterSpacing: 2, marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        {Array.from({ length: segs }).map((_, i) => (
          <div key={i} style={{
            width: 10, height: 12,
            background: i < filled ? color : 'rgba(255,255,255,0.06)',
            boxShadow: i < filled ? `0 0 4px ${color}88` : 'none',
          }} />
        ))}
        <span style={{ fontSize: 8, color, marginLeft: 6, fontFamily: FONT }}>{value}</span>
      </div>
    </div>
  )
}

function YouDied() {
  const players   = useGameStore((s) => s.gameState?.players ?? [])
  const localId   = useGameStore((s) => s.localPlayerId)
  const phase     = useGameStore((s) => s.phaseInfo?.phase ?? s.gameState?.phase)
  const outcome   = useGameStore((s) => s.gameState?.outcome)

  const me = players.find(p => p.id === localId)
  if (!me || me.alive || phase === 'over' || outcome) return null

  const reason = me.deathReason === 'vote' ? 'EJECTED FROM THE SHIP'
    : me.deathReason === 'oxygen'          ? 'OXYGEN DEPLETED'
    : me.deathReason === 'sacrifice'       ? 'SACRIFICED'
    : 'UNKNOWN CAUSE'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90,
      background: 'rgba(60,0,0,0.82)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <style>{`
        @keyframes deathFlicker {
          0%,100% { opacity: 1 } 50% { opacity: 0.7 }
        }
      `}</style>
      <div style={{ fontFamily: FONT, textAlign: 'center', animation: 'deathFlicker 1.2s steps(1) infinite' }}>
        <div style={{ fontSize: 36, color: '#ff1111', letterSpacing: 4, textShadow: '0 0 30px #ff000088', marginBottom: 14 }}>
          YOU DIED
        </div>
        <div style={{ fontSize: 8, color: '#cc3333', letterSpacing: 3, marginBottom: 10 }}>{reason}</div>
        <div style={{ fontSize: 6, color: '#662222', letterSpacing: 2 }}>THE GAME CONTINUES WITHOUT YOU...</div>
      </div>
    </div>
  )
}

export default function HUD() {
  const phase      = useGameStore((s) => s.phaseInfo?.phase ?? s.gameState?.phase)
  const round      = useGameStore((s) => s.gameState?.round ?? 0)
  const publicOxy  = useGameStore((s) => s.gameState?.publicOxygen ?? 0)
  const privateOxy = useGameStore((s) => s.privateOxygen ?? 0)
  const players    = useGameStore((s) => s.gameState?.players ?? [])
  const outcome    = useGameStore((s) => s.gameState?.outcome)

  if (phase === 'over' || outcome) return <GameOver />
  if (phase === 'lobby') return null

  const phaseColor =
    phase === 'whisper' ? '#cc88ff'
    : phase === 'chat'     ? '#00e5ff'
    : phase === 'donation' ? '#ffd700'
    : phase === 'voting'   ? '#ff8833'
    : '#888'

  return (
    <>
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 44,
        background: 'rgba(4,4,18,0.94)', borderBottom: '2px solid #001533',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 20,
        fontFamily: FONT, backgroundImage: SCAN, zIndex: 10,
      }}>
        <span style={{ fontSize: 7, color: '#00e5ff', letterSpacing: 2 }}>HAIL MARY</span>
        <span style={{ fontSize: 6, color: '#223344' }}>RND {round}</span>
        <span style={{ fontSize: 6, color: phaseColor, letterSpacing: 1 }}>
          [{phase === 'voting' ? 'EJECT' : phase?.toUpperCase()}]
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
          <span style={{ fontSize: 6, color: '#00e5ff' }}>
            PUB O₂: <strong style={{ color: '#00ffaa' }}>{publicOxy}</strong>
          </span>
          <span style={{ fontSize: 6, color: '#cc88ff' }}>
            PRIV O₂: <strong style={{ color: '#ff88cc' }}>{privateOxy}</strong>
          </span>
          <span style={{ fontSize: 6, color: '#334455' }}>
            ALIVE: {players.filter(p => p.alive).length}/{players.length}
          </span>
        </div>
      </div>

      {/* Oxygen bars */}
      <div style={{
        position: 'absolute', top: 56, left: 10,
        background: 'rgba(4,4,16,0.96)', border: '2px solid #001533',
        borderLeft: '2px solid #00e5ff', padding: '10px 14px',
        fontFamily: FONT, backgroundImage: SCAN, zIndex: 10,
      }}>
        <OxygenBar label="PUBLIC O₂" value={publicOxy} max={40} color="#00ffaa" />
        <OxygenBar label="MY PRIVATE O₂" value={privateOxy} max={16} color="#ff88cc" />
      </div>

      <PlayerCards />
      <ActionMenu />
      <ChatPanel />
      <PhaseTimer />
      <ResolutionBanner />
      <YouDied />
    </>
  )
}
