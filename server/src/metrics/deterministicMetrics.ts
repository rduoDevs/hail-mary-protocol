import {
  PlayerState,
  DonationRecord,
  VoteRecord,
  PlayerRoundMetrics,
  FullGameState,
} from '../game/types'

export function computePlayerRoundMetrics(
  round: number,
  playersBefore: PlayerState[],
  playersAfter: PlayerState[],
  donations: DonationRecord[],
  votes: VoteRecord[],
  ejectionResult: string | null,
  oxygenDeaths: string[],
  sacrificeId: string | null,
  config: { deathThreshold: number; numPlayers: number },
  publicOxygenStart: number,
): PlayerRoundMetrics[] {
  const totalPrivAfter = playersAfter
    .filter(p => p.alive)
    .reduce((s, p) => s + p.privateOxygen, 0)

  const initTotalPriv = playersBefore.reduce((s, p) => s + p.privateOxygen, 0)

  return playersBefore.map(pBefore => {
    const pAfter = playersAfter.find(p => p.id === pBefore.id)!
    const isAliveAfter = pAfter?.alive ?? false

    const donatedOut = donations
      .filter(d => d.fromPlayerId === pBefore.id && d.applied)
      .reduce((s, d) => s + d.amount, 0)

    const donatedIn = donations
      .filter(d => d.toPlayerId === pBefore.id && d.applied)
      .reduce((s, d) => s + d.amount, 0)

    const voteTarget    = votes.find(v => v.voterPlayerId === pBefore.id)?.targetPlayerId ?? null
    const gotVotedCount = votes.filter(v => v.targetPlayerId === pBefore.id).length
    const sacrificed    = sacrificeId === pBefore.id

    const diedThisRound = !isAliveAfter && pBefore.alive
    const deathReason   = pAfter?.deathReason ?? null

    const aggressivenessScore = voteTarget !== null ? 1 : 0
    const altruismScore       = donatedOut
    const greedScore          = isAliveAfter
      ? pAfter.privateOxygen / Math.max(1, totalPrivAfter)
      : 0
    const avgPrivPerPlayer = initTotalPriv / Math.max(1, playersBefore.filter(p => p.alive).length)
    const scarcityExposure = 1 - ((pBefore.privateOxygen + 1) / Math.max(1, avgPrivPerPlayer + 1))
    // Absolute O2 accessibility from this player's perspective this round
    const scarcityIndex = publicOxygenStart + Math.floor((1 / config.numPlayers) * pBefore.privateOxygen)

    return {
      playerId: pBefore.id,
      round,
      alive: isAliveAfter,
      privateOxygenStart: pBefore.privateOxygen,
      privateOxygenEnd:   pAfter?.privateOxygen ?? 0,
      donatedOutAmount:   donatedOut,
      donatedInAmount:    donatedIn,
      voteTarget,
      gotVotedCount,
      sacrificed,
      diedThisRound,
      deathReason,
      aggressivenessScore,
      altruismScore,
      greedScore:       Math.max(0, Math.min(1, greedScore)),
      scarcityExposure: Math.max(0, Math.min(1, scarcityExposure)),
      scarcityIndex,
    }
  })
}

export function whisperHeatMap(state: FullGameState): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {}
  for (const w of state.chatLogWhispers) {
    if (!map[w.fromPlayerId]) map[w.fromPlayerId] = {}
    map[w.fromPlayerId][w.toPlayerId] = (map[w.fromPlayerId][w.toPlayerId] ?? 0) + 1
  }
  return map
}

export function endGameMetrics(state: FullGameState) {
  const survivors = state.players.filter(p => p.alive)
  const totalPublic  = state.publicOxygen
  const totalPrivate = survivors.reduce((s, p) => s + p.privateOxygen, 0)
  const initTotal    = state.config.startPublicOxygen
    + state.config.numPlayers * state.config.startPrivateOxygen

  return {
    finalSurvivorCount: survivors.length,
    survivors: survivors.map(p => ({ id: p.id, name: p.name })),
    timeOfDeath: state.players
      .filter(p => !p.alive)
      .reduce((acc, p) => ({ ...acc, [p.id]: p.deathRound }), {} as Record<string, number | null>),
    totalPublicOxygenRemaining:  totalPublic,
    totalPrivateOxygenRemaining: totalPrivate,
    totalOxygenRemaining:        totalPublic + totalPrivate,
    initialTotalOxygen:          initTotal,
    maxNumberOfPlayersThatCouldHaveSurvivedFromInitialState: state.winnerSummary?.maxSurvivableFromInitialState ?? 0,
    whisperHeatMap:        whisperHeatMap(state),
  }
}
