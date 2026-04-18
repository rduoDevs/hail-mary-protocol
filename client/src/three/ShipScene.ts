import * as THREE from 'three'
import type { GameState } from '../store/gameStore'

export class ShipScene {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private animFrameId: number = 0

  // Scene objects
  private shipGroup: THREE.Group
  private resourceRings: { oxygen: THREE.Mesh; power: THREE.Mesh; repair: THREE.Mesh }
  private playerNodes: THREE.Mesh[]
  private playerLabels: HTMLElement[]
  private labelContainer: HTMLElement

  private damageFlickers: THREE.PointLight[]
  private basePointLight: THREE.PointLight

  private cameraAngle: number = 0
  private cameraRadius: number = 12
  private cameraHeight: number = 5

  constructor(canvas: HTMLCanvasElement, labelContainer: HTMLElement) {
    this.labelContainer = labelContainer

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    this.renderer.shadowMap.enabled = true

    // Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x000005)

    // Camera
    this.camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 1000)
    this.camera.position.set(0, this.cameraHeight, this.cameraRadius)
    this.camera.lookAt(0, 0, 0)

    // Lights
    const ambientLight = new THREE.AmbientLight(0x112233, 1.2)
    this.scene.add(ambientLight)

    this.basePointLight = new THREE.PointLight(0x8888ff, 3, 30)
    this.basePointLight.position.set(0, 8, 0)
    this.scene.add(this.basePointLight)

    // Damage flicker lights
    this.damageFlickers = []
    for (let i = 0; i < 3; i++) {
      const fl = new THREE.PointLight(0xff2200, 4, 10)
      fl.position.set(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 4
      )
      fl.visible = false
      this.scene.add(fl)
      this.damageFlickers.push(fl)
    }

    // Stars
    this.buildStars()

    // Ship
    this.shipGroup = new THREE.Group()
    this.buildShip()
    this.scene.add(this.shipGroup)

    // Resource rings
    this.resourceRings = this.buildResourceRings()

    // Player nodes
    this.playerNodes = []
    this.playerLabels = []
    this.buildPlayerNodes()
  }

  private buildStars() {
    const count = 2000
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count * 3; i++) {
      positions[i] = (Math.random() - 0.5) * 400
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, sizeAttenuation: true })
    const stars = new THREE.Points(geo, mat)
    this.scene.add(stars)
  }

  private buildShip() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      metalness: 0.7,
      roughness: 0.4,
    })

    // Main hull - elongated box
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 4.5), mat)
    this.shipGroup.add(hull)

    // Crew module - wider center section
    const crew = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 1.8), mat)
    crew.position.set(0, 0.15, 0)
    this.shipGroup.add(crew)

    // Engine block
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.8), mat)
    engine.position.set(0, -0.05, -2.4)
    this.shipGroup.add(engine)

    // Engine glow
    const engineGlowGeo = new THREE.CylinderGeometry(0.18, 0.28, 0.3, 16)
    const engineGlowMat = new THREE.MeshStandardMaterial({
      color: 0x4444ff,
      emissive: 0x2233ff,
      emissiveIntensity: 1.5,
    })
    const engineGlow = new THREE.Mesh(engineGlowGeo, engineGlowMat)
    engineGlow.position.set(0, -0.05, -2.85)
    engineGlow.rotation.x = Math.PI / 2
    this.shipGroup.add(engineGlow)

    // Wings
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x16213e,
      metalness: 0.8,
      roughness: 0.3,
    })
    const wingGeo = new THREE.BoxGeometry(2.8, 0.12, 1.4)
    const wingL = new THREE.Mesh(wingGeo, wingMat)
    wingL.position.set(0, -0.2, 0.4)
    this.shipGroup.add(wingL)

    // Bridge dome
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0x0f3460,
      metalness: 0.5,
      roughness: 0.6,
      transparent: true,
      opacity: 0.85,
    })
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat)
    dome.position.set(0, 0.65, 1.2)
    this.shipGroup.add(dome)
  }

  private buildResourceRings() {
    const ringPositions = [
      { y: 0, name: 'oxygen', color: 0x00bfff },
      { y: 0, name: 'power', color: 0xffd700 },
      { y: 0, name: 'repair', color: 0xff6b35 },
    ]

    const rings: any = {}

    ringPositions.forEach(({ name, color }, i) => {
      const radius = 2.8 + i * 0.9
      const tubeRadius = 0.12
      const geo = new THREE.TorusGeometry(radius, tubeRadius, 12, 64)
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.6,
        metalness: 0.2,
        roughness: 0.5,
      })
      const ring = new THREE.Mesh(geo, mat)
      // Tilt each ring slightly differently
      ring.rotation.x = Math.PI / 2 + (i * 0.15)
      ring.rotation.z = i * 0.2
      this.scene.add(ring)
      rings[name] = ring
    })

    return rings as { oxygen: THREE.Mesh; power: THREE.Mesh; repair: THREE.Mesh }
  }

  private buildPlayerNodes() {
    // Diamond positions: top, right, bottom, left
    const positions = [
      new THREE.Vector3(0, 2.5, 0),
      new THREE.Vector3(2.2, 0.5, 0),
      new THREE.Vector3(0, -1.5, 0),
      new THREE.Vector3(-2.2, 0.5, 0),
    ]

    for (let i = 0; i < 4; i++) {
      const geo = new THREE.SphereGeometry(0.28, 16, 16)
      const mat = new THREE.MeshStandardMaterial({
        color: 0x4fc3f7,
        emissive: 0x4fc3f7,
        emissiveIntensity: 0.4,
        metalness: 0.3,
        roughness: 0.4,
      })
      const sphere = new THREE.Mesh(geo, mat)
      sphere.position.copy(positions[i])
      this.scene.add(sphere)
      this.playerNodes.push(sphere)

      // HTML label
      const label = document.createElement('div')
      label.style.cssText = `
        position: absolute;
        pointer-events: none;
        text-align: center;
        font-family: 'Space Mono', monospace;
        font-size: 10px;
        color: #00bfff;
        text-shadow: 0 0 6px #00bfff;
        white-space: nowrap;
        transform: translate(-50%, -100%);
        padding: 2px 4px;
      `
      label.style.display = 'none'
      this.labelContainer.appendChild(label)
      this.playerLabels.push(label)
    }
  }

  updateFromGameState(state: GameState) {
    const { ship, players } = state

    // Resource rings - update tube radius based on value
    const updateRing = (ring: THREE.Mesh, value: number, maxVal: number = 100) => {
      const t = Math.max(0, Math.min(1, value / maxVal))
      const tubeRadius = 0.05 + t * 0.25
      const radius = (ring.geometry as THREE.TorusGeometry).parameters.radius
      ring.geometry.dispose()
      ring.geometry = new THREE.TorusGeometry(radius, tubeRadius, 12, 64)
    }

    updateRing(this.resourceRings.oxygen, ship.oxygen)
    updateRing(this.resourceRings.power, ship.power)
    updateRing(this.resourceRings.repair, ship.repair_parts, 50)

    // Damage flicker
    const inDanger = ship.hull_integrity < 30
    this.damageFlickers.forEach((fl) => (fl.visible = inDanger))

    // Player nodes
    players.slice(0, 4).forEach((p, i) => {
      const node = this.playerNodes[i]
      if (!node) return
      const mat = node.material as THREE.MeshStandardMaterial
      const isHuman = p.type === 'human'
      const baseColor = isHuman ? 0x4fc3f7 : 0xef5350

      if (!p.alive) {
        mat.color.set(0x333333)
        mat.emissive.set(0x111111)
        mat.emissiveIntensity = 0.1
      } else {
        mat.color.set(baseColor)
        mat.emissive.set(baseColor)
        mat.emissiveIntensity = 0.2 + (p.health / 100) * 0.8
      }

      // Update label
      const label = this.playerLabels[i]
      if (label) {
        label.innerHTML = `${p.name}<br/><span style="color:#888;font-size:9px">${p.role}</span>`
      }
    })

    // Hide extra labels
    for (let i = players.length; i < 4; i++) {
      const label = this.playerLabels[i]
      if (label) label.style.display = 'none'
    }
  }

  private updateLabelPositions() {
    const canvas = this.renderer.domElement
    const width = canvas.clientWidth
    const height = canvas.clientHeight

    this.playerNodes.forEach((node, i) => {
      const label = this.playerLabels[i]
      if (!label) return

      // Project 3D position to 2D screen
      const pos = node.position.clone()
      pos.y += 0.45 // offset above sphere
      pos.project(this.camera)

      const x = ((pos.x + 1) / 2) * width
      const y = ((-pos.y + 1) / 2) * height

      if (pos.z > 1) {
        label.style.display = 'none'
      } else {
        label.style.display = 'block'
        label.style.left = `${x}px`
        label.style.top = `${y}px`
      }
    })
  }

  animate() {
    this.animFrameId = requestAnimationFrame(() => this.animate())

    const t = Date.now() * 0.001

    // Auto-rotate camera
    this.cameraAngle += 0.001
    this.camera.position.x = Math.sin(this.cameraAngle) * this.cameraRadius
    this.camera.position.z = Math.cos(this.cameraAngle) * this.cameraRadius
    this.camera.position.y = this.cameraHeight
    this.camera.lookAt(0, 0, 0)

    // Rotate resource rings
    this.resourceRings.oxygen.rotation.y = t * 0.3
    this.resourceRings.power.rotation.y = t * -0.2
    this.resourceRings.repair.rotation.y = t * 0.15
    this.resourceRings.repair.rotation.z = t * 0.05

    // Slight ship bob
    this.shipGroup.position.y = Math.sin(t * 0.5) * 0.08
    this.shipGroup.rotation.z = Math.sin(t * 0.3) * 0.01

    // Flicker damage lights
    this.damageFlickers.forEach((fl, i) => {
      if (fl.visible) {
        fl.intensity = 2 + Math.sin(t * 20 + i * 2.1) * 2
      }
    })

    // Player node float
    this.playerNodes.forEach((node, i) => {
      node.position.y += Math.sin(t * 0.8 + i * 1.5) * 0.003
    })

    this.updateLabelPositions()
    this.renderer.render(this.scene, this.camera)
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  dispose() {
    cancelAnimationFrame(this.animFrameId)
    this.playerLabels.forEach((l) => l.remove())
    this.renderer.dispose()
  }
}
