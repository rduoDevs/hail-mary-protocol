import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import socket from '../socket'

export default function ChatPanel() {
  const messages = useGameStore((s) => s.messages)
  const whispers = useGameStore((s) => s.whispers)
  const phase = useGameStore((s) => s.gameState?.phase)
  const localId = useGameStore((s) => s.localPlayerId)
  const players = useGameStore((s) => s.gameState?.players ?? [])
  const activeWhisperTarget = useGameStore((s) => s.activeWhisperTarget)
  const setActiveWhisperTarget = useGameStore((s) => s.setActiveWhisperTarget)

  const [tab, setTab] = useState<'all' | 'whisper'>('all')
  const [text, setText] = useState('')
  const [whisperTarget, setWhisperTarget] = useState<string>('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const canChat = phase === 'discussion'
  const canWhisper = phase === 'discussion' || phase === 'action'

  // Auto-switch to whisper tab when activeWhisperTarget is set from PlayerCards
  useEffect(() => {
    if (activeWhisperTarget) {
      setTab('whisper')
      setWhisperTarget(activeWhisperTarget)
      setActiveWhisperTarget(null)
    }
  }, [activeWhisperTarget, setActiveWhisperTarget])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, whispers, tab])

  const sendPublic = () => {
    const trimmed = text.trim()
    if (!trimmed || !canChat) return
    socket.emit('game:message', { text: trimmed })
    setText('')
  }

  const sendWhisper = () => {
    const trimmed = text.trim()
    if (!trimmed || !canWhisper || !whisperTarget) return
    socket.emit('game:whisper', { toPlayerId: whisperTarget, text: trimmed })
    setText('')
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') tab === 'all' ? sendPublic() : sendWhisper()
  }

  const myWhispers = whispers.filter(
    w => w.fromPlayerId === localId || w.toPlayerId === localId
  )

  const otherPlayers = players.filter(p => p.id !== localId)

  const tabStyle = (active: boolean, color: string) => ({
    fontSize: 9,
    letterSpacing: 2,
    padding: '3px 8px',
    borderRadius: 3,
    border: `1px solid ${active ? color : 'transparent'}`,
    color: active ? color : '#555',
    background: active ? `${color}18` : 'transparent',
    cursor: 'pointer' as const,
    fontFamily: 'inherit',
  })

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        width: 300,
        background: 'rgba(0,0,0,0.8)',
        border: '1px solid rgba(0,191,255,0.3)',
        borderRadius: 6,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header + tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ fontSize: 9, color: '#00bfff', letterSpacing: 2 }}>COMMS</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={tabStyle(tab === 'all', '#00bfff')} onClick={() => setTab('all')}>ALL</button>
          <button style={tabStyle(tab === 'whisper', '#ce93d8')} onClick={() => setTab('whisper')}>
            WHISPER {myWhispers.length > 0 ? `(${myWhispers.length})` : ''}
          </button>
        </div>
      </div>

      {/* Message log */}
      <div style={{ height: 150, overflowY: 'auto', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tab === 'all' && (
          messages.length === 0
            ? <div style={{ color: '#444', fontSize: 10, fontStyle: 'italic' }}>No transmissions yet.</div>
            : messages.map((m, i) => (
              <div key={i} style={{ fontSize: 10, lineHeight: 1.4 }}>
                <span style={{ color: m.playerId === localId ? '#00bfff' : m.playerId === '__system__' ? '#666' : '#ffd700', marginRight: 4 }}>
                  [{m.playerName}]
                </span>
                <span style={{ color: '#ccc' }}>{m.text}</span>
              </div>
            ))
        )}
        {tab === 'whisper' && (
          myWhispers.length === 0
            ? <div style={{ color: '#444', fontSize: 10, fontStyle: 'italic' }}>No private transmissions.</div>
            : myWhispers.map((w, i) => {
              const isMine = w.fromPlayerId === localId
              const counterpart = isMine ? w.toPlayerId : w.fromPlayerId
              const counterpartPlayer = players.find(p => p.id === counterpart)
              const label = isMine ? `YOU → ${counterpartPlayer?.name ?? '?'}` : `${w.fromPlayerName} → YOU`
              return (
                <div key={i} style={{ fontSize: 10, lineHeight: 1.4 }}>
                  <span style={{ color: '#ce93d8', marginRight: 4 }}>[{label}]</span>
                  <span style={{ color: '#e0d0e8' }}>{w.text}</span>
                </div>
              )
            })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Whisper target selector */}
      {tab === 'whisper' && (
        <div style={{ padding: '4px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <select
            value={whisperTarget}
            onChange={(e) => setWhisperTarget(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(206,147,216,0.08)',
              border: '1px solid rgba(206,147,216,0.3)',
              borderRadius: 3,
              color: whisperTarget ? '#ce93d8' : '#555',
              padding: '4px 6px',
              fontSize: 10,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          >
            <option value="">— select recipient —</option>
            {otherPlayers.filter(p => p.alive).map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.type === 'ai' ? 'AI' : 'HUMAN'})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          disabled={tab === 'all' ? !canChat : !canWhisper}
          placeholder={
            tab === 'all'
              ? (canChat ? 'Transmit...' : 'Discussion phase only')
              : (canWhisper ? (whisperTarget ? 'Whisper...' : 'Select recipient first') : 'Not available now')
          }
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '7px 10px',
            fontSize: 10,
            color: '#e0e0e0',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={tab === 'all' ? sendPublic : sendWhisper}
          disabled={
            tab === 'all'
              ? (!canChat || !text.trim())
              : (!canWhisper || !text.trim() || !whisperTarget)
          }
          style={{
            background: 'transparent',
            border: 'none',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            color: tab === 'all' ? '#00bfff' : '#ce93d8',
            padding: '0 12px',
            cursor: 'pointer',
            fontSize: 10,
            fontFamily: 'inherit',
            opacity: (tab === 'all' ? (!canChat || !text.trim()) : (!canWhisper || !text.trim() || !whisperTarget)) ? 0.3 : 1,
          }}
        >
          SEND
        </button>
      </div>
    </div>
  )
}
