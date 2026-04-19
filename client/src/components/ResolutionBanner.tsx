import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'

const FONT = "'Press Start 2P', monospace"
const BODY = "'VT323', monospace"
const SCAN = 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.1) 3px,rgba(0,0,0,0.1) 4px)'

export default function ResolutionBanner() {
  const resolution  = useGameStore((s) => s.lastResolution)
  const players     = useGameStore((s) => s.gameState?.players ?? [])
  const setRes      = useGameStore((s) => s.setLastResolution)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!resolution) return
    setVisible(true)
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(() => setRes(null), 400)
    }, 6000)
    return () => clearTimeout(t)
  }, [resolution, setRes])

  if (!resolution || !visible) return null

  const name = (id: string | null) => {
    if (!id) return null
    return players.find(p => p.id === id)?.name ?? id
  }

  const ejected     = name(resolution.ejectedId)
  const sacrificed  = name(resolution.sacrificeId)
  const oxyDeaths   = resolution.oxygenDeadIds.map(id => name(id)).filter(Boolean)

  const voteTally: Record<string, number> = {}
  for (const v of resolution.votesCast) {
    if (v.targetPlayerId) {
      const n = name(v.targetPlayerId) ?? v.targetPlayerId
      voteTally[n] = (voteTally[n] ?? 0) + 1
    }
  }
  const voteLines = Object.entries(voteTally).sort((a, b) => b[1] - a[1])

  const o2Delta = resolution.publicOxygenEnd - resolution.publicOxygenStart

  return (
    <div style={{
      position: 'absolute',
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(2,4,18,0.97)',
      border: '2px solid #ff8833',
      borderTop: '4px solid #ff8833',
      padding: '18px 28px',
      fontFamily: FONT,
      backgroundImage: SCAN,
      zIndex: 50,
      minWidth: 320,
      maxWidth: 440,
      boxShadow: '0 0 40px rgba(255,136,51,0.25)',
    }}>
      <div style={{ fontSize: 7, color: '#ff8833', letterSpacing: 3, marginBottom: 14, textAlign: 'center' }}>
        ══ ROUND {resolution.round} RESOLVED ══
      </div>

      {/* Vote tally */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 6, color: '#556677', letterSpacing: 2, marginBottom: 5 }}>EJECT TALLY</div>
        {voteLines.length === 0
          ? <div style={{ fontFamily: BODY, fontSize: 14, color: '#334455' }}>No votes cast</div>
          : voteLines.map(([n, c]) => (
            <div key={n} style={{ fontFamily: BODY, fontSize: 15, color: '#ff8833', marginBottom: 2 }}>
              {n.toUpperCase()} — {c} vote{c !== 1 ? 's' : ''}
            </div>
          ))
        }
      </div>

      {/* Ejection */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 6, color: '#556677', letterSpacing: 2, marginBottom: 5 }}>EJECTED</div>
        {ejected
          ? <div style={{ fontFamily: BODY, fontSize: 16, color: '#ff3333' }}>⚠ {ejected.toUpperCase()} EJECTED</div>
          : <div style={{ fontFamily: BODY, fontSize: 14, color: '#334455' }}>No ejection</div>
        }
      </div>

      {/* Oxygen deaths */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 6, color: '#556677', letterSpacing: 2, marginBottom: 5 }}>OXYGEN DEATHS</div>
        {oxyDeaths.length === 0
          ? <div style={{ fontFamily: BODY, fontSize: 14, color: '#334455' }}>None</div>
          : oxyDeaths.map(n => (
            <div key={n} style={{ fontFamily: BODY, fontSize: 16, color: '#ff4488' }}>✗ {(n ?? '').toUpperCase()}</div>
          ))
        }
      </div>

      {/* Sacrifice */}
      {sacrificed && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 6, color: '#556677', letterSpacing: 2, marginBottom: 5 }}>SACRIFICE</div>
          <div style={{ fontFamily: BODY, fontSize: 16, color: '#ffaa00' }}>★ {sacrificed.toUpperCase()} SACRIFICED</div>
        </div>
      )}

      {/* O2 change */}
      <div style={{ borderTop: '1px solid #1a2a3a', paddingTop: 8, marginTop: 4 }}>
        <div style={{ fontFamily: BODY, fontSize: 14, color: o2Delta >= 0 ? '#00ff88' : '#ff3333' }}>
          PUBLIC O₂: {resolution.publicOxygenStart} → {resolution.publicOxygenEnd}
          {' '}({o2Delta >= 0 ? '+' : ''}{o2Delta})
        </div>
      </div>
    </div>
  )
}
