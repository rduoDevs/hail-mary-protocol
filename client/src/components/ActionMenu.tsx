import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import socket from '../socket'

const ACTIONS = [
  { type: 'gather_oxygen', label: 'Gather O₂', color: '#00bfff' },
  { type: 'gather_power', label: 'Gather Power', color: '#ffd700' },
  { type: 'repair', label: 'Repair Hull', color: '#ff6b35' },
  { type: 'hoard', label: 'Hoard', color: '#aaa' },
  { type: 'share', label: 'Share', color: '#00e676' },
  { type: 'sacrifice', label: 'Sacrifice', color: '#ef5350' },
  { type: 'sabotage', label: 'Sabotage', color: '#ff4444', needsTarget: true },
]

export default function ActionMenu() {
  const phase = useGameStore((s) => s.gameState?.phase)
  const players = useGameStore((s) => s.gameState?.players ?? [])
  const localId = useGameStore((s) => s.localPlayerId)
  const [selected, setSelected] = useState<string | null>(null)
  const [target, setTarget] = useState<string>('')
  const [sent, setSent] = useState(false)

  if (phase !== 'action') return null

  const others = players.filter((p) => p.id !== localId && p.alive)

  const sendAction = () => {
    if (!selected) return
    const action = ACTIONS.find((a) => a.type === selected)
    if (!action) return
    if (action.needsTarget && !target) return

    socket.emit('game:action', {
      type: selected,
      ...(action.needsTarget && target ? { target } : {}),
    })
    setSent(true)
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,215,0,0.4)',
        borderRadius: 8,
        padding: '12px 16px',
        minWidth: 340,
        pointerEvents: 'all',
      }}
    >
      <div style={{ fontSize: 9, color: '#ffd700', letterSpacing: 2, marginBottom: 10 }}>
        SELECT ACTION
      </div>

      {sent ? (
        <div style={{ fontSize: 12, color: '#00e676', textAlign: 'center', padding: '10px 0' }}>
          Action submitted. Waiting for round to resolve...
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {ACTIONS.map((a) => (
              <button
                key={a.type}
                onClick={() => { setSelected(a.type); setTarget('') }}
                style={{
                  background: selected === a.type ? `${a.color}33` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${selected === a.type ? a.color : 'rgba(255,255,255,0.15)'}`,
                  color: selected === a.type ? a.color : '#aaa',
                  padding: '5px 10px',
                  borderRadius: 4,
                  fontSize: 10,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {a.label}
              </button>
            ))}
          </div>

          {selected === 'sabotage' && (
            <div style={{ marginBottom: 10 }}>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.8)',
                  border: '1px solid rgba(255,68,68,0.4)',
                  color: '#e0e0e0',
                  padding: '5px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontFamily: 'inherit',
                }}
              >
                <option value="">-- Select target --</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={sendAction}
            disabled={!selected || (selected === 'sabotage' && !target)}
            style={{
              width: '100%',
              background: selected ? 'rgba(0,191,255,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${selected ? 'rgba(0,191,255,0.6)' : 'rgba(255,255,255,0.1)'}`,
              color: selected ? '#00bfff' : '#555',
              padding: '7px',
              borderRadius: 4,
              fontSize: 11,
              cursor: selected ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              letterSpacing: 1,
            }}
          >
            CONFIRM ACTION
          </button>
        </>
      )}
    </div>
  )
}
