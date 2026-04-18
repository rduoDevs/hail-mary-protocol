import { useEffect, useState } from 'react'
import type { StoryAlert as StoryAlertType } from '../store/gameStore'

interface Props {
  alert: StoryAlertType
}

const COLORS = {
  info: '#00bfff',
  warning: '#ffd700',
  critical: '#ef5350',
}

export default function StoryAlert({ alert }: Props) {
  const [visible, setVisible] = useState(true)
  const color = COLORS[alert.type]

  // Auto-dismiss after 9s
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 9000)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(520px, 90vw)',
        background: 'rgba(0,0,0,0.88)',
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: '12px 16px',
        zIndex: 50,
        animation: 'fadeInDown 0.4s ease',
        boxShadow: `0 0 24px ${color}33`,
        fontFamily: "'Space Mono', monospace",
      }}
    >
      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes criticalPulse {
          0%, 100% { box-shadow: 0 0 24px #ef535033; }
          50%       { box-shadow: 0 0 40px #ef535066; }
        }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 9, color, letterSpacing: 3, marginBottom: 4 }}>
            [!] ROUND {alert.round} — {alert.title}
          </div>
          <div style={{ fontSize: 10, color: '#ccc', lineHeight: 1.6 }}>
            {alert.body}
          </div>
        </div>
        <button
          onClick={() => setVisible(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#555',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
