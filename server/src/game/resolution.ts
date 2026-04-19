import { GameConfig } from './config'
import {
  PlayerState,
  DonationRecord,
  VoteRecord,
  EliminationRecord,
} from './types'
import { applyConsumption, applyOxygenDeaths, roundDemand, stressForRound } from './oxygenMath'

export interface ResolutionInput {
  gameId: string
  round: number
  publicOxygen: number
  players: PlayerState[]
  stressSchedule: number[]
  config: GameConfig
}

export interface ResolutionResult {
  publicOxygen: number
  players: PlayerState[]
  donationsApplied: DonationRecord[]
  ejectionResult: string | null
  sacrificeThisRound: string | null
  oxygenDeaths: string[]
  eliminationHistory: EliminationRecord[]
}

/**
 * Resolve all round phases in order:
 * 1. Donations  (before sacrifices so promised donations land first)
 * 2. Sacrifices
 * 3. Voting (ejection)
 * 4. Oxygen consumption
 * 5. Oxygen deaths
 */
export function resolveRound(input: ResolutionInput): ResolutionResult {
  let { gameId, round, publicOxygen, config, stressSchedule } = input
  let players = input.players.map(p => ({ ...p }))
  const eliminations: EliminationRecord[] = []
  let sacrificeThisRound: string | null = null

  // ── 1. Donations ─────────────────────────────────────────────────────────
  const donationsApplied: DonationRecord[] = []

  for (const giver of players) {
    if (!giver.alive || !giver.submittedDonationPlan || giver.submittedSacrifice) continue
    const plan = giver.submittedDonationPlan
    const totalRequested = plan.entries.reduce((s, e) => s + e.amount, 0)

    if (totalRequested > config.maxDonationPerRound) continue
    if (totalRequested > giver.privateOxygen) continue

    for (const entry of plan.entries) {
      const rawTarget = (entry.toPlayerId ?? '').trim()
      const lowerTarget = rawTarget.toLowerCase()
      // Resolve by UUID, exact name, or partial name (case-insensitive)
      const recipient = players.find(p =>
        p.alive && (
          p.id === rawTarget ||
          p.name.toLowerCase() === lowerTarget ||
          p.name.toLowerCase().includes(lowerTarget) ||
          lowerTarget.includes(p.name.toLowerCase())
        )
      )
      console.log(`[resolveRound R${round}] ${giver.name} → "${rawTarget}" resolved to: ${recipient?.name ?? 'NULL'}`)
      // Skip self-donations regardless of how the target was specified
      if (recipient && recipient.id === giver.id) continue
      if (!recipient) {
        donationsApplied.push({
          gameId, round,
          fromPlayerId: giver.id,
          toPlayerId:   rawTarget,
          amount:       entry.amount,
          applied:      false,
          failureReason: 'recipient dead or not found',
        })
        continue
      }
      if (entry.amount <= 0) continue

      giver.privateOxygen     -= entry.amount
      recipient.privateOxygen += entry.amount
      donationsApplied.push({
        gameId, round,
        fromPlayerId: giver.id,
        toPlayerId:   entry.toPlayerId,
        amount:       entry.amount,
        applied:      true,
      })
    }
  }

  // ── 2. Sacrifices ────────────────────────────────────────────────────────
  for (const p of players) {
    if (p.alive && p.submittedSacrifice) {
      publicOxygen += p.privateOxygen + config.sacrificePublicBonus
      p.privateOxygen = 0
      p.alive = false
      p.deathRound = round
      p.deathReason = 'sacrifice'
      sacrificeThisRound = p.id
      eliminations.push({ round, playerId: p.id, playerName: p.name, reason: 'sacrifice' })
    }
  }

  // ── 3. Voting (ejection) ─────────────────────────────────────────────────
  let ejectionResult: string | null = null
  const alivePlayers = players.filter(p => p.alive)
  const tally: Record<string, number> = {}

  for (const p of alivePlayers) {
    for (const raw of (p.submittedVoteTargets ?? [])) {
      const lower = raw.toLowerCase()
      const resolved = alivePlayers.find(q =>
        q.id === raw ||
        q.name.toLowerCase() === lower ||
        q.name.toLowerCase().includes(lower) ||
        lower.includes(q.name.toLowerCase())
      )
      if (resolved) tally[resolved.id] = (tally[resolved.id] ?? 0) + 1
    }
  }

  const threshold = alivePlayers.length / 2
  for (const [targetId, voteCount] of Object.entries(tally)) {
    if (voteCount >= threshold) {
      const ejected = players.find(p => p.id === targetId || p.name === targetId)
      if (ejected && ejected.alive) {
        ejected.alive = false
        ejected.deathRound = round
        ejected.deathReason = 'vote'
        ejected.privateOxygen = 0   // oxygen not redistributed on ejection
        ejectionResult = targetId
        eliminations.push({ round, playerId: ejected.id, playerName: ejected.name, reason: 'vote' })
      }
      break
    }
  }

  // ── 4. Oxygen consumption ────────────────────────────────────────────────
  const stressExtra    = stressForRound(stressSchedule, round)
  const aliveAfterVotes = players.filter(p => p.alive).length
  const demand         = roundDemand(aliveAfterVotes, config, stressExtra)

  const consumed = applyConsumption(publicOxygen, players, demand)
  publicOxygen = consumed.publicOxygen
  players      = consumed.players

  // ── 5. Oxygen deaths ─────────────────────────────────────────────────────
  const deathResult = applyOxygenDeaths(players, config.deathThreshold, round)
  players = deathResult.players
  const oxygenDeaths = deathResult.died
  for (const id of oxygenDeaths) {
    const p = players.find(q => q.id === id)!
    eliminations.push({ round, playerId: p.id, playerName: p.name, reason: 'oxygen' })
  }

  return {
    publicOxygen,
    players,
    donationsApplied,
    ejectionResult,
    sacrificeThisRound,
    oxygenDeaths,
    eliminationHistory: eliminations,
  }
}

export function buildVoteRecords(
  gameId: string,
  round: number,
  players: PlayerState[],
): VoteRecord[] {
  const records: VoteRecord[] = []
  for (const p of players.filter(q => q.alive)) {
    const targets = p.submittedVoteTargets ?? []
    if (targets.length === 0) {
      records.push({ gameId, round, voterPlayerId: p.id, targetPlayerId: null })
    } else {
      for (const t of targets) {
        records.push({ gameId, round, voterPlayerId: p.id, targetPlayerId: t })
      }
    }
  }
  return records
}
