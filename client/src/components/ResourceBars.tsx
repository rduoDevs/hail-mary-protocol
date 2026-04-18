import { useGameStore } from '../store/gameStore'

interface BarProps {
  label: string
  value: number
  max: number
  color: string
}

function Bar({ label, value, max, color }: BarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3, color: '#aaa' }}>
        <span>{label}</span>
        <span style={{ color }}>{Math.round(value)}/{max}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: 3,
            transition: 'width 0.4s ease',
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      </div>
    </div>
  )
}

export default function ResourceBars() {
  const ship = useGameStore((s) => s.gameState?.ship)

  if (!ship) return null

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 160,
        background: 'rgba(0,0,0,0.75)',
        border: '1px solid rgba(0,191,255,0.3)',
        borderRadius: 6,
        padding: '12px 14px',
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: 10, color: '#00bfff', letterSpacing: 2, marginBottom: 10, fontWeight: 700 }}>
        SHIP STATUS
      </div>
      <Bar label="HULL" value={ship.hull_integrity} max={100} color="#ef5350" />
      <Bar label="OXYGEN" value={ship.oxygen} max={100} color="#00bfff" />
      <Bar label="POWER" value={ship.power} max={100} color="#ffd700" />
      <Bar label="PARTS" value={ship.repair_parts} max={50} color="#ff6b35" />
    </div>
  )
}
