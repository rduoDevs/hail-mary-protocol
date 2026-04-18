import { useEffect, useRef } from 'react'
import { ShipScene } from './ShipScene'
import { useGameStore } from '../store/gameStore'

export default function ShipSceneCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ShipScene | null>(null)
  const gameState = useGameStore((s) => s.gameState)

  useEffect(() => {
    const canvas = canvasRef.current
    const labelContainer = labelRef.current
    if (!canvas || !labelContainer) return

    const scene = new ShipScene(canvas, labelContainer)
    sceneRef.current = scene
    scene.animate()

    const handleResize = () => {
      scene.resize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  // Update Three.js scene when game state changes
  useEffect(() => {
    if (gameState && sceneRef.current) {
      sceneRef.current.updateFromGameState(gameState)
    }
  }, [gameState])

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        width={window.innerWidth}
        height={window.innerHeight}
      />
      {/* Label overlay for Three.js player labels */}
      <div
        ref={labelRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      />
    </div>
  )
}
