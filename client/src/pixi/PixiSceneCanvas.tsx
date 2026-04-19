import { useEffect, useRef } from 'react'
import { PixiScene } from './PixiScene'
import { useGameStore } from '../store/gameStore'

export default function PixiSceneCanvas() {
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const sceneRef      = useRef<PixiScene | null>(null)
  const msgLenRef     = useRef(0)
  const gameState     = useGameStore((s) => s.gameState)
  const localPlayerId = useGameStore((s) => s.localPlayerId)
  const messages      = useGameStore((s) => s.messages)
  const setSelectedId = useGameStore((s) => s.setSelectedAgentId)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (sceneRef.current) return

    const scene = new PixiScene(canvas, (playerId) => {
      setSelectedId(playerId)
    })
    sceneRef.current = scene

    const onResize = () => scene.resize(window.innerWidth, window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      scene.dispose()
      sceneRef.current = null
    }
  }, [setSelectedId])

  useEffect(() => {
    if (gameState && sceneRef.current) {
      sceneRef.current.updateFromGameState(gameState)
    }
  }, [gameState])

  useEffect(() => {
    if (localPlayerId && sceneRef.current) {
      sceneRef.current.setLocalPlayerId(localPlayerId)
    }
  }, [localPlayerId])

  useEffect(() => {
    if (!sceneRef.current) return
    const newMsgs = messages.slice(msgLenRef.current)
    msgLenRef.current = messages.length
    for (const msg of newMsgs) {
      if (msg.playerId && msg.playerId !== '__system__') {
        sceneRef.current.showSpeechBubble(msg.playerId, msg.text)
      }
    }
  }, [messages])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' }}
        width={window.innerWidth}
        height={window.innerHeight}
      />
    </div>
  )
}
