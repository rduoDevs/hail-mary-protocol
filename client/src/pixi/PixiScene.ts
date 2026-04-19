import * as PIXI from 'pixi.js'
import type { GameState } from '../store/gameStore'

const WORLD_W   = 2600
const HULL_T    = 20
const SPEED     = 200
const GRAVITY   = 900   // px/s²
const JUMP_VEL  = -460  // px/s (negative = up in screen space)

const C = {
  BG:         0x0b0a1e,
  HULL:       0x1a3f6e,
  HULL_MID:   0x265890,
  HULL_LIGHT: 0x3272b8,
  INTERIOR:   0x0c1a30,
  FLOOR:      0x142540,
  FLOOR_LINE: 0x1e3a60,
  CEILING:    0x0a1525,
  PIPE:       0x1e4870,
  PIPE_JOINT: 0x2e689a,
  ENGINE_CORE:0x3344ee,
  ENG_HOT:    0xaa44ff,
  PANEL:      0x0e3020,
  PANEL_LIT:  0x1e5035,
  RIVET:      0x3a5575,
  WIN_FRAME:  0x2a5888,
  WIN_GLASS:  0x091828,
  CYAN:       0x00ffff,
  RED:        0xff2244,
  GOLD:       0xffdd00,
  GREEN:      0x44ff88,
  AMBER:      0xffaa00,
  PURPLE:     0xdd88ff,
  BLACK:      0x000000,
}

// Per-slot vibrant pixel-art colors
const CREW_COLORS = [
  0x00ffff,  // cyan
  0xff44aa,  // pink
  0x44ff88,  // green
  0xffdd22,  // yellow
  0xff8844,  // orange
  0xaa66ff,  // purple
]

interface Star { g: PIXI.Graphics; spd: number; W: number; H: number }

interface Footprint { x: number; floorY: number; alpha: number }

interface PlayerNode {
  gfx:      PIXI.Graphics
  label:    PIXI.Text
  outline:  PIXI.Graphics
  baseX:    number
  baseY:    number
  targetX:  number
  targetY:  number
  idlePhase:number
  playerId: string
  isAI:     boolean
  wanderTimer: number
  // walk/jump state
  color:         number
  alive:         boolean
  walkPhase:     number
  lastFootstepX: number
  velocityY:     number
  onGround:      boolean
}

interface Bubble { gfx: PIXI.Container; ttl: number; node: PlayerNode }

export class PixiScene {
  app: PIXI.Application

  private world:        PIXI.Container
  private stars:        Star[]
  private playerNodes:  PlayerNode[]
  private engineGfx:    PIXI.Graphics
  private statusGfx:    PIXI.Graphics
  private screenGfx:    PIXI.Graphics
  private dangerGfx:    PIXI.Graphics
  private footprintGfx: PIXI.Graphics
  private footprints:   Footprint[] = []
  private bubbleContainer: PIXI.Container
  private bubbles:      Bubble[] = []

  private sx: number; private sy: number
  private sw: number; private sh: number
  private ix: number; private iy: number
  private iw: number; private ih: number
  private engW:    number; private bridgeW: number
  private floorY:  number
  private engCoreX:number; private engCoreY:number; private engCoreH:number
  private nozzleY1:number; private nozzleY2:number
  private bridgeX: number
  private crewLeft:number; private crewRight:number
  private crewTop: number; private crewBottom:number

  private inDanger = false
  private W: number; private H: number
  private localPlayerId: string | null = null
  private keys = new Set<string>()
  private jumpQueued = false

  private hoveredPlayerId: string | null = null
  private onAgentClick: ((playerId: string) => void) | null = null

  private readonly onKD = (e: KeyboardEvent) => {
    const k = e.key === ' ' ? 'space' : e.key.toLowerCase()
    if (!['w','a','s','d','space'].includes(k)) return
    const active = document.activeElement
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return
    e.preventDefault()
    if (k === 'space' && !this.keys.has('space')) this.jumpQueued = true
    this.keys.add(k)
  }
  private readonly onKU = (e: KeyboardEvent) => {
    const k = e.key === ' ' ? 'space' : e.key.toLowerCase()
    this.keys.delete(k)
  }

  constructor(canvas: HTMLCanvasElement, onAgentClick?: (id: string) => void) {
    this.W = window.innerWidth
    this.H = window.innerHeight
    this.onAgentClick = onAgentClick ?? null

    this.app = new PIXI.Application({
      view:            canvas,
      width:           this.W,
      height:          this.H,
      backgroundColor: C.BG,
      antialias:       false,
      resolution:      1,
    })

    this.world           = new PIXI.Container()
    this.engineGfx       = new PIXI.Graphics()
    this.statusGfx       = new PIXI.Graphics()
    this.screenGfx       = new PIXI.Graphics()
    this.dangerGfx       = new PIXI.Graphics()
    this.footprintGfx    = new PIXI.Graphics()
    this.bubbleContainer = new PIXI.Container()
    this.stars           = []
    this.playerNodes     = []

    this.sw    = WORLD_W - 200
    this.sh    = Math.min(this.H * 0.62, 430)
    this.sx    = 100
    this.sy    = (this.H - this.sh) / 2
    this.ix    = this.sx + HULL_T
    this.iy    = this.sy + HULL_T
    this.iw    = this.sw - HULL_T * 2
    this.ih    = this.sh - HULL_T * 2
    this.engW    = Math.floor(this.iw * 0.15)
    this.bridgeW = Math.floor(this.iw * 0.15)
    this.floorY  = this.iy + Math.floor(this.ih * 0.76)
    this.engCoreX= this.ix + Math.floor(this.engW * 0.32)
    this.engCoreY= this.iy + 26
    this.engCoreH= this.floorY - this.engCoreY
    this.nozzleY1= this.sy + Math.floor(this.sh * 0.30)
    this.nozzleY2= this.sy + Math.floor(this.sh * 0.62)
    this.bridgeX = this.ix + this.iw - this.bridgeW
    this.crewLeft  = this.ix + this.engW + 8
    this.crewRight = this.bridgeX - 8
    this.crewTop   = this.iy + 24
    this.crewBottom= this.floorY - 14

    this.buildNebula()
    this.buildStars()
    this.buildGrid()
    this.buildShipExterior()
    this.buildShipInterior()
    this.world.addChild(this.engineGfx)
    this.world.addChild(this.footprintGfx)
    this.buildPlayerNodes()
    this.world.addChild(this.statusGfx)
    this.world.addChild(this.screenGfx)
    this.world.addChild(this.bubbleContainer)
    this.app.stage.addChild(this.world)
    this.app.stage.addChild(this.dangerGfx)

    const initNode = this.playerNodes[0]
    if (initNode) {
      this.world.x = Math.max(this.W - WORLD_W, Math.min(0, this.W / 2 - initNode.gfx.x))
    }

    window.addEventListener('keydown', this.onKD)
    window.addEventListener('keyup',   this.onKU)
    this.app.ticker.add(() => this.tick())
  }

  setLocalPlayerId(id: string) {
    this.localPlayerId = id
    const node = this.playerNodes.find(n => n.playerId === id)
    if (node) {
      node.gfx.x = (this.crewLeft + this.crewRight) / 2
      node.gfx.y = this.crewBottom
      node.velocityY = 0
      node.onGround  = true
    }
  }

  setOnAgentClick(fn: (id: string) => void) { this.onAgentClick = fn }

  private buildNebula() {
    const { W, H } = this
    const g = new PIXI.Graphics()
    const patches: [number,number,number,number][] = [
      [W*0.12, H*0.28, 220, 0x001144],
      [W*0.88, H*0.68, 170, 0x110022],
      [W*0.50, H*0.50, 140, 0x00001e],
      [W*0.65, H*0.15, 110, 0x002211],
    ]
    for (const [nx,ny,r,nc] of patches) {
      for (let s = r; s > 0; s -= 12) {
        g.beginFill(nc, (1 - s/r) * 0.11)
        g.drawRect(nx-s, ny-s*0.6, s*2, s*1.2)
        g.endFill()
      }
    }
    this.app.stage.addChild(g)
  }

  private buildStars() {
    const { W, H } = this
    const layers = [
      { count:260, size:1, spdMin:0.25, spdMax:0.65, alpha:0.30 },
      { count:90,  size:2, spdMin:0.80, spdMax:1.60, alpha:0.55 },
      { count:24,  size:3, spdMin:2.00, spdMax:3.60, alpha:0.82 },
    ]
    const container = new PIXI.Container()
    for (const { count, size, spdMin, spdMax, alpha } of layers) {
      for (let i = 0; i < count; i++) {
        const g = new PIXI.Graphics()
        g.beginFill(0xffffff, alpha * (0.55 + Math.random() * 0.45))
        g.drawRect(0, 0, size, size)
        g.endFill()
        g.x = Math.random() * W
        g.y = Math.random() * H
        const spd = spdMin + Math.random() * (spdMax - spdMin)
        container.addChild(g)
        this.stars.push({ g, spd, W, H })
      }
    }
    this.app.stage.addChild(container)
  }

  private buildGrid() {
    const { H } = this
    const g = new PIXI.Graphics()
    const gs = 16
    g.lineStyle(1, 0x1a3a6a, 0.10)
    for (let x = 0; x <= WORLD_W; x += gs)   { g.moveTo(x,0); g.lineTo(x,H) }
    for (let y = 0; y <= H; y += gs)          { g.moveTo(0,y); g.lineTo(WORLD_W,y) }
    g.lineStyle(1, 0x2a5aaa, 0.18)
    for (let x = 0; x <= WORLD_W; x += gs*8) { g.moveTo(x,0); g.lineTo(x,H) }
    for (let y = 0; y <= H; y += gs*8)        { g.moveTo(0,y); g.lineTo(WORLD_W,y) }
    this.world.addChild(g)
  }

  private buildShipExterior() {
    const { sx, sy, sw, sh } = this
    const g = new PIXI.Graphics()
    g.beginFill(C.HULL)
    g.drawRect(sx, sy, sw, sh)
    g.endFill()

    const noseSegs = [
      { w:16, h:sh*0.78 }, { w:12, h:sh*0.60 }, { w:9, h:sh*0.44 },
      { w:7,  h:sh*0.28 }, { w:5,  h:sh*0.14 },
    ]
    let nx = sx + sw
    for (const seg of noseSegs) {
      g.beginFill(C.HULL_MID)
      g.drawRect(nx, sy + (sh - seg.h)/2, seg.w, seg.h)
      g.endFill()
      nx += seg.w
    }
    g.beginFill(C.HULL_LIGHT)
    g.drawRect(sx+sw, sy+sh*0.36, 6, sh*0.28)
    g.endFill()

    const nozzleW=22; const nozzleH=30
    for (const ny of [this.nozzleY1, this.nozzleY2]) {
      g.beginFill(C.HULL_MID)
      g.drawRect(sx-nozzleW, ny-nozzleH/2, nozzleW, nozzleH)
      g.endFill()
      g.beginFill(0x020610)
      g.drawRect(sx-nozzleW+4, ny-nozzleH/2+4, nozzleW-8, nozzleH-8)
      g.endFill()
    }
    g.lineStyle(1, C.HULL_LIGHT, 0.25)
    g.moveTo(sx, sy+8);       g.lineTo(sx+sw, sy+8)
    g.moveTo(sx, sy+sh-8);    g.lineTo(sx+sw, sy+sh-8)
    g.lineStyle(0)
    this.world.addChild(g)
  }

  private buildShipInterior() {
    const { ix, iy, iw, ih, engW, bridgeW, floorY, bridgeX } = this
    const g = new PIXI.Graphics()
    const floorH = (this.iy + this.ih) - floorY

    g.beginFill(C.INTERIOR); g.drawRect(ix, iy, iw, ih); g.endFill()

    // Portholes top
    {
      const pW=56; const pY=this.sy; const pH=HULL_T
      const positions = [0.12,0.28,0.50,0.72,0.88].map(t => this.sx + this.sw*t - pW/2)
      const allX = [this.sx, ...positions.flatMap(p=>[p,p+pW]), this.sx+this.sw]
      for (let i=0; i<allX.length-1; i+=2) {
        g.beginFill(C.HULL); g.drawRect(allX[i],pY,allX[i+1]-allX[i],pH); g.endFill()
      }
      for (const px of positions) {
        g.beginFill(C.WIN_FRAME); g.drawRect(px-3,pY,pW+6,pH+4); g.endFill()
        g.beginFill(C.WIN_GLASS,0.72); g.drawRect(px,pY,pW,pH); g.endFill()
        g.beginFill(0x224466,0.45); g.drawRect(px+2,pY+2,pW-4,3); g.endFill()
      }
    }
    // Ceiling
    g.beginFill(C.CEILING); g.drawRect(ix,iy,iw,Math.floor(ih*0.07)); g.endFill()
    const ceilH=Math.floor(ih*0.07)
    g.beginFill(C.PIPE); g.drawRect(ix,iy+ceilH+1,iw,5); g.endFill()
    g.beginFill(C.PIPE_JOINT)
    for (let px=ix+50; px<ix+iw; px+=80) g.drawRect(px-3,iy+ceilH-1,10,9)
    g.endFill()
    g.beginFill(0x06101e); g.drawRect(ix+iw*0.05,iy+ceilH+17,iw*0.90,7); g.endFill()

    // Floor
    g.beginFill(C.FLOOR); g.drawRect(ix,floorY,iw,floorH); g.endFill()
    g.beginFill(C.FLOOR_LINE)
    for (let fx=ix+2; fx<ix+iw; fx+=38) g.drawRect(fx,floorY,2,floorH)
    g.endFill()
    g.beginFill(C.PIPE_JOINT); g.drawRect(ix,floorY,iw,2); g.endFill()

    // Engine
    g.beginFill(C.HULL_MID); g.drawRect(ix,iy,engW,ih); g.endFill()

    // Bridge
    g.beginFill(C.HULL_MID); g.drawRect(bridgeX,iy,this.bridgeW,ih); g.endFill()
    const screenW=this.bridgeW-10
    for (const sy2 of [iy+14, iy+46, iy+78]) {
      g.beginFill(0x010508); g.drawRect(bridgeX+5,sy2,screenW,26); g.endFill()
    }
    g.lineStyle(1, C.HULL, 0.9)
    g.moveTo(ix+engW,iy); g.lineTo(ix+engW,iy+ih)
    g.moveTo(bridgeX,iy); g.lineTo(bridgeX,iy+ih)
    g.lineStyle(0)
    this.world.addChild(g)
  }

  private buildPlayerNodes() {
    const { crewLeft, crewRight, crewBottom } = this
    const crewW = crewRight - crewLeft
    const container = new PIXI.Container()

    for (let i = 0; i < 4; i++) {
      const t  = (i + 0.5) / 4
      const bx = crewLeft + t * crewW
      const by = crewBottom

      const outline = new PIXI.Graphics()
      outline.x = bx; outline.y = by
      outline.visible = false
      container.addChild(outline)

      const gfx = new PIXI.Graphics()
      gfx.x = bx; gfx.y = by
      gfx.interactive = true
      gfx.cursor = 'pointer'
      this.drawCrew(gfx, CREW_COLORS[i % CREW_COLORS.length], true, false, false, 0)
      container.addChild(gfx)

      const label = new PIXI.Text('CREW', {
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 6,
        fill: C.CYAN,
        align: 'center',
      })
      label.anchor.set(0.5, 1)
      label.x = bx; label.y = by - 55
      container.addChild(label)

      const node: PlayerNode = {
        gfx, label, outline,
        baseX: bx, baseY: by,
        targetX: bx, targetY: by,
        idlePhase: Math.random() * Math.PI * 2,
        playerId: `slot_${i}`,
        isAI: true,
        wanderTimer: Math.random() * 3,
        color: CREW_COLORS[i % CREW_COLORS.length],
        alive: true,
        walkPhase: 0,
        lastFootstepX: bx,
        velocityY: 0,
        onGround: true,
      }
      this.playerNodes.push(node)

      gfx.on('pointerover', () => {
        this.hoveredPlayerId = node.playerId
        outline.visible = true
        label.style.fontSize = 7
        label.style.fill = 0xffffff
      })
      gfx.on('pointerout', () => {
        if (this.hoveredPlayerId === node.playerId) this.hoveredPlayerId = null
        outline.visible = false
        label.style.fontSize = 6
      })
      gfx.on('pointertap', () => {
        if (node.playerId && !node.playerId.startsWith('slot_') && this.onAgentClick) {
          this.onAgentClick(node.playerId)
        }
      })
    }
    this.world.addChild(container)
  }

  private shade(color: number, f: number): number {
    const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * f))
    const g = Math.min(255, Math.floor(((color >> 8)  & 0xff) * f))
    const b = Math.min(255, Math.floor( (color        & 0xff) * f))
    return (r << 16) | (g << 8) | b
  }

  // legPhase: 0 = idle, 0-1 cycling = walk animation
  private drawCrew(g: PIXI.Graphics, color: number, alive: boolean, isAi: boolean, isLocal: boolean, legPhase = 0) {
    g.clear()
    if (!alive) {
      g.lineStyle(2, 0x334455, 0.7)
      g.moveTo(-8,-20); g.lineTo(8,8)
      g.moveTo(8,-20);  g.lineTo(-8,8)
      g.lineStyle(1, 0x223344, 0.4)
      g.drawRect(-9,-21,18,30)
      g.lineStyle(0)
      return
    }

    const hi  = this.shade(color, 1.45)
    const mid = color
    const dk  = this.shade(color, 0.55)
    const dkk = this.shade(color, 0.30)

    // Walk animation: legs swing alternately
    const lLeg = legPhase > 0 ? Math.sin(legPhase * Math.PI * 2) * 5 : 0
    const rLeg = legPhase > 0 ? Math.sin(legPhase * Math.PI * 2 + Math.PI) * 5 : 0
    const lArm = legPhase > 0 ? Math.sin(legPhase * Math.PI * 2 + Math.PI) * 3 : 0
    const rArm = legPhase > 0 ? Math.sin(legPhase * Math.PI * 2) * 3 : 0

    // AI antenna
    if (isAi) {
      g.beginFill(dkk);    g.drawRect(-1,-38,3,12); g.endFill()
      g.beginFill(0xff3333);g.drawRect(-2,-40,5,4); g.endFill()
      g.beginFill(0xff8888);g.drawRect(-1,-40,3,2); g.endFill()
    }

    // ── Helmet ──────────────────────────────────────────────────────────
    g.beginFill(hi);  g.drawRect(-6,-28,12,2); g.endFill()
    g.beginFill(mid); g.drawRect(-6,-26,12,10); g.endFill()
    g.beginFill(dk);  g.drawRect(-6,-26,2,10); g.endFill()
    g.beginFill(dkk); g.drawRect(4,-26,2,10);  g.endFill()
    g.beginFill(dkk); g.drawRect(-6,-17,12,1); g.endFill()

    // ── Visor ────────────────────────────────────────────────────────────
    const visorBase = isAi ? 0xcc0000 : 0x003355
    const visorHi   = isAi ? 0xff6644 : 0x0088cc
    g.beginFill(visorBase);         g.drawRect(-4,-24,8,6);  g.endFill()
    g.beginFill(visorHi, 0.6);      g.drawRect(-4,-24,8,2);  g.endFill()
    g.beginFill(0xffffff, 0.18);    g.drawRect(-4,-24,3,2);  g.endFill()

    // ── Neck connector ───────────────────────────────────────────────────
    g.beginFill(dk);  g.drawRect(-3,-16,6,3); g.endFill()

    // ── Torso ────────────────────────────────────────────────────────────
    g.beginFill(hi);  g.drawRect(-7,-13,14,2);  g.endFill()
    g.beginFill(mid); g.drawRect(-7,-11,14,18); g.endFill()
    g.beginFill(dk);  g.drawRect(-7,-11,2,18);  g.endFill()
    g.beginFill(dkk); g.drawRect(5,-11,2,18);   g.endFill()
    g.beginFill(dkk); g.drawRect(-7,6,14,2);    g.endFill()

    g.beginFill(dkk);         g.drawRect(-3,-9,8,8);  g.endFill()
    g.beginFill(0x000a18,0.8);g.drawRect(-2,-8,6,6);  g.endFill()
    g.beginFill(isAi ? 0xff2200 : 0x00ff88); g.drawRect(-1,-7,2,2); g.endFill()
    g.beginFill(isAi ? 0xff8800 : 0x00aaff); g.drawRect(2,-7,2,2);  g.endFill()
    g.beginFill(isAi ? 0xffcc00 : 0xffffff,0.4); g.drawRect(-1,-4,5,1); g.endFill()

    // ── Arms (swing with walk) ────────────────────────────────────────────
    g.beginFill(hi);  g.drawRect(-12,-11+lArm,5,2);  g.endFill()
    g.beginFill(mid); g.drawRect(-12,-9+lArm,5,12);  g.endFill()
    g.beginFill(dkk); g.drawRect(-12,-9+lArm,1,12);  g.endFill()
    g.beginFill(dk);  g.drawRect(-12,2+lArm,5,2);    g.endFill()
    g.beginFill(hi);  g.drawRect(7,-11+rArm,5,2);    g.endFill()
    g.beginFill(mid); g.drawRect(7,-9+rArm,5,12);    g.endFill()
    g.beginFill(dkk); g.drawRect(11,-9+rArm,1,12);   g.endFill()
    g.beginFill(dk);  g.drawRect(7,2+rArm,5,2);      g.endFill()

    // ── Legs (swing with walk) ────────────────────────────────────────────
    g.beginFill(mid); g.drawRect(-7,8+lLeg,6,10);  g.endFill()
    g.beginFill(dkk); g.drawRect(-7,8+lLeg,1,10);  g.endFill()
    g.beginFill(dk);  g.drawRect(-7,8+lLeg,6,2);   g.endFill()
    g.beginFill(dk);  g.drawRect(-8,17+lLeg,7,3);  g.endFill()
    g.beginFill(mid); g.drawRect(1,8+rLeg,6,10);   g.endFill()
    g.beginFill(dkk); g.drawRect(6,8+rLeg,1,10);   g.endFill()
    g.beginFill(dk);  g.drawRect(1,8+rLeg,6,2);    g.endFill()
    g.beginFill(dk);  g.drawRect(1,17+rLeg,7,3);   g.endFill()

    // ── Local player marker ──────────────────────────────────────────────
    if (isLocal) {
      g.lineStyle(1, color, 0.9)
      g.drawRect(-14,-30,28,52)
      g.lineStyle(0)
      g.beginFill(color);    g.drawRect(-1,-34,2,2); g.endFill()
      g.beginFill(hi, 0.8);  g.drawRect(0,-35,1,1);  g.endFill()
    }
  }

  private drawOutline(g: PIXI.Graphics, color: number) {
    g.clear()
    g.lineStyle(1, color, 0.9)
    g.drawRect(-14, -30, 28, 52)
    g.lineStyle(0)
  }

  updateFromGameState(state: GameState) {
    const { players } = state
    this.inDanger = state.publicOxygen < 8

    players.slice(0, 4).forEach((p, i) => {
      const node = this.playerNodes[i]
      if (!node) return
      node.playerId = p.id
      node.isAI     = p.type === 'ai'
      node.color    = CREW_COLORS[i % CREW_COLORS.length]
      node.alive    = p.alive
      const isLocal = p.id === this.localPlayerId
      this.drawCrew(node.gfx, node.color, p.alive, p.type === 'ai', isLocal, node.walkPhase)
      node.label.text = (isLocal ? '> ' : '') + p.name.slice(0, 7).toUpperCase()
      node.label.style.fill = !p.alive ? 0x444455 : isLocal ? 0xffffff : node.color
      this.drawOutline(node.outline, node.color)
    })
  }

  private getLocalNode(): PlayerNode {
    return (
      (this.localPlayerId
        ? this.playerNodes.find(n => n.playerId === this.localPlayerId)
        : undefined)
      ?? this.playerNodes[0]
    )
  }

  private tick() {
    const t   = this.app.ticker.lastTime / 1000
    const dt  = this.app.ticker.deltaTime
    const dt_s = dt / 60

    // Stars
    for (const { g, spd, W, H } of this.stars) {
      g.x -= spd * dt
      if (g.x < -4) { g.x = W + Math.random() * 80; g.y = Math.random() * H }
    }

    // Local player — A/D horizontal + Space jump, gravity
    const localNode = this.getLocalNode()
    const isObserver = this.localPlayerId === '__observer__'
    if (localNode && !isObserver) {
      const dx = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0)

      // Horizontal movement
      localNode.gfx.x = Math.max(this.crewLeft, Math.min(this.crewRight, localNode.gfx.x + dx * SPEED * dt_s))

      // Face direction of movement
      if (dx > 0) localNode.gfx.scale.x = 1
      else if (dx < 0) localNode.gfx.scale.x = -1

      // Jump (only when grounded)
      if (this.jumpQueued && localNode.onGround) {
        localNode.velocityY = JUMP_VEL
        localNode.onGround  = false
      }

      // Gravity
      localNode.velocityY += GRAVITY * dt_s

      // Apply vertical velocity
      localNode.gfx.y += localNode.velocityY * dt_s

      // Ceiling clamp
      if (localNode.gfx.y < this.crewTop) {
        localNode.gfx.y  = this.crewTop
        localNode.velocityY = 0
      }
      // Floor clamp
      if (localNode.gfx.y >= this.crewBottom) {
        localNode.gfx.y  = this.crewBottom
        localNode.velocityY = 0
        localNode.onGround  = true
      }

      // Walk animation
      if (Math.abs(dx) > 0.1) {
        localNode.walkPhase = (localNode.walkPhase + dt_s * 5) % 1
      } else {
        localNode.walkPhase *= 0.7
        if (localNode.walkPhase < 0.01) localNode.walkPhase = 0
      }

      // Redraw local player with current walk phase
      this.drawCrew(localNode.gfx, localNode.color, localNode.alive, localNode.isAI, true, localNode.walkPhase)

      localNode.label.x = localNode.gfx.x
      localNode.label.y = localNode.gfx.y - 55
      localNode.outline.x = localNode.gfx.x
      localNode.outline.y = localNode.gfx.y

      // Footprints when walking on ground
      if (localNode.onGround && Math.abs(dx) > 0.1) {
        if (Math.abs(localNode.gfx.x - localNode.lastFootstepX) > 22) {
          this.footprints.push({ x: localNode.gfx.x, floorY: this.crewBottom, alpha: 0.85 })
          localNode.lastFootstepX = localNode.gfx.x
        }
      }
    }
    this.jumpQueued = false

    // Camera
    if (isObserver) {
      const cdx = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0)
      const cdy = (this.keys.has('s') ? 1 : 0) - (this.keys.has('w') ? 1 : 0)
      this.world.x = Math.max(this.W - WORLD_W - 300, Math.min(300, this.world.x - cdx * SPEED * dt_s))
      this.world.y = Math.max(-250, Math.min(250, this.world.y - cdy * SPEED * dt_s))
    } else if (localNode) {
      const targetX = this.W / 2 - localNode.gfx.x
      const clamped = Math.max(this.W - WORLD_W, Math.min(0, targetX))
      this.world.x += (clamped - this.world.x) * 0.12
    }

    // AI procedural wandering with walk animation
    this.playerNodes.forEach((node) => {
      const isLocal = !isObserver && this.localPlayerId
        ? node.playerId === this.localPlayerId
        : false
      if (isLocal) return
      if (!node.isAI) return

      node.wanderTimer -= dt_s
      if (node.wanderTimer <= 0) {
        const margin = 40
        node.targetX = this.crewLeft + margin + Math.random() * (this.crewRight - this.crewLeft - margin * 2)
        node.targetY = this.crewBottom - Math.random() * 30
        node.wanderTimer = 2 + Math.random() * 4
      }

      const dxAI = node.targetX - node.gfx.x
      const dyAI = node.targetY - node.gfx.y
      const moving = Math.abs(dxAI) > 6

      if (moving) {
        node.gfx.x += dxAI * dt_s * 0.8
        node.gfx.y += dyAI * dt_s * 0.8
        node.walkPhase = (node.walkPhase + dt_s * 4) % 1
        node.gfx.scale.x = dxAI > 0 ? 1 : -1
        // Footprints for AI
        if (Math.abs(node.gfx.x - node.lastFootstepX) > 24) {
          this.footprints.push({ x: node.gfx.x, floorY: this.crewBottom, alpha: 0.55 })
          node.lastFootstepX = node.gfx.x
        }
      } else {
        // Idle bob
        node.gfx.y += dyAI * dt_s * 0.8 + Math.sin(t * 0.9 + node.idlePhase) * 0.4
        node.walkPhase *= 0.8
        if (node.walkPhase < 0.01) node.walkPhase = 0
      }

      node.gfx.x = Math.max(this.crewLeft,  Math.min(this.crewRight,  node.gfx.x))
      node.gfx.y = Math.max(this.crewTop,    Math.min(this.crewBottom, node.gfx.y))

      // Redraw AI with walk animation
      this.drawCrew(node.gfx, node.color, node.alive, node.isAI, false, node.walkPhase)

      node.label.x = node.gfx.x
      node.label.y = node.gfx.y - 55
      node.outline.x = node.gfx.x
      node.outline.y = node.gfx.y
    })

    // Footprints — fade and draw
    this.footprintGfx.clear()
    for (let i = this.footprints.length - 1; i >= 0; i--) {
      const fp = this.footprints[i]
      fp.alpha -= dt_s * 0.4
      if (fp.alpha <= 0) { this.footprints.splice(i, 1); continue }
      // Left and right boot marks, slightly offset
      this.footprintGfx.beginFill(0x2a4a6a, fp.alpha)
      this.footprintGfx.drawRect(fp.x - 6, fp.floorY - 1, 5, 2)
      this.footprintGfx.endFill()
      this.footprintGfx.beginFill(0x2a4a6a, fp.alpha)
      this.footprintGfx.drawRect(fp.x,     fp.floorY - 1, 5, 2)
      this.footprintGfx.endFill()
    }

    // Engine
    const { engCoreX, engCoreY, engCoreH, nozzleY1, nozzleY2, sx } = this
    const engCoreW = Math.floor(this.engW * 0.36)
    this.engineGfx.clear()
    for (const ny of [nozzleY1, nozzleY2]) {
      for (let seg=1; seg<=8; seg++) {
        const alpha  = (1 - seg/8) * (0.45 + Math.sin(t*12+seg)*0.2)
        const pulse  = 0.5 + Math.sin(t*10+ny*0.01)*0.5
        const rr = Math.floor(0x22+pulse*0x44)
        const gg = Math.floor(0x22+pulse*0x22)
        const bb = Math.floor(0xaa+pulse*0x55)
        const narrowing = seg * 1.5
        this.engineGfx.beginFill((rr<<16)|(gg<<8)|bb, alpha)
        this.engineGfx.drawRect(sx-18-seg*12, ny-7+narrowing/2, 12+seg*9, 14-narrowing)
        this.engineGfx.endFill()
      }
    }
    for (let seg=0; seg<6; seg++) {
      const alpha = 0.15 + Math.sin(t*6+seg*0.8)*0.10
      const pulse = 0.5 + Math.sin(t*8-seg*0.5)*0.5
      const rr = Math.floor(0x11+pulse*0x33)
      const bb = Math.floor(0xcc+pulse*0x33)
      const inset = seg*1.5
      this.engineGfx.beginFill((rr<<16)|(0x11<<8)|bb, alpha+0.3)
      this.engineGfx.drawRect(engCoreX+inset, engCoreY+(engCoreH*seg)/6, engCoreW-inset*2, engCoreH/6)
      this.engineGfx.endFill()
    }

    // LED strip
    const { ix, iy, iw, ih } = this
    const ledStripX = ix+iw*0.05; const ledStripW = iw*0.90
    const ledY = iy+Math.floor(ih*0.07)+18; const ledCount = 36
    const ledW = Math.floor(ledStripW/ledCount)-2
    this.statusGfx.clear()
    for (let li=0; li<ledCount; li++) {
      const lx = ledStripX + li*(ledStripW/ledCount)
      if (this.inDanger) {
        const on = Math.floor(t*4+li*0.3)%2===0
        this.statusGfx.beginFill(on ? C.RED : 0x220000)
        this.statusGfx.drawRect(lx, ledY, ledW, 5)
        this.statusGfx.endFill()
      } else {
        const brightness = 0.5+Math.sin(t*1.5+li*0.4)*0.15
        this.statusGfx.beginFill(C.GREEN, brightness)
        this.statusGfx.drawRect(lx, ledY, ledW, 5)
        this.statusGfx.endFill()
      }
    }

    // Bridge screens
    const { bridgeX, bridgeW } = this
    const screenW2 = bridgeW-10
    const scanClr  = [C.CYAN, C.GREEN, C.GOLD]
    this.screenGfx.clear()
    for (let si=0; si<3; si++) {
      const sy2   = iy+14+si*32
      const scanY = sy2 + ((t*22+si*9)%26)
      this.screenGfx.beginFill(scanClr[si], 0.18); this.screenGfx.drawRect(bridgeX+5,sy2,screenW2,26); this.screenGfx.endFill()
      this.screenGfx.beginFill(scanClr[si], 0.55); this.screenGfx.drawRect(bridgeX+5,scanY,screenW2,2); this.screenGfx.endFill()
    }

    // Danger vignette
    this.dangerGfx.clear()
    if (this.inDanger) {
      const alpha = Math.abs(Math.sin(t*3.5))*0.08
      this.dangerGfx.beginFill(0xff0000, alpha)
      this.dangerGfx.drawRect(0,0,this.W,this.H)
      this.dangerGfx.endFill()
      this.dangerGfx.lineStyle(6,0xff0000,Math.abs(Math.sin(t*3.5))*0.80)
      this.dangerGfx.drawRect(3,3,this.W-6,this.H-6)
      this.dangerGfx.lineStyle(0)
    }

    // Speech bubbles — track above nametag
    for (let i=this.bubbles.length-1; i>=0; i--) {
      const b = this.bubbles[i]
      b.ttl -= dt_s
      if (b.ttl <= 0) {
        this.bubbleContainer.removeChild(b.gfx)
        b.gfx.destroy({ children: true })
        this.bubbles.splice(i,1)
      } else {
        b.gfx.alpha = Math.min(1, b.ttl)
        b.gfx.x = b.node.gfx.x
        b.gfx.y = b.node.gfx.y - 60
      }
    }
  }

  showSpeechBubble(playerId: string, text: string) {
    const node = this.playerNodes.find(n => n.playerId === playerId)
    if (!node) return

    const MAX_LEN = 32
    const display = text.length > MAX_LEN ? text.slice(0, MAX_LEN-1) + '…' : text

    const label = new PIXI.Text(display, {
      fontFamily: "'VT323', 'Courier New', monospace",
      fontSize: 13, fill: 0xe0f8ff, align: 'center',
      wordWrap: true, wordWrapWidth: 118,
    })
    label.anchor.set(0.5, 1)

    const pad=6; const bw=label.width+pad*2; const bh=label.height+pad*2
    label.x=0; label.y=-pad

    const g = new PIXI.Graphics()
    g.beginFill(0x010818,0.93); g.lineStyle(1,0x00e5ff,0.85); g.drawRect(-bw/2,-bh,bw,bh); g.endFill()
    g.beginFill(0x010818,0.93); g.lineStyle(1,0x00e5ff,0.85)
    g.moveTo(-5,0); g.lineTo(5,0); g.lineTo(0,7); g.closePath(); g.endFill()

    const container = new PIXI.Container()
    container.addChild(g); container.addChild(label)
    container.x = node.gfx.x; container.y = node.gfx.y - 60

    this.bubbleContainer.addChild(container)
    this.bubbles.push({ gfx: container, ttl: 4.5, node })
  }

  resize(w: number, h: number) {
    this.W = w; this.H = h
    this.app.renderer.resize(w, h)
  }

  dispose() {
    window.removeEventListener('keydown', this.onKD)
    window.removeEventListener('keyup', this.onKU)
    this.app.destroy(false, { children: true })
  }
}
