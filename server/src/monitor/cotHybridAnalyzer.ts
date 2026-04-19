import { CoTHybridAnalyzerOutput, TurnLogRecord } from '../game/types'
import { buildCoTHybridPrompt } from './prompts'
import { cerebrasChat, pickKey } from '../agents/cerebrasClient'

function extractJson(text: string): string {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  if (stripped.startsWith('{')) return stripped
  const start = stripped.indexOf('{')
  const end   = stripped.lastIndexOf('}')
  if (start !== -1 && end > start) return stripped.slice(start, end + 1)
  return text
}

function nullOutput(playerId: string, round: number): CoTHybridAnalyzerOutput {
  return {
    playerId, round,
    cotActionAlignment: 5, logicalGroundingInAction: 5, emotionalGroundingInAction: 5,
    resourceAwareness: 5, survivalReasoningQuality: 5, uncertaintyExplicitness: 5,
    planningHorizonScore: 5, coalitionIntentScore: 5, manipulationScore: 5,
    overallAlignmentRisk: 5,
    conciseRationale: 'No CoT analysis available.',
    evidenceSentences: [],
  }
}

/** MODE 3 — CoT analyzer. Uses reasoning trace vs actions only — no chat text. */
export class CoTHybridAnalyzer {
  private keyPool: string[]

  constructor(keyPool: string | string[]) {
    this.keyPool = Array.isArray(keyPool) ? keyPool : keyPool ? [keyPool] : []
  }

  async analyze(record: TurnLogRecord): Promise<CoTHybridAnalyzerOutput> {
    if (this.keyPool.length === 0 || !record.reasoningTrace) return nullOutput(record.playerId, record.round)

    const prompt = buildCoTHybridPrompt({
      playerName:     record.playerName,
      playerId:       record.playerId,
      round:          record.round,
      publicOxygen:   record.preState.publicOxygen,
      privateOxygen:  record.preState.privateOxygen,
      alivePlayers:   record.preState.alivePlayers,
      reasoningTrace: record.reasoningTrace,
      donationPlan:   record.donationPlan.map(d => ({ to: d.toPlayerId, amount: d.amount })),
      sacrifice:      record.sacrifice,
      voteTarget:     record.voteTarget,
      postOutcome:    { alive: record.postState.alive, privateOxygenEnd: record.postState.privateOxygen },
    })

    const apiKey = pickKey(this.keyPool, record.playerId)

    try {
      const text   = await cerebrasChat(apiKey, prompt, { temperature: 0.3, maxTokens: 800, model: 'small' })
      const parsed = JSON.parse(extractJson(text))
      return {
        playerId: record.playerId,
        round:    record.round,
        cotActionAlignment:         parsed.cotActionAlignment         ?? 5,
        logicalGroundingInAction:   parsed.logicalGroundingInAction   ?? 5,
        emotionalGroundingInAction: parsed.emotionalGroundingInAction ?? 5,
        resourceAwareness:          parsed.resourceAwareness          ?? 5,
        survivalReasoningQuality:   parsed.survivalReasoningQuality   ?? 5,
        uncertaintyExplicitness:    parsed.uncertaintyExplicitness    ?? 5,
        planningHorizonScore:       parsed.planningHorizonScore       ?? 5,
        coalitionIntentScore:       parsed.coalitionIntentScore       ?? 5,
        manipulationScore:          parsed.manipulationScore          ?? 5,
        overallAlignmentRisk:       parsed.overallAlignmentRisk       ?? 5,
        conciseRationale:           parsed.conciseRationale           ?? '',
        evidenceSentences:          parsed.evidenceSentences          ?? [],
      }
    } catch (err) {
      console.error('[CoTHybridAnalyzer] error:', err)
      return nullOutput(record.playerId, record.round)
    }
  }
}
