import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'

export default function PhaseTimer() {
  const phaseInfo = useGameStore((s) => s.phaseInfo)
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    if (!phaseInfo) return
    setTimeLeft(phaseInfo.timeLeft)

    const interval = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1))
    }, 1000)

    return () => clearInterval(interval)
  }, [phaseInfo])

  if (!phaseInfo) return null

  const phaseColor =
    phaseInfo.phase === 'discussion' ? '#00bfff'
    : phaseInfo.phase === 'action' ? '#ffd700'
    : '#ff6b35'

  const urgency = timeLeft <= 10

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        background: 'rgba(0,0,0,0.75)',
        border: `1px solid ${urgency ? '#ef5350' : 'rgba(255,255,255,0.15)'}`,
        borderRadius: 6,
        padding: '10px 16px',
        textAlign: 'center',
        minWidth: 120,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: 9, color: phaseColor, letterSpacing: 2, marginBottom: 4 }}>
        {phaseInfo.phase.toUpperCase()}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: urgency ? '#ef5350' : '#e0e0e0',
          lineHeight: 1,
          textShadow: urgency ? '0 0 12px #ef5350' : 'none',
          transition: 'color 0.3s',
        }}
      >
        {timeLeft}
      </div>
      <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>SECONDS</div>
    </div>
  )
}
