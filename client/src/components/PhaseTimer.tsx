import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'

const FONT    = "'Press Start 2P', monospace"
const SCANLINE = 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.1) 3px, rgba(0,0,0,0.1) 4px)'

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
    phaseInfo.phase === 'whisper'   ? '#cc88ff'
    : phaseInfo.phase === 'chat'    ? '#00e5ff'
    : phaseInfo.phase === 'donation'? '#ffd700'
    : phaseInfo.phase === 'voting'  ? '#ff8833'
    : '#888888'

  const urgent = timeLeft <= 10
  const displayColor = urgent ? '#ff3333' : phaseColor

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        right: 10,
        background: 'rgba(4,4,16,0.96)',
        border: `2px solid ${displayColor}`,
        padding: '10px 16px',
        textAlign: 'center',
        minWidth: 115,
        pointerEvents: 'none',
        fontFamily: FONT,
        backgroundImage: SCANLINE,
        boxShadow: urgent ? `0 0 20px ${displayColor}33` : 'none',
        animation: urgent ? 'timerFlash 0.5s steps(1) infinite' : 'none',
      }}
    >
      <style>{`
        @keyframes timerFlash {
          0%,  49% { border-color: #ff3333; }
          50%, 100% { border-color: #330000; }
        }
      `}</style>
      <div style={{ fontSize: 7, color: phaseColor, letterSpacing: 2, marginBottom: 6 }}>
        {phaseInfo.phase === 'voting' ? 'EJECT' : phaseInfo.phase.toUpperCase()}
      </div>
      <div
        style={{
          fontSize: 30,
          color: displayColor,
          lineHeight: 1,
          textShadow: `0 0 14px ${displayColor}88`,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {String(timeLeft).padStart(2, '0')}
      </div>
      <div style={{ fontSize: 6, color: '#223344', marginTop: 5, letterSpacing: 2 }}>SEC</div>
    </div>
  )
}
