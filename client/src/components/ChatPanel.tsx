import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import socket from '../socket'

export default function ChatPanel() {
  const messages = useGameStore((s) => s.messages)
  const phase = useGameStore((s) => s.gameState?.phase)
  const localId = useGameStore((s) => s.localPlayerId)
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const canChat = phase === 'discussion'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = () => {
    const trimmed = text.trim()
    if (!trimmed || !canChat) return
    socket.emit('game:message', { text: trimmed })
    setText('')
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') send()
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        width: 280,
        background: 'rgba(0,0,0,0.75)',
        border: '1px solid rgba(0,191,255,0.3)',
        borderRadius: 6,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: 9, color: '#00bfff', letterSpacing: 2, padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        COMMS
      </div>
      <div
        style={{
          height: 160,
          overflowY: 'auto',
          padding: '6px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#444', fontSize: 10, fontStyle: 'italic' }}>No transmissions yet.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ fontSize: 10, lineHeight: 1.4 }}>
            <span style={{ color: m.playerId === localId ? '#00bfff' : '#ffd700', marginRight: 4 }}>
              [{m.playerName}]
            </span>
            <span style={{ color: '#ccc' }}>{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          disabled={!canChat}
          placeholder={canChat ? 'Transmit...' : 'Discussion phase only'}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '7px 10px',
            fontSize: 10,
            color: canChat ? '#e0e0e0' : '#555',
            fontFamily: 'inherit',
            cursor: canChat ? 'text' : 'not-allowed',
          }}
        />
        <button
          onClick={send}
          disabled={!canChat || !text.trim()}
          style={{
            background: canChat && text.trim() ? 'rgba(0,191,255,0.2)' : 'transparent',
            border: 'none',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            color: canChat && text.trim() ? '#00bfff' : '#444',
            padding: '0 12px',
            cursor: canChat && text.trim() ? 'pointer' : 'not-allowed',
            fontSize: 10,
            fontFamily: 'inherit',
          }}
        >
          SEND
        </button>
      </div>
    </div>
  )
}
