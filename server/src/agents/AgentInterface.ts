import { AIPlayerContext, AITurnOutput } from '../game/types'

/**
 * Generic agent interface. Game engine talks only to this abstraction.
 * Concrete implementations (Dedalus/Gemini, mock, etc.) implement this.
 */
export interface AgentInterface {
  generateTurnOutput(ctx: AIPlayerContext): Promise<AITurnOutput>
  heuristicFallback(ctx: AIPlayerContext): AITurnOutput
}
