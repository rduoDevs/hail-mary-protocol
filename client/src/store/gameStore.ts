import { create } from 'zustand'

export interface ShipState {
  hull_integrity: number
  oxygen: number
  power: number
  repair_parts: number
  round: number
}

export interface PlayerPublicState {
  id: string
  name: string
  role: 'Engineer' | 'Medic' | 'Navigator' | 'Commander'
  type: 'human' | 'ai'
  health: number
  alive: boolean
}

export interface GameState {
  gameId: string
  round: number
  phase: 'lobby' | 'discussion' | 'action' | 'resolution' | 'over'
  ship: ShipState
  players: PlayerPublicState[]
  actionHistory: any[]
  outcome?: { result: 'win' | 'loss'; survivors: string[]; message: string }
}

export interface PhaseInfo {
  phase: 'discussion' | 'action' | 'resolution'
  round: number
  timeLeft: number
}

export interface ChatMessage {
  playerId: string
  playerName: string
  text: string
  timestamp: number
}

export interface ActionResult {
  playerId: string
  action: string
  result: string
}

interface GameStore {
  // Connection
  connected: boolean
  joined: boolean
  localPlayerId: string | null
  localPlayerName: string | null

  // Game data
  gameState: GameState | null
  phaseInfo: PhaseInfo | null
  messages: ChatMessage[]
  lastActionResults: ActionResult[]

  // Actions
  setConnected: (v: boolean) => void
  setJoined: (id: string, name: string) => void
  setGameState: (s: GameState) => void
  setPhaseInfo: (p: PhaseInfo) => void
  addMessage: (m: ChatMessage) => void
  setActionResults: (r: ActionResult[]) => void
  reset: () => void
}

export const useGameStore = create<GameStore>((set) => ({
  connected: false,
  joined: false,
  localPlayerId: null,
  localPlayerName: null,
  gameState: null,
  phaseInfo: null,
  messages: [],
  lastActionResults: [],

  setConnected: (v) => set({ connected: v }),
  setJoined: (id, name) => set({ joined: true, localPlayerId: id, localPlayerName: name }),
  setGameState: (s) => set({ gameState: s }),
  setPhaseInfo: (p) => set({ phaseInfo: p }),
  addMessage: (m) =>
    set((state) => ({ messages: [...state.messages.slice(-199), m] })),
  setActionResults: (r) => set({ lastActionResults: r }),
  reset: () =>
    set({
      joined: false,
      localPlayerId: null,
      localPlayerName: null,
      gameState: null,
      phaseInfo: null,
      messages: [],
      lastActionResults: [],
    }),
}))
