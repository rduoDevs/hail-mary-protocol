import { useGameStore } from '../store/gameStore'

const FONT = "'Press Start 2P', monospace"
const BODY = "'VT323', monospace"
const SCAN = 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.1) 3px,rgba(0,0,0,0.1) 4px)'

export default function PlayerCards() {
  const players  = useGameStore((s) => s.gameState?.players ?? [])
  const localId  = useGameStore((s) => s.localPlayerId)
  const setWhisp = useGameStore((s) => s.setActiveWhisperTarget)

  if (players.length === 0) return null

  return (
    <div style={{
      position: 'absolute', top: 56, right: 10,
      display: 'flex', flexDirection: 'column', gap: 4,
      fontFamily: FONT, zIndex: 10, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto',
    }}>
      {players.map(p => {
        const isLocal = p.id === localId
        const color   = !p.alive ? '#333344' : p.type === 'ai' ? '#ef5350' : '#00e5ff'
        const deathLabel = p.deathReason ? `[${p.deathReason.toUpperCase()}]` : ''

        return (
          <div key={p.id} style={{
            background: 'rgba(4,4,16,0.96)', border: `1px solid ${isLocal ? '#ffffff33' : '#001533'}`,
            borderLeft: `2px solid ${color}`, padding: '5px 8px', minWidth: 155,
            backgroundImage: SCAN, opacity: p.alive ? 1 : 0.4,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ fontSize: 6, color, letterSpacing: 1 }}>
                {p.name.slice(0, 9).toUpperCase()}{isLocal ? ' ◄' : ''}
              </span>
              <span style={{ fontSize: 5, color: p.type === 'ai' ? '#ef5350' : '#334455' }}>
                {p.type === 'ai' ? 'A.I' : 'HMN'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 5, color: p.alive ? '#00ff88' : '#ff3333' }}>
                {p.alive ? 'ALIVE' : `DEAD ${deathLabel}`}
              </span>
              {p.alive && !isLocal && (
                <button onClick={() => setWhisp(p.id)} style={{
                  background: 'transparent', border: '1px solid #4422aa',
                  color: '#cc88ff', fontSize: 5, padding: '1px 4px',
                  cursor: 'pointer', fontFamily: FONT,
                }}>W</button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
