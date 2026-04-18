import { useGameStore } from '../store/gameStore'
import socket from '../socket'

export default function GameOver() {
  const gameState = useGameStore((s) => s.gameState)
  const reset = useGameStore((s) => s.reset)

  if (gameState?.phase !== 'over') return null

  const outcome = gameState.outcome
  const isWin = outcome?.result === 'win'

  const handlePlayAgain = () => {
    reset()
    socket.disconnect()
    window.location.reload()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        pointerEvents: 'all',
      }}
    >
      <div
        style={{
          background: 'rgba(10,10,20,0.95)',
          border: `2px solid ${isWin ? '#00e676' : '#ef5350'}`,
          borderRadius: 12,
          padding: '40px 60px',
          textAlign: 'center',
          maxWidth: 480,
          boxShadow: `0 0 60px ${isWin ? 'rgba(0,230,118,0.3)' : 'rgba(239,83,80,0.3)'}`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 4,
            color: isWin ? '#00e676' : '#ef5350',
            marginBottom: 16,
          }}
        >
          MISSION {isWin ? 'COMPLETE' : 'FAILED'}
        </div>
        <div
          style={{
            fontSize: 42,
            fontWeight: 700,
            color: '#e0e0e0',
            marginBottom: 24,
            textShadow: `0 0 20px ${isWin ? '#00e676' : '#ef5350'}`,
          }}
        >
          {isWin ? 'SURVIVED' : 'LOST'}
        </div>

        {outcome?.message && (
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 24, lineHeight: 1.6 }}>
            {outcome.message}
          </div>
        )}

        {outcome?.survivors && outcome.survivors.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 8 }}>SURVIVORS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {outcome.survivors.map((name, i) => (
                <span
                  key={i}
                  style={{
                    background: 'rgba(0,230,118,0.1)',
                    border: '1px solid rgba(0,230,118,0.3)',
                    color: '#00e676',
                    padding: '3px 10px',
                    borderRadius: 12,
                    fontSize: 11,
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handlePlayAgain}
          style={{
            background: 'rgba(0,191,255,0.15)',
            border: '1px solid rgba(0,191,255,0.5)',
            color: '#00bfff',
            padding: '10px 32px',
            borderRadius: 6,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: 2,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.background = 'rgba(0,191,255,0.3)'
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.background = 'rgba(0,191,255,0.15)'
          }}
        >
          PLAY AGAIN
        </button>
      </div>
    </div>
  )
}
