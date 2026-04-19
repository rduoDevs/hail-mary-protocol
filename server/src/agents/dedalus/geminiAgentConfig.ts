/**
 * Gemini-specific configuration for the Dedalus Runner.
 * Isolates all provider-specific options from game logic.
 */
export interface GeminiAgentConfig {
  model: string
  temperature: number
  maxOutputTokens: number
  responseMimeType: 'application/json'
  responseSchema: object
}

export const AI_OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reasoning_trace:  { type: 'STRING' },
    public_messages:  { type: 'ARRAY', items: { type: 'STRING' } },
    whispers: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          to_player: { type: 'STRING' },
          text:      { type: 'STRING' },
        },
        required: ['to_player', 'text'],
      },
    },
    donation_plan: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          to_player: { type: 'STRING' },
          amount:    { type: 'NUMBER' },
        },
        required: ['to_player', 'amount'],
      },
    },
    sacrifice:        { type: 'BOOLEAN' },
    player_to_eject: { type: 'STRING' },
  },
  required: ['reasoning_trace', 'public_messages', 'whispers', 'donation_plan', 'sacrifice', 'player_to_eject'],
}

export function buildGeminiAgentConfig(overrides: Partial<GeminiAgentConfig> = {}): GeminiAgentConfig {
  return {
    model: 'gemini-2.0-flash',
    temperature: 0.9,
    maxOutputTokens: 2048,
    responseMimeType: 'application/json',
    responseSchema: AI_OUTPUT_SCHEMA,
    ...overrides,
  }
}
