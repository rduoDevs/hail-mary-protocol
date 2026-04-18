export type Role = 'Engineer' | 'Medic' | 'Navigator' | 'Commander' | 'Scientist' | 'Security';
export type PlayerType = 'human' | 'ai';
export type GamePhase = 'lobby' | 'discussion' | 'action' | 'resolution' | 'over';
export type ActionType = 'gather' | 'repair' | 'hoard' | 'share' | 'sabotage' | 'sacrifice';
export type ResourceType = 'oxygen' | 'power' | 'repair_parts';

export interface ShipState {
  hull_integrity: number;
  oxygen: number;
  power: number;
  repair_parts: number;
  round: number;
}

export interface PlayerState {
  id: string;
  name: string;
  role: Role;
  type: PlayerType;
  health: number;
  alive: boolean;
  personal_oxygen: number;
  socketId?: string;
  actionSubmitted: boolean;
  currentAction?: PlayerAction;
}

export interface PlayerPublicState {
  id: string;
  name: string;
  role: Role;
  type: PlayerType;
  health: number;
  alive: boolean;
  actionSubmitted: boolean;
}

export interface PlayerAction {
  type: ActionType;
  target?: string;
  resource?: ResourceType;
}

export interface ActionResult {
  playerId: string;
  playerName: string;
  action: PlayerAction;
  description: string;
}

export interface ActionRecord {
  round: number;
  results: ActionResult[];
}

export interface WhisperMessage {
  fromPlayerId: string;
  fromPlayerName: string;
  toPlayerId: string;
  text: string;
  timestamp: number;
}

export interface WhisperPayload {
  toPlayerId: string;
  text: string;
}

export interface StoryAlert {
  round: number;
  type: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
}

export interface GameState {
  gameId: string;
  round: number;
  phase: GamePhase;
  ship: ShipState;
  players: PlayerPublicState[];
  actionHistory: ActionRecord[];
  capacityRevealed: boolean;
  trueCapacity?: number;
  storyAlert?: StoryAlert;
  outcome?: {
    result: 'win' | 'loss';
    survivors: string[];
    message: string;
  };
}

export interface JoinPayload {
  name: string;
  type: PlayerType;
}

export interface ActionPayload {
  type: ActionType;
  target?: string;
  resource?: ResourceType;
}

export interface MessagePayload {
  text: string;
}

export interface PhasePayload {
  phase: 'discussion' | 'action' | 'resolution';
  round: number;
  timeLeft: number;
}

export interface ChatMessage {
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}
