import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import socket from '../socket'

const FONT = "'Press Start 2P', monospace"
const SCAN = 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.1) 3px,rgba(0,0,0,0.1) 4px)'

export default function ActionMenu() {
  const phase      = useGameStore((s) => s.phaseInfo?.phase ?? s.gameState?.phase)
  const players    = useGameStore((s) => s.gameState?.players ?? [])
  const localId    = useGameStore((s) => s.localPlayerId)
  const privateOxy = useGameStore((s) => s.privateOxygen ?? 0)

  const [donateTarget, setDonateTarget] = useState('')
  const [donateAmount, setDonateAmount] = useState(1)
  const [ejectTarget, setEjectTarget]   = useState('')
  const [submitted, setSubmitted]       = useState(false)

  const alivePlayers = players.filter(p => p.alive)
  const others       = alivePlayers.filter(p => p.id !== localId)
  const isLocalAlive = players.find(p => p.id === localId)?.alive ?? false

  useEffect(() => {
    setSubmitted(false)
    setDonateTarget('')
    setDonateAmount(1)
    setEjectTarget('')
  }, [phase])

  if (!isLocalAlive) return null
  if (phase !== 'donation' && phase !== 'voting') return null

  const sendDonate = () => {
    if (!donateTarget || donateAmount <= 0) return
    socket.emit('game:donate', { entries: [{ toPlayerId: donateTarget, amount: donateAmount }] })
    setSubmitted(true)
  }

  const sendSacrifice = () => {
    if (!confirm('SACRIFICE yourself? Your private oxygen goes to the public pool. YOU WILL DIE.')) return
    socket.emit('game:sacrifice')
    setSubmitted(true)
  }

  const sendEject = () => {
    if (!ejectTarget) return
    socket.emit('game:vote', { targetIds: [ejectTarget] })
    setSubmitted(true)
  }

  const borderColor = phase === 'donation' ? '#ffd700' : '#ff8833'

  return (
    <div style={{
      position: 'absolute', bottom: 90, right: 10,
      background: 'rgba(4,4,16,0.96)', border: `2px solid ${borderColor}`,
      padding: '10px 14px', fontFamily: FONT, backgroundImage: SCAN,
      minWidth: 240, zIndex: 10,
    }}>
      <div style={{ fontSize: 7, color: borderColor, letterSpacing: 2, marginBottom: 8 }}>
        {phase === 'donation' ? '[ DONATE / SACRIFICE ]' : '[ EJECT ]'}
      </div>

      {submitted && (
        <div style={{ fontSize: 7, color: '#00ff88', marginBottom: 6 }}>✓ SUBMITTED</div>
      )}

      {/* ── DONATION PHASE ── */}
      {!submitted && phase === 'donation' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <select value={donateTarget} onChange={e => setDonateTarget(e.target.value)}
              style={{ width: '100%', background: 'rgba(255,215,0,0.06)', border: '1px solid #443300',
                color: donateTarget ? '#ffd700' : '#334455', padding: '4px', fontSize: 7, fontFamily: FONT, outline: 'none' }}>
              <option value="">-- TARGET --</option>
              {others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[1, 2, 3].map(n => (
              <button key={n} onClick={() => setDonateAmount(n)}
                style={{
                  flex: 1, background: donateAmount === n ? 'rgba(255,215,0,0.15)' : 'transparent',
                  border: `1px solid ${donateAmount === n ? '#ffd700' : '#332200'}`,
                  color: donateAmount === n ? '#ffd700' : '#554400',
                  padding: '4px 0', fontSize: 7, cursor: 'pointer', fontFamily: FONT,
                }}>
                {n}
              </button>
            ))}
          </div>
          <button onClick={sendDonate} disabled={!donateTarget}
            style={{
              width: '100%', background: 'rgba(255,215,0,0.06)', border: '1px solid #ffd700',
              color: '#ffd700', padding: '6px', fontSize: 6, cursor: 'pointer', fontFamily: FONT,
              marginBottom: 6, letterSpacing: 1, opacity: donateTarget ? 1 : 0.4,
            }}>
            DONATE {donateAmount} O₂
          </button>
          <button onClick={() => { socket.emit('game:donate', { entries: [] }); setSubmitted(true) }}
            style={{
              width: '100%', background: 'transparent', border: '1px solid #223344',
              color: '#334455', padding: '5px', fontSize: 6, cursor: 'pointer', fontFamily: FONT,
              marginBottom: 6,
            }}>
            NO DONATION
          </button>
          <button onClick={sendSacrifice}
            style={{
              width: '100%', background: 'rgba(255,0,0,0.06)', border: '1px solid #ff3333',
              color: '#ff3333', padding: '5px', fontSize: 6, cursor: 'pointer', fontFamily: FONT,
            }}>
            ⚠ SACRIFICE
          </button>
        </>
      )}

      {/* ── EJECTION PHASE ── */}
      {!submitted && phase === 'voting' && (
        <>
          <div style={{ fontSize: 6, color: '#ff4444', marginBottom: 2 }}>CHOOSE WHO TO EJECT</div>
          <div style={{ fontSize: 5, color: '#662222', marginBottom: 8 }}>
            IF MAJORITY CHOOSE THE SAME PERSON, THEY DIE
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            {alivePlayers.map(p => {
              const isSelf    = p.id === localId
              const selected  = ejectTarget === p.id
              return (
                <div key={p.id} onClick={() => setEjectTarget(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                    padding: '5px 8px',
                    background: selected ? 'rgba(255,51,51,0.15)' : 'transparent',
                    border: `1px solid ${selected ? '#ff3333' : '#1a2a3a'}`,
                  }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    border: `1px solid ${selected ? '#ff3333' : '#334455'}`,
                    background: selected ? '#ff3333' : 'transparent',
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 7, fontFamily: FONT,
                    color: selected ? '#ff4444' : isSelf ? '#ff8833' : '#7799bb',
                    flex: 1,
                  }}>
                    {p.name.slice(0, 12).toUpperCase()}
                    {isSelf && <span style={{ fontSize: 5, color: '#ff6600', marginLeft: 4 }}>(YOU)</span>}
                  </span>
                </div>
              )
            })}
          </div>

          <div style={{ fontSize: 5, color: ejectTarget ? '#ff4444' : '#442222', marginBottom: 6, letterSpacing: 1 }}>
            {ejectTarget
              ? `EJECTING: ${alivePlayers.find(p => p.id === ejectTarget)?.name?.toUpperCase()}`
              : '⚠ SELECT SOMEONE TO EJECT'}
          </div>

          <button onClick={sendEject} disabled={!ejectTarget}
            style={{
              width: '100%', background: ejectTarget ? 'rgba(255,51,51,0.12)' : 'transparent',
              border: `1px solid ${ejectTarget ? '#ff3333' : '#442222'}`,
              color: ejectTarget ? '#ff3333' : '#442222',
              padding: '6px', fontSize: 6, cursor: ejectTarget ? 'pointer' : 'default',
              fontFamily: FONT, letterSpacing: 1,
            }}>
            CONFIRM EJECTION
          </button>
        </>
      )}
    </div>
  )
}
