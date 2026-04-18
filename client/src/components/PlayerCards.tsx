import { useGameStore } from '../store/gameStore'

export default function PlayerCards() {
  const players = useGameStore((s) => s.gameState?.players ?? [])
  const localId = useGameStore((s) => s.localPlayerId)

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 170,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {players.map((p) => {
        const isLocal = p.id === localId
        const healthPct = Math.max(0, Math.min(100, p.health))
        const roleColor =
          p.role === 'Engineer' ? '#ff6b35'
          : p.role === 'Medic' ? '#00e676'
          : p.role === 'Navigator' ? '#00bfff'
          : '#ffd700'

        return (
          <div
            key={p.id}
            style={{
              background: isLocal ? 'rgba(0,191,255,0.12)' : 'rgba(0,0,0,0.75)',
              border: `1px solid ${isLocal ? 'rgba(0,191,255,0.6)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 5,
              padding: '8px 10px',
              opacity: p.alive ? 1 : 0.45,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: p.alive ? '#e0e0e0' : '#666' }}>
                {p.name}
                {isLocal && <span style={{ color: '#00bfff', marginLeft: 4, fontSize: 9 }}>YOU</span>}
              </span>
              <span style={{ fontSize: 9, color: p.type === 'human' ? '#4fc3f7' : '#ef5350' }}>
                {p.type === 'human' ? 'HUMAN' : 'AI'}
              </span>
            </div>
            <div style={{ fontSize: 9, color: roleColor, marginBottom: 5 }}>{p.role.toUpperCase()}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#888', marginBottom: 3 }}>
              <span>HP</span>
              <span style={{ color: '#e0e0e0' }}>{p.alive ? `${p.health}%` : 'DEAD'}</span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${healthPct}%`,
                  background: p.alive ? '#00e676' : '#333',
                  borderRadius: 2,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
