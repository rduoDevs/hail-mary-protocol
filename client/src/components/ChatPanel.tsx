import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import socket from '../socket'

const FONT    = "'Press Start 2P', monospace"
const BODY    = "'VT323', 'Courier New', monospace"
const SCANLINE = 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.1) 3px, rgba(0,0,0,0.1) 4px)'

export default function ChatPanel({ readOnly = false }: { readOnly?: boolean }) {
  const messages          = useGameStore((s) => s.messages)
  const whispers          = useGameStore((s) => s.whispers)
  const phase             = useGameStore((s) => s.phaseInfo?.phase ?? s.gameState?.phase)
  const localId           = useGameStore((s) => s.localPlayerId)
  const players           = useGameStore((s) => s.gameState?.players ?? [])
  const activeWhispTgt    = useGameStore((s) => s.activeWhisperTarget)
  const setActiveWhispTgt = useGameStore((s) => s.setActiveWhisperTarget)

  const [tab, setTab]             = useState<'all' | 'whisper'>('all')
  const [text, setText]           = useState('')
  const [whisperTarget, setWTgt]  = useState('')
  const bottomRef                 = useRef<HTMLDivElement>(null)

  const canChat    = phase === 'chat'
  const canWhisper = phase === 'whisper' || phase === 'chat'

  useEffect(() => {
    if (activeWhispTgt) {
      setTab('whisper')
      setWTgt(activeWhispTgt)
      setActiveWhispTgt(null)
    }
  }, [activeWhispTgt, setActiveWhispTgt])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, whispers, tab])

  const sendPublic = () => {
    const t = text.trim()
    if (!t || !canChat) return
    socket.emit('game:message', { text: t })
    setText('')
  }

  const sendWhisper = () => {
    const t = text.trim()
    if (!t || !canWhisper || !whisperTarget) return
    socket.emit('game:whisper', { toPlayerId: whisperTarget, text: t })
    setText('')
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') tab === 'all' ? sendPublic() : sendWhisper()
  }

  const myWhispers   = readOnly
    ? whispers
    : whispers.filter(w => w.fromPlayerId === localId || w.toPlayerId === localId)
  const otherPlayers = players.filter(p => p.id !== localId)

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: 10,
        width: 'min(420px, calc(50vw - 20px))',
        maxHeight: 'calc(100vh - 80px)',
        background: 'rgba(4,4,16,0.96)',
        border: '2px solid #001533',
        borderLeft: '2px solid #00e5ff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: FONT,
        backgroundImage: SCANLINE,
        overflow: 'hidden',
      }}
    >
      {/* Header + tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 8px',
        borderBottom: '1px solid #0d1e2e',
      }}>
        <span style={{ fontSize: 7, color: '#00e5ff', textShadow: '0 0 6px rgba(0,229,255,0.5)' }}>COMMS</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'whisper'] as const).map((t) => {
            const active = tab === t
            const color  = t === 'all' ? '#00e5ff' : '#cc88ff'
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  fontSize: 6,
                  padding: '2px 5px',
                  background: active ? `${color}15` : 'transparent',
                  border: `1px solid ${active ? color : '#1a2a3a'}`,
                  color: active ? color : '#334455',
                  cursor: 'pointer',
                  fontFamily: FONT,
                }}
              >
                {t === 'all' ? 'ALL' : `[W]${myWhispers.length > 0 ? `(${myWhispers.length})` : ''}`}
              </button>
            )
          })}
        </div>
      </div>

      {/* Message log */}
      <div style={{ flex: 1, minHeight: 80, overflowY: 'auto', padding: '5px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {tab === 'all' ? (
          messages.length === 0
            ? <div style={{ color: '#223344', fontSize: 7 }}>NO TRANSMISSIONS</div>
            : messages.map((m, i) => (
              <div key={i} style={{ fontFamily: BODY, fontSize: 14, lineHeight: 1.3 }}>
                <span style={{ color: m.playerId === localId ? '#00e5ff' : m.playerId === '__system__' ? '#334455' : '#ffd700' }}>
                  [{m.playerName}]&nbsp;
                </span>
                <span style={{ color: '#8899aa' }}>{m.text}</span>
              </div>
            ))
        ) : (
          myWhispers.length === 0
            ? <div style={{ color: '#223344', fontSize: 7 }}>NO PRIVATE MSGS</div>
            : myWhispers.map((w, i) => {
              const isMine = w.fromPlayerId === localId
              const toPlayer = players.find(p => p.id === w.toPlayerId)
              const label = readOnly
                ? `${w.fromPlayerName}>>${toPlayer?.name ?? w.toPlayerId}`
                : isMine
                  ? `YOU>>${toPlayer?.name ?? '?'}`
                  : `${w.fromPlayerName}>>YOU`
              return (
                <div key={i} style={{ fontFamily: BODY, fontSize: 14, lineHeight: 1.3 }}>
                  <span style={{ color: '#cc88ff' }}>[{label}]&nbsp;</span>
                  <span style={{ color: '#ccbbdd' }}>{w.text}</span>
                </div>
              )
            })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Whisper target selector */}
      {!readOnly && tab === 'whisper' && (
        <div style={{ padding: '4px 8px', borderTop: '1px solid #0d1e2e' }}>
          <select
            value={whisperTarget}
            onChange={(e) => setWTgt(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(180,100,220,0.06)',
              border: '1px solid #4422aa',
              color: whisperTarget ? '#cc88ff' : '#334455',
              padding: '4px 5px',
              fontSize: 7,
              fontFamily: FONT,
              outline: 'none',
            }}
          >
            <option value="">-- SELECT --</option>
            {otherPlayers.filter(p => p.alive).map(p => (
              <option key={p.id} value={p.id}>
                {p.name} [{p.type === 'ai' ? 'AI' : 'HMN'}]
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Input row — hidden in read-only observer mode */}
      {!readOnly && <div style={{ display: 'flex', borderTop: '1px solid #0d1e2e' }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          disabled={tab === 'all' ? !canChat : !canWhisper}
          placeholder={tab === 'all' ? (canChat ? '>_' : 'DISC ONLY') : (canWhisper ? '>_' : 'N/A')}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '6px 8px',
            fontSize: 8,
            color: '#7799bb',
            fontFamily: FONT,
          }}
        />
        <button
          onClick={tab === 'all' ? sendPublic : sendWhisper}
          disabled={tab === 'all' ? !canChat || !text.trim() : !canWhisper || !text.trim() || !whisperTarget}
          style={{
            background: 'transparent',
            border: 'none',
            borderLeft: '1px solid #0d1e2e',
            color: tab === 'all' ? '#00e5ff' : '#cc88ff',
            padding: '0 10px',
            cursor: 'pointer',
            fontSize: 7,
            fontFamily: FONT,
          }}
        >
          TX
        </button>
      </div>}
    </div>
  )
}
