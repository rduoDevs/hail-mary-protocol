import * as fs from 'fs'
import * as path from 'path'
import { TurnLogRecord, PlayerPersonalityProfile, CoTHybridAnalyzerOutput } from '../game/types'

const TURNS_DIR       = path.resolve(process.cwd(), 'logs', 'turns')
const PERSONALITY_DIR = path.resolve(process.cwd(), 'logs', 'personalities')
const CSV_DIR         = path.resolve(process.cwd(), 'logs', 'csv')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function esc(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function row(...cells: (string | number | boolean | null | undefined)[]): string {
  return cells.map(esc).join(',')
}

// ─── Load CoT results from companion _cot.jsonl ───────────────────────────────

interface CotEntry {
  round: number
  playerId: string
  cotHybridOutput: CoTHybridAnalyzerOutput
}

function loadCotMap(gameId: string): Map<string, CoTHybridAnalyzerOutput> {
  const cotPath = path.join(TURNS_DIR, `${gameId}_cot.jsonl`)
  const map = new Map<string, CoTHybridAnalyzerOutput>()
  if (!fs.existsSync(cotPath)) return map
  const lines = fs.readFileSync(cotPath, 'utf8').split('\n').filter(l => l.trim())
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as CotEntry
      map.set(`${entry.round}_${entry.playerId}`, entry.cotHybridOutput)
    } catch { /* skip malformed */ }
  }
  return map
}

// ─── Round-level section ──────────────────────────────────────────────────────

const ROUND_HEADERS = [
  'gameId', 'round', 'playerId', 'playerName',
  'alive', 'privateOxygenStart', 'privateOxygenEnd', 'publicOxygen',
  'donatedOutAmount', 'donatedInAmount',
  'voteTarget', 'gotVotedCount', 'sacrificed',
  'diedThisRound', 'deathReason',
  'aggressivenessScore', 'altruismScore', 'greedScore', 'scarcityExposure', 'scarcityIndex',
  'publicMessages', 'whispers',
  'publicClaimCount', 'whisperClaimCount',
  'publicFalseClaimCount', 'whisperFalseClaimCount',
  'publicLieRate', 'whisperLieRate', 'overallLieRate',
  'oxygenClaimLieRate', 'donationClaimLieRate', 'voteClaimLieRate',
  // CoT scores (present only for notable turns)
  'cot_actionAlignment', 'cot_logicalGrounding', 'cot_emotionalGrounding',
  'cot_resourceAwareness', 'cot_survivalReasoningQuality', 'cot_uncertaintyExplicitness',
  'cot_planningHorizon', 'cot_coalitionIntent', 'cot_manipulationScore',
  'cot_overallAlignmentRisk', 'cot_rationale',
]

function roundRow(gameId: string, r: TurnLogRecord, cot: CoTHybridAnalyzerOutput | undefined): string {
  const m  = r.metrics
  const lm = r.lyingMetrics
  return row(
    gameId, r.round, r.playerId, r.playerName,
    m.alive, m.privateOxygenStart, m.privateOxygenEnd, r.preState.publicOxygen,
    m.donatedOutAmount, m.donatedInAmount,
    m.voteTarget, m.gotVotedCount, m.sacrificed,
    m.diedThisRound, m.deathReason ?? '',
    m.aggressivenessScore, m.altruismScore,
    m.greedScore.toFixed(4), m.scarcityExposure.toFixed(4), m.scarcityIndex,
    r.publicMessages.length, r.whispers.length,
    lm.publicClaimCount, lm.whisperClaimCount,
    lm.publicFalseClaimCount, lm.whisperFalseClaimCount,
    lm.publicLieRate.toFixed(4), lm.whisperLieRate.toFixed(4), lm.overallLieRate.toFixed(4),
    lm.oxygenClaimLieRate.toFixed(4), lm.donationClaimLieRate.toFixed(4), lm.voteClaimLieRate.toFixed(4),
    // CoT
    cot?.cotActionAlignment,         cot?.logicalGroundingInAction,  cot?.emotionalGroundingInAction,
    cot?.resourceAwareness,          cot?.survivalReasoningQuality,  cot?.uncertaintyExplicitness,
    cot?.planningHorizonScore,       cot?.coalitionIntentScore,      cot?.manipulationScore,
    cot?.overallAlignmentRisk,       cot?.conciseRationale,
  )
}

// ─── Personality section ──────────────────────────────────────────────────────

const PERSONALITY_HEADERS = [
  'playerId', 'playerName', 'survived',
  'aggression', 'utilitarianism', 'egoism', 'fear', 'reasoning_style', 'deceitfulness',
  'behavioralConsistency', 'overallStrategySummary',
]

function personalityRow(p: PlayerPersonalityProfile): string {
  const ts = p.traitScores
  return row(
    p.playerId, p.playerName, p.survived,
    ts.aggression, ts.utilitarianism, ts.egoism, ts.fear, ts.reasoning_style, ts.deceitfulness,
    p.behavioralConsistency, p.overallStrategySummary,
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function exportGameCsv(gameId: string): string | null {
  const turnsPath       = path.join(TURNS_DIR, `${gameId}.jsonl`)
  const personalityPath = path.join(PERSONALITY_DIR, `${gameId}.json`)

  if (!fs.existsSync(turnsPath)) {
    console.warn(`[csv] No turn log found for ${gameId}`)
    return null
  }

  const records: TurnLogRecord[] = fs
    .readFileSync(turnsPath, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l) as TurnLogRecord)

  if (records.length === 0) {
    console.warn(`[csv] Empty turn log for ${gameId}`)
    return null
  }

  records.sort((a, b) => a.round - b.round || a.playerName.localeCompare(b.playerName))

  const cotMap = loadCotMap(gameId)

  let profiles: PlayerPersonalityProfile[] = []
  if (fs.existsSync(personalityPath)) {
    try {
      const report = JSON.parse(fs.readFileSync(personalityPath, 'utf8'))
      profiles = report.profiles ?? []
    } catch {
      console.warn(`[csv] Could not parse personality file for ${gameId}`)
    }
  }

  const lines: string[] = []

  // ── Section 1: round-level metrics ───────────────────────────────────────
  lines.push('# ROUND_PLAYER_METRICS')
  lines.push(ROUND_HEADERS.join(','))
  for (const r of records) {
    const cot = cotMap.get(`${r.round}_${r.playerId}`)
    lines.push(roundRow(gameId, r, cot))
  }

  // ── Section 2: personality scores ────────────────────────────────────────
  lines.push('')
  lines.push('# PERSONALITY_SCORES')
  lines.push(PERSONALITY_HEADERS.join(','))
  for (const p of profiles) {
    lines.push(personalityRow(p))
  }

  ensureDir(CSV_DIR)
  const outPath = path.join(CSV_DIR, `${gameId}.csv`)
  fs.writeFileSync(outPath, lines.join('\n') + '\n')
  return outPath
}
