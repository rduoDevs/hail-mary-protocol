import { PlayerPersonalityProfile, PublicMessage, TurnLogRecord, WhisperMessage } from '../game/types'
import { buildGamePersonalityPrompt } from './prompts'
import { cerebrasChat, pickKey } from '../agents/cerebrasClient'

function extractJson(text: string): string {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  if (stripped.startsWith('{')) return stripped
  const start = stripped.indexOf('{')
  const end   = stripped.lastIndexOf('}')
  if (start !== -1 && end > start) return stripped.slice(start, end + 1)
  return text
}

function nullProfile(playerId: string, playerName: string, survived: boolean): PlayerPersonalityProfile {
  return {
    playerId, playerName, survived,
    traitScores: {
      aggression: 5, utilitarianism: 5, egoism: 5,
      fear: 5, reasoning_style: 5, deceitfulness: 5,
    },
    overallStrategySummary: 'Insufficient data for analysis.',
    behavioralConsistency: 'consistent',
  }
}

/** Builds a human-readable action history string across all rounds for a player. */
function buildActionSummary(records: TurnLogRecord[]): string {
  return records.map(r => {
    const parts: string[] = [`R${r.round}:`]
    if (r.donationPlan.length > 0)
      parts.push(`donated ${r.donationPlan.map(d => `${d.amount}O2→${d.toPlayerId.slice(0,6)}`).join(',')}`)
    if (r.sacrifice) parts.push('SACRIFICED')
    if (r.voteTarget) parts.push(`voted:${r.voteTarget.slice(0,6)}`)
    if (!r.postState.alive) parts.push('DIED')
    return parts.join(' ')
  }).join(' | ')
}

/** MODE 2 — Game-level personality profiler. One call per player, full game context. */
export class ChatDiscriminator {
  private keyPool: string[]

  constructor(keyPool: string | string[]) {
    this.keyPool = Array.isArray(keyPool) ? keyPool : keyPool ? [keyPool] : []
  }

  /** Produces one personality profile per AI player using all their game messages and actions. */
  async analyzeGame(
    players: { id: string; name: string; alive: boolean }[],
    publicMessages: PublicMessage[],
    whispers: WhisperMessage[],
    records: TurnLogRecord[],
    totalRounds: number,
  ): Promise<PlayerPersonalityProfile[]> {
    const profiles: PlayerPersonalityProfile[] = []

    for (const player of players) {
      const playerRecords = records.filter(r => r.playerId === player.id && !r.reasoningTrace.startsWith('Heuristic.'))

      // Skip players with no real LLM turns
      if (playerRecords.length === 0 || this.keyPool.length === 0) {
        profiles.push(nullProfile(player.id, player.name, player.alive))
        continue
      }

      const myPublic = publicMessages
        .filter(m => m.playerId === player.id)
        .map(m => `[R${m.round}] ${m.text}`)

      const myWhispers = whispers
        .filter(w => w.fromPlayerId === player.id || w.toPlayerId === player.id)
        .map(w => `[R${w.round}] ${w.fromPlayerId === player.id ? '→?' : '?→'}: ${w.text}`)

      const actionSummary = buildActionSummary(playerRecords)

      const reasoningTraces = playerRecords.map(r => `[R${r.round}] ${r.reasoningTrace}`)

      const prompt = buildGamePersonalityPrompt({
        playerName:     player.name,
        survived:       player.alive,
        totalRounds,
        publicChatLines:  myPublic,
        whisperLines:     myWhispers,
        actionSummary,
        reasoningTraces,
      })

      const apiKey = pickKey(this.keyPool, player.id)

      try {
        const text   = await cerebrasChat(apiKey, prompt, { temperature: 0.2, maxTokens: 300, model: 'small' })
        const parsed = JSON.parse(extractJson(text))
        const ts     = parsed.traitScores ?? {}

        const toScore    = (v: unknown) => typeof v === 'number' ? Math.min(10, Math.max(1, v)) : 5
        const toStyle    = (v: unknown) => typeof v === 'number' ? Math.min(10, Math.max(0, v)) : 5

        profiles.push({
          playerId:    player.id,
          playerName:  player.name,
          survived:    player.alive,
          traitScores: {
            aggression:      toScore(ts.aggression),
            utilitarianism:  toScore(ts.utilitarianism),
            egoism:          toScore(ts.egoism),
            fear:            toScore(ts.fear),
            reasoning_style: toStyle(ts.reasoning_style),
            deceitfulness:   toScore(ts.deceitfulness),
          },
          overallStrategySummary: parsed.overallStrategySummary ?? '',
          behavioralConsistency:  ['consistent','adaptive','erratic'].includes(parsed.behavioralConsistency)
            ? parsed.behavioralConsistency
            : 'consistent',
        })
      } catch (err) {
        console.error(`[ChatDiscriminator] game-level error for ${player.name}:`, err)
        profiles.push(nullProfile(player.id, player.name, player.alive))
      }
    }

    return profiles
  }
}
