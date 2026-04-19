import { useState, useRef, useEffect } from 'react'
import socket from '../socket'
import { useGameStore, GameMode } from '../store/gameStore'
import hackLogo from '../store/hackprincetonlogo.png'

const FONT = "'Press Start 2P', monospace"
const SCAN = 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.055) 3px,rgba(0,0,0,0.055) 4px)'

const SHIP_H = 380

// Nose cone segments — each narrower + shorter, creating tapered pixel-art shape
const NOSE = [
  { w:22, frac:0.88, bg:'linear-gradient(to bottom, #3272b8, #1e4878 40%, #0f2640)' },
  { w:16, frac:0.72, bg:'linear-gradient(to bottom, #265890, #1a3f6e 40%, #0d2040)' },
  { w:12, frac:0.57, bg:'linear-gradient(to bottom, #1e4878, #152e52 40%, #0a1e34)' },
  { w: 9, frac:0.43, bg:'linear-gradient(to bottom, #162840, #102030 40%, #081420)' },
  { w: 6, frac:0.30, bg:'linear-gradient(to bottom, #102030, #0c1826 40%, #060f1a)' },
  { w: 4, frac:0.18, bg:'linear-gradient(to bottom, #0c1826, #08101c 40%, #040c14)' },
  { w: 2, frac:0.09, bg:'linear-gradient(to bottom, #08101e, #050b14 40%, #030609)' },
]

const KF = `
  @keyframes shipFloat {
    0%,100% { transform: translateY(0px); }
    50%     { transform: translateY(-11px); }
  }
  @keyframes exhaustA {
    0%   { transform: scaleX(1.00) scaleY(1.00); opacity: 0.90; }
    18%  { transform: scaleX(1.55) scaleY(0.75); opacity: 0.65; }
    52%  { transform: scaleX(0.65) scaleY(1.20); opacity: 0.97; }
    78%  { transform: scaleX(1.25) scaleY(0.88); opacity: 0.72; }
    100% { transform: scaleX(1.00) scaleY(1.00); opacity: 0.90; }
  }
  @keyframes exhaustB {
    0%   { transform: scaleX(0.85) scaleY(1.15); opacity: 0.72; }
    32%  { transform: scaleX(1.45) scaleY(0.70); opacity: 0.93; }
    68%  { transform: scaleX(0.72) scaleY(1.25); opacity: 0.60; }
    100% { transform: scaleX(0.85) scaleY(1.15); opacity: 0.72; }
  }
  @keyframes exhaustC {
    0%   { transform: scaleX(1.25) scaleY(0.80); opacity: 0.78; }
    42%  { transform: scaleX(0.70) scaleY(1.15); opacity: 0.98; }
    100% { transform: scaleX(1.25) scaleY(0.80); opacity: 0.78; }
  }
  @keyframes bloomPulse {
    0%,100% { opacity: 0.38; transform: scaleY(1.00); }
    50%     { opacity: 0.62; transform: scaleY(1.10); }
  }
  @keyframes portGlow {
    0%,100% { box-shadow: inset 0 0 7px rgba(0,180,255,0.55), 0 0 5px rgba(0,140,200,0.30); }
    50%     { box-shadow: inset 0 0 16px rgba(0,225,255,0.80), 0 0 13px rgba(0,180,255,0.55); }
  }
  @keyframes ledA { 0%,49%{background:#00ff88;box-shadow:0 0 6px #00ff8899} 50%,100%{background:#003318;box-shadow:none} }
  @keyframes ledB { 0%,49%{background:#00ccff;box-shadow:0 0 6px #00ccff99} 50%,100%{background:#001833;box-shadow:none} }
  @keyframes ledC { 0%,49%{background:#ff5533;box-shadow:0 0 6px #ff553399} 50%,100%{background:#330800;box-shadow:none} }
  @keyframes scanBeam {
    0%   { top: 40px;  opacity: 0; }
    4%   { opacity: 0.9; }
    94%  { opacity: 0.9; }
    100% { top: calc(100% - 32px); opacity: 0; }
  }
  @keyframes hullGlow {
    0%,100% { box-shadow: 0 0 45px rgba(0,180,255,0.10), inset 0 0 36px rgba(0,0,55,0.92); }
    50%     { box-shadow: 0 0 80px rgba(0,180,255,0.22), inset 0 0 36px rgba(0,0,55,0.92); }
  }
`

export default function ModeSelector() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [name, setName]         = useState('')
  const [error, setError]       = useState('')
  const [connecting, setConnecting] = useState(false)
  const setConnected    = useGameStore((s) => s.setConnected)
  const setJoined       = useGameStore((s) => s.setJoined)
  const setObserver     = useGameStore((s) => s.setObserver)
  const setSelectedMode = useGameStore((s) => s.setSelectedMode)

  const connect = (fn: () => void) => {
    setConnecting(true); setError('')
    const onConnect = () => { socket.off('connect_error', onError); setConnecting(false); fn() }
    const onError   = () => { socket.off('connect', onConnect); setConnecting(false); setError('CONNECTION FAILED') }
    if (socket.connected) { setConnecting(false); fn() }
    else { socket.once('connect', onConnect); socket.once('connect_error', onError); socket.connect() }
  }

  const joinHuman = () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('CALLSIGN REQUIRED'); return }
    connect(() => {
      setConnected(true)
      socket.emit('game:select_mode', { mode: 'human_vs_ai' as GameMode })
      socket.emit('game:join', { name: trimmed, type: 'human' })
      setSelectedMode('human_vs_ai')
    })
  }

  const watchAI = () => {
    connect(() => {
      setConnected(true)
      socket.emit('game:select_mode', { mode: 'all_ai_observer' as GameMode })
      setSelectedMode('all_ai_observer')
      setObserver(true)
      setJoined('__observer__', 'OBSERVER')
    })
  }

  // ── Canvas: parallax star field + nebula + shooting stars ──────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fit = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    fit()
    window.addEventListener('resize', fit)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    interface S { x:number; y:number; r:number; base:number; ph:number; spd:number; rgb:[number,number,number] }
    const mkLayer = (n:number, rLo:number, rHi:number, sLo:number, sHi:number): S[] =>
      Array.from({length:n}, () => {
        const roll = Math.random()
        const rgb: [number,number,number] =
          roll > 0.88 ? [200,222,255]
          : roll > 0.80 ? [255,245,222]
          : [255,255,255]
        return {
          x:   Math.random() * canvas.width,
          y:   Math.random() * canvas.height,
          r:   rLo + Math.random() * (rHi - rLo),
          base:0.35 + Math.random() * 0.65,
          ph:  Math.random() * Math.PI * 2,
          spd: sLo + Math.random() * (sHi - sLo),
          rgb,
        }
      })

    // Three depth layers: background (slow), mid, foreground (fast)
    const layers = [
      mkLayer(240, 0.45, 1.00, 0.10, 0.30),
      mkLayer(95,  1.00, 1.85, 0.42, 0.82),
      mkLayer(30,  2.20, 3.80, 1.00, 2.10),
    ]

    // Shooting star state
    let sx=0, sy=0, sdx=0, sdy=0, sLife=0, sTimer=0
    const spawnShoot = () => {
      const cW = canvas.width, cH = canvas.height
      sx  = cW * (0.05 + Math.random() * 0.85)
      sy  = cH * (0.03 + Math.random() * 0.30)
      const ang = Math.PI / 9 + (Math.random() - 0.5) * (Math.PI / 14)
      const spd = 600 + Math.random() * 500
      sdx = Math.cos(ang) * spd; sdy = Math.sin(ang) * spd
      sLife = 0.45 + Math.random() * 0.55
      sTimer = sLife + 2 + Math.random() * 5  // delay + flight
    }
    spawnShoot()

    let last = 0, af = 0
    const frame = (ts: number) => {
      const dt = Math.min((ts - last) / 1000, 0.05); last = ts
      const cW = canvas.width, cH = canvas.height

      // Clear with deep space
      ctx.fillStyle = '#020110'
      ctx.fillRect(0, 0, cW, cH)

      // Nebula patches (colored dust clouds)
      const NEBS: [number,number,number,number,number,number][] = [
        [0.16, 0.58, 430, 15,  3,  85],   // purple cluster
        [0.72, 0.28, 330,  0, 20,  80],   // blue nebula
        [0.46, 0.76, 270, 28,  0,  62],   // violet wisp
        [0.84, 0.66, 220,  3, 15,  60],   // teal distant
        [0.30, 0.16, 200,  8,  3,  55],   // purple far
        [0.58, 0.44, 160,  0, 25,  50],   // blue core
        [0.92, 0.40, 140, 20,  0,  45],   // magenta edge
      ]
      for (const [nx,ny,nr,cr,cg,cb] of NEBS) {
        const g = ctx.createRadialGradient(nx*cW, ny*cH, 0, nx*cW, ny*cH, nr)
        g.addColorStop(0,    `rgba(${cr},${cg},${cb},0.22)`)
        g.addColorStop(0.4,  `rgba(${cr},${cg},${cb},0.10)`)
        g.addColorStop(0.75, `rgba(${cr},${cg},${cb},0.03)`)
        g.addColorStop(1,    'rgba(0,0,0,0)')
        ctx.fillStyle = g; ctx.fillRect(0, 0, cW, cH)
      }

      // Stars
      for (const layer of layers) {
        for (const s of layer) {
          s.x -= s.spd * (dt / 0.016)
          if (s.x < -s.r * 5) { s.x = cW + s.r; s.y = Math.random() * cH }
          s.ph += dt * (0.9 + s.spd * 0.35)
          const alpha = s.base * (0.68 + 0.32 * Math.sin(s.ph))
          const [cr,cg,cb] = s.rgb

          ctx.beginPath()
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`
          ctx.fill()

          // Diffraction cross on bright large stars
          if (s.r > 2.5 && alpha > 0.5) {
            const sl = s.r * 5.5, sa = alpha * 0.42
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},${sa})`
            ctx.lineWidth = 0.55
            ctx.beginPath(); ctx.moveTo(s.x-sl, s.y); ctx.lineTo(s.x+sl, s.y); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(s.x, s.y-sl); ctx.lineTo(s.x, s.y+sl); ctx.stroke()
          }
        }
      }

      // Shooting star
      sTimer -= dt
      if (sTimer <= -sLife) spawnShoot()
      if (sTimer <= 0 && sTimer > -sLife) {
        const progress = -sTimer / sLife
        const tailLen  = 90 + progress * 110
        const alpha    = Math.min(1, (sLife + sTimer) * 8) * (1 - progress * 0.45)
        const ang      = Math.atan2(sdy, sdx)
        const ex = sx - Math.cos(ang) * tailLen, ey = sy - Math.sin(ang) * tailLen
        const g  = ctx.createLinearGradient(sx, sy, ex, ey)
        g.addColorStop(0,    `rgba(255,255,255,${alpha})`)
        g.addColorStop(0.2,  `rgba(210,228,255,${alpha * 0.80})`)
        g.addColorStop(0.6,  `rgba(140,170,255,${alpha * 0.35})`)
        g.addColorStop(1,    'rgba(60,80,200,0)')
        ctx.strokeStyle = g; ctx.lineWidth = 2.0
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke()
        // Glow at head
        const hg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 6)
        hg.addColorStop(0, `rgba(255,255,255,${alpha})`)
        hg.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI*2); ctx.fill()
        sx += sdx * dt; sy += sdy * dt
      }

      af = requestAnimationFrame(frame)
    }
    af = requestAnimationFrame(frame)
    return () => { window.removeEventListener('resize', fit); cancelAnimationFrame(af) }
  }, [])

  // Exhaust animation names per nozzle
  const EXHAUST = ['exhaustA', 'exhaustB', 'exhaustC'] as const

  return (
    <div style={{ position:'fixed', inset:0, overflow:'hidden', fontFamily:FONT, zIndex:200 }}>
      <style>{KF}</style>

      {/* Live star field canvas */}
      <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', display:'block' }} />

      {/* Centered ship + logo container */}
      <div style={{ position:'absolute', inset:0, zIndex:2, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:28, transform:'scale(0.78)', transformOrigin:'center center' }}>

          {/* HackPrinceton logo */}
          <img src={hackLogo} alt="HackPrinceton" style={{
            width: 320, objectFit:'contain',
            filter:'drop-shadow(0 0 18px rgba(0,229,255,0.45)) drop-shadow(0 0 40px rgba(0,180,255,0.18))',
            imageRendering:'pixelated',
          }} />

        <div style={{ animation:'shipFloat 5.5s ease-in-out infinite', display:'flex', alignItems:'center', position:'relative' }}>

          {/* Engine exhaust bloom glow (soft atmospheric light cast leftward) */}
          <div style={{
            position:'absolute', left:-115, top:'10%', bottom:'10%', width:200,
            background:'radial-gradient(ellipse at right center, rgba(60,80,255,0.42) 0%, rgba(140,55,255,0.18) 40%, transparent 72%)',
            filter:'blur(20px)',
            animation:'bloomPulse 1.9s ease-in-out infinite',
            pointerEvents:'none', zIndex:-1,
          }}/>

          {/* ── Engine module ────────────────────────────────────────────── */}
          <div style={{
            width:92, height:SHIP_H, flexShrink:0,
            background:'linear-gradient(to right, #0a1322 0%, #111a30 50%, #192c4a 100%)',
            borderTop:'3px solid #265890', borderBottom:'3px solid #265890', borderLeft:'3px solid #1a3f6e',
            position:'relative', overflow:'visible', zIndex:3,
          }}>
            {/* Hull sheen top/bottom */}
            <div style={{ position:'absolute', top:0, left:0, right:0, height:4, background:'linear-gradient(to right,#265890,#3272b8,#265890)', opacity:0.9 }}/>
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:4, background:'linear-gradient(to right,#1a3f6e,#265890,#1a3f6e)', opacity:0.9 }}/>
            {/* Vertical spine */}
            <div style={{ position:'absolute', right:9, top:'5%', bottom:'5%', width:5, background:'linear-gradient(to bottom,#0c1c36,#1e4878 22%,#3272b8 50%,#1e4878 78%,#0c1c36)', opacity:0.95 }}/>
            {/* Horizontal panel seam */}
            <div style={{ position:'absolute', left:0, right:0, top:'50%', height:1, background:'rgba(38,88,144,0.5)' }}/>
            {/* Rivets */}
            {[0.13, 0.50, 0.87].map((f,i) => (
              <div key={i} style={{ position:'absolute', left:10, top:`calc(${f*100}% - 4px)`, width:8, height:8, borderRadius:'50%', background:'#1e4878', border:'1px solid #3a72a8', boxShadow:'0 0 4px #3272b844' }}/>
            ))}
            {/* Small status light */}
            <div style={{ position:'absolute', left:10, top:'50%', marginTop:-4, width:4, height:4, borderRadius:'50%', background:'#00ff88', boxShadow:'0 0 6px #00ff8899', animation:'ledA 2.1s steps(1) infinite' }}/>

            {/* Three nozzle bays with exhaust */}
            {[0.22, 0.50, 0.78].map((frac, ni) => (
              <div key={ni} style={{
                position:'absolute', left:20, right:10, height:30,
                top:`calc(${frac * 100}% - 15px)`,
                background:'#05090f', border:'2px solid #1e4878',
                boxShadow:'inset 0 0 12px rgba(51,68,238,0.6), inset 0 0 4px rgba(100,120,255,0.4)',
                overflow:'visible',
              }}>
                {/* Inner hot ring */}
                <div style={{ position:'absolute', left:0, top:'15%', width:9, height:'70%', background:'linear-gradient(to right,#6677ff,#2233cc,#1122aa)', boxShadow:'0 0 10px #3344ee, 0 0 3px #ffffff55' }}/>
                {/* Nozzle ring detail */}
                <div style={{ position:'absolute', right:0, top:0, bottom:0, width:6, background:'#1a3060', borderLeft:'1px solid #265890' }}/>

                {/* Exhaust outer bloom */}
                <div style={{
                  position:'absolute', right:'100%', top:'-40%', width:140, height:'180%',
                  background:`linear-gradient(to left, rgba(${ni===1?'140,55,255':'51,68,238'},0.20) 0%, rgba(${ni===1?'110,35,220':'28,44,180'},0.08) 55%, transparent 100%)`,
                  filter:'blur(9px)', transformOrigin:'right center',
                  animation:`${EXHAUST[ni]} ${0.55 + ni * 0.27}s ease-in-out infinite`,
                  pointerEvents:'none',
                }}/>
                {/* Exhaust mid */}
                <div style={{
                  position:'absolute', right:'100%', top:'8%', width:95, height:'84%',
                  background:`linear-gradient(to left, rgba(85,105,255,0.80), rgba(${ni===1?'165,55,255':'48,58,215'},0.48), transparent)`,
                  transformOrigin:'right center',
                  animation:`${EXHAUST[ni]} ${0.55 + ni * 0.27}s ease-in-out infinite`,
                  pointerEvents:'none',
                }}/>
                {/* Exhaust bright core */}
                <div style={{
                  position:'absolute', right:'100%', top:'28%', width:52, height:'44%',
                  background:'linear-gradient(to left, rgba(210,220,255,0.98), rgba(160,180,255,0.65), transparent)',
                  transformOrigin:'right center',
                  animation:`${EXHAUST[ni]} ${0.55 + ni * 0.27}s ease-in-out infinite`,
                  pointerEvents:'none',
                }}/>
              </div>
            ))}
          </div>

          {/* ── Main hull body ───────────────────────────────────────────── */}
          <div style={{
            width:462, height:SHIP_H, flexShrink:0, position:'relative',
            background:'rgba(4,5,22,0.97)',
            borderTop:'3px solid #265890', borderBottom:'3px solid #265890',
            overflow:'hidden', zIndex:4,
            animation:'hullGlow 4.5s ease-in-out infinite',
          }}>
            {/* Scan overlay */}
            <div style={{ position:'absolute', inset:0, backgroundImage:SCAN, pointerEvents:'none', zIndex:10 }}/>
            {/* Moving horizontal scan beam */}
            <div style={{ position:'absolute', left:0, right:0, height:2, background:'linear-gradient(to right,transparent,rgba(0,210,255,0.13),transparent)', animation:'scanBeam 4.2s linear infinite', zIndex:11, pointerEvents:'none' }}/>

            {/* Top deck — hull plating + portholes */}
            <div style={{ position:'absolute', top:0, left:0, right:0, height:40, background:'linear-gradient(to bottom,#1b3d64,#0f2140)', borderBottom:'2px solid #265890', zIndex:6 }}>
              <div style={{ position:'absolute', left:14, top:7, fontSize:4, color:'#2e5a8a', letterSpacing:3, fontFamily:FONT, whiteSpace:'nowrap' }}>
                HAIL MARY PROTOCOL — CLASS-IV COLONY RUNNER — O₂ SYS NOMINAL
              </div>
              {/* 5 portholes */}
              <div style={{ position:'absolute', bottom:7, left:0, right:0, display:'flex', justifyContent:'space-evenly', padding:'0 28px' }}>
                {[1.4, 1.9, 2.6, 1.7, 2.2].map((dur, pi) => (
                  <div key={pi} style={{
                    width:18, height:18, borderRadius:'50%',
                    background:'radial-gradient(circle at 32% 30%, #00ddff 0%, #0077cc 40%, #001a38 100%)',
                    border:'2px solid #2a5888',
                    animation:`portGlow ${dur}s ease-in-out infinite`,
                  }}/>
                ))}
              </div>
              {/* Hull rivet strip */}
              <div style={{ position:'absolute', top:2, left:0, right:0, height:2, background:'repeating-linear-gradient(to right, transparent 0, transparent 30px, rgba(50,114,184,0.5) 30px, rgba(50,114,184,0.5) 32px)' }}/>
            </div>

            {/* Bottom deck */}
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:30, background:'linear-gradient(to top,#1b3d64,#0f2140)', borderTop:'2px solid #265890', zIndex:6 }}>
              {[0.17,0.34,0.51,0.68,0.85].map((p,i) => (
                <div key={i} style={{ position:'absolute', left:`${p*100}%`, top:4, bottom:4, width:1, background:'rgba(38,88,144,0.45)' }}/>
              ))}
              <div style={{ position:'absolute', right:14, bottom:7, fontSize:4, color:'#2e5a8a', letterSpacing:3, fontFamily:FONT, whiteSpace:'nowrap' }}>
                ALIGNMENT-CORE ENGAGED — AI CREW ABOARD
              </div>
              {/* Bottom rivet strip */}
              <div style={{ position:'absolute', bottom:2, left:0, right:0, height:2, background:'repeating-linear-gradient(to right, transparent 0, transparent 30px, rgba(50,114,184,0.5) 30px, rgba(50,114,184,0.5) 32px)' }}/>
            </div>

            {/* Left side LEDs */}
            <div style={{ position:'absolute', left:5, top:46, bottom:34, width:4, display:'flex', flexDirection:'column', justifyContent:'space-around', alignItems:'center', zIndex:7 }}>
              {(['ledA','ledB','ledC','ledB'] as const).map((a,i) => (
                <div key={i} style={{ width:4, height:4, borderRadius:1, animation:`${a} ${1.3+i*0.38}s steps(1) infinite` }}/>
              ))}
            </div>
            {/* Right side LEDs */}
            <div style={{ position:'absolute', right:5, top:46, bottom:34, width:4, display:'flex', flexDirection:'column', justifyContent:'space-around', alignItems:'center', zIndex:7 }}>
              {(['ledC','ledA','ledB','ledA'] as const).map((a,i) => (
                <div key={i} style={{ width:4, height:4, borderRadius:1, animation:`${a} ${1.6+i*0.42}s steps(1) infinite` }}/>
              ))}
            </div>

            {/* Vertical panel seam */}
            <div style={{ position:'absolute', left:'50%', top:42, bottom:32, width:1, background:'rgba(26,63,110,0.3)', zIndex:5 }}/>

            {/* ── Dialog content ── */}
            <div style={{
              position:'absolute', left:0, right:0, top:42, bottom:32,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              padding:'14px 46px', textAlign:'center',
            }}>
              <div style={{fontSize:6, color:'#1e3c6e', letterSpacing:3, marginBottom:12}}>// MISSION SELECT //</div>
              <div style={{fontSize:20, color:'#00e5ff', letterSpacing:2, marginBottom:6, textShadow:'0 0 32px rgba(0,229,255,0.88), 0 0 70px rgba(0,229,255,0.38)'}}>
                HAIL MARY
              </div>
              <div style={{fontSize:10, color:'#334455', letterSpacing:4, marginBottom:7}}>PROTOCOL</div>
              <div style={{fontSize:6, color:'#ff4444', letterSpacing:1, marginBottom:22}}>OXYGEN SCARCITY // AI ALIGNMENT</div>

              {/* Human mode */}
              <div style={{width:'100%', marginBottom:15, paddingBottom:15, borderBottom:'1px solid #0d1e2e'}}>
                <div style={{fontSize:7, color:'#00e5ff', letterSpacing:2, marginBottom:10}}>[ PLAY AS CREW ]</div>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && joinHuman()}
                  placeholder=">_ ENTER CALLSIGN" maxLength={20} autoFocus
                  style={{
                    width:'100%', background:'rgba(0,229,255,0.04)', border:'2px solid rgba(0,229,255,0.35)',
                    color:'#99ddee', padding:'10px 12px', fontSize:8, outline:'none',
                    fontFamily:FONT, textAlign:'center', letterSpacing:1, marginBottom:8,
                  }}
                />
                <button onClick={joinHuman} disabled={connecting} style={{
                  width:'100%', background:'rgba(0,229,255,0.08)', border:'2px solid #00e5ff',
                  color:'#00e5ff', padding:'11px', fontSize:7, cursor: connecting ? 'not-allowed' : 'pointer',
                  fontFamily:FONT, letterSpacing:2, textShadow:'0 0 14px rgba(0,229,255,0.88)',
                }}>
                  [ JOIN AS CREW — HUMAN VS AI ]
                </button>
              </div>

              {/* Observer mode */}
              <div style={{width:'100%'}}>
                <div style={{fontSize:7, color:'#cc88ff', letterSpacing:2, marginBottom:10}}>[ RESEARCH OBSERVER ]</div>
                <button onClick={watchAI} disabled={connecting} style={{
                  width:'100%', background:'rgba(180,100,255,0.08)', border:'2px solid #cc88ff',
                  color:'#cc88ff', padding:'11px', fontSize:7, cursor: connecting ? 'not-allowed' : 'pointer',
                  fontFamily:FONT, letterSpacing:2,
                }}>
                  [ WATCH ALL-AI EXPERIMENT ]
                </button>
                <div style={{fontSize:5, color:'#334455', marginTop:7}}>Full metrics · Discriminator outputs · Agent dashboards</div>
              </div>

              {error      && <div style={{fontSize:7, color:'#ff3333', marginTop:11}}>[ERR] {error}</div>}
              {connecting && <div style={{fontSize:7, color:'#556677', marginTop:8}}>// CONNECTING...</div>}
            </div>
          </div>

          {/* ── Nose cone (7 pixel-art segments, each narrower + shorter) ── */}
          <div style={{ display:'flex', alignItems:'center', zIndex:3, flexShrink:0 }}>
            {NOSE.map((seg, i) => (
              <div key={i} style={{
                width: seg.w,
                height: Math.round(SHIP_H * seg.frac),
                background: seg.bg,
                borderTop:    i === 0 ? '3px solid #265890' : '1px solid rgba(50,114,184,0.35)',
                borderBottom: i === 0 ? '3px solid #265890' : '1px solid rgba(50,114,184,0.35)',
                flexShrink: 0,
              }}/>
            ))}
            {/* Glowing tip */}
            <div style={{
              width:6, height:18,
              background:'radial-gradient(ellipse at center, #33bbff 0%, rgba(0,130,220,0.5) 55%, transparent 100%)',
              filter:'blur(3px)', marginLeft:-3, flexShrink:0,
            }}/>
          </div>

        </div>{/* /shipFloat */}
        </div>{/* /column group */}
      </div>
    </div>
  )
}
