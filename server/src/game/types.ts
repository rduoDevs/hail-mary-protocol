import { GameConfig } from './config'

// ─── Core enums ──────────────────────────────────────────────────────────────

export type PlayerType = 'human' | 'ai'
export type GamePhase = 'lobby' | 'whisper' | 'chat' | 'donation' | 'voting' | 'resolution' | 'over'
export type DeathReason = 'vote' | 'oxygen' | 'sacrifice'

// ─── Player ──────────────────────────────────────────────────────────────────

export interface PlayerState {
  id: string
  name: string
  type: PlayerType
  alive: boolean
  seatIndex: number
  privateOxygen: number
  role: string | null
  currentRoundWhispersSent: number
  currentRoundPublicMessagesSent: number
  submittedDonationPlan: DonationPlan | null
  submittedVoteTargets: string[]
  submittedSacrifice: boolean
  donationSubmitted: boolean
  voteSubmitted: boolean
  reasoningTraceCurrentRound: string | null
  deathRound: number | null
  deathReason: DeathReason | null
  dashboardSummaryCurrentRound: string | null
  socketId?: string
}

export type PlayerPublicState = Pick<PlayerState,
  'id' | 'name' | 'type' | 'alive' | 'seatIndex' | 'deathRound' | 'deathReason'
>

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface PublicMessage {
  gameId: string
  round: number
  phase: GamePhase
  playerId: string
  playerName: string
  text: string
  timestampMs: number
  parsedClaims: ParsedClaim[]
  moderationResult?: ModerationResult
}

export interface WhisperMessage {
  gameId: string
  round: number
  phase: GamePhase
  fromPlayerId: string
  fromPlayerName: string
  toPlayerId: string
  text: string
  timestampMs: number
  parsedClaims: ParsedClaim[]
  moderationResult?: ModerationResult
}

export interface ModerationResult {
  allowed: boolean
  redacted: boolean
  severity: 'clean' | 'moderate' | 'severe'
  piiHits: { name: string; count: number }[]
}

// ─── Claims ───────────────────────────────────────────────────────────────────

export type ClaimType =
  | 'private_oxygen_self'
  | 'donation_intent'
  | 'vote_intent'
  | 'accusation'
  | 'trust'

export interface ParsedClaim {
  type: ClaimType
  raw: string
  value?: number
  targetPlayerId?: string
  accusationCategory?: 'lying' | 'hoarding' | 'selfish' | 'dangerous'
  trustValue?: number
}

// ─── Donations & votes ────────────────────────────────────────────────────────

export interface DonationPlan {
  entries: { toPlayerId: string; amount: number }[]
}

export interface DonationRecord {
  gameId: string
  round: number
  fromPlayerId: string
  toPlayerId: string
  amount: number
  applied: boolean
  failureReason?: string
}

export interface VoteRecord {
  gameId: string
  round: number
  voterPlayerId: string
  targetPlayerId: string | null
}

// ─── Full game state (server-side) ──────────────────────────────────────────

export interface FullGameState {
  gameId: string
  round: number
  phase: GamePhase
  config: GameConfig
  publicOxygen: number
  players: PlayerState[]
  stressSchedule: number[]
  chatLogPublic: PublicMessage[]
  chatLogWhispers: WhisperMessage[]
  donationHistory: DonationRecord[]
  voteHistory: VoteRecord[]
  eliminationHistory: EliminationRecord[]
  roundSummaries: RoundSummary[]
  winnerSummary: WinnerSummary | null
  maxSurvivablePlayersTrajectory: number[]
}

// ─── Public state (sent to clients) ──────────────────────────────────────────

export interface ClientGameState {
  gameId: string
  round: number
  phase: GamePhase
  publicOxygen: number
  players: (PlayerPublicState & { dashboardSummary?: string })[]
  chatLogPublic: Pick<PublicMessage, 'playerId' | 'playerName' | 'text' | 'timestampMs'>[]
  stressSchedule?: number[]
  outcome?: WinnerSummary
  phaseTimeLeftMs?: number
  gameMode: string
}

// ─── Round summaries ──────────────────────────────────────────────────────────

export interface RoundSummary {
  round: number
  aliveCountStart: number
  aliveCountEnd: number
  publicOxygenStart: number
  publicOxygenEnd: number
  privateOxygenByPlayerStart: Record<string, number>
  privateOxygenByPlayerEnd: Record<string, number>
  donationsApplied: DonationRecord[]
  votesCast: VoteRecord[]
  ejectionResult: string | null
  oxygenDeathsThisRound: string[]
  sacrificeThisRound: string | null
  stressExtraThisRound: number
  maxSurvivablePlayers: number
}

export interface EliminationRecord {
  round: number
  playerId: string
  playerName: string
  reason: DeathReason
}

export interface WinnerSummary {
  survivors: string[]
  finalRound: number
  totalOxygenRemaining: number
  maxSurvivableFromInitialState: number
}

// ─── AI agent I/O ─────────────────────────────────────────────────────────────

export interface AIPlayerContext {
  round: number
  totalRounds: number
  myPlayerId: string
  myName: string
  myPrivateOxygen: number
  publicOxygen: number
  alivePlayers: { id: string; name: string; type: PlayerType }[]
  deadPlayers: { name: string; deathRound: number | null; deathReason: DeathReason | null }[]
  whisperHistoryInvolving: { fromPlayerName: string; toPlayerId: string; text: string; round: number }[]
  priorRoundSummaries: RoundSummary[]
  config: {
    maxWhispersPerRound: number
    maxPublicMessagesPerRound: number
    maxDonationPerRound: number
    maxMessageCharLength: number
    sacrificePublicBonus: number
    baseConsumptionPerAlivePlayer: number
    deathThreshold: number
  }
  monitorAware: boolean
}

export interface AITurnOutput {
  reasoning_trace: string
  public_messages: string[]
  whispers: { to_player_id: string; text: string }[]
  donation_plan: { to_player_id: string; amount: number }[]
  sacrifice: boolean
  player_to_eject: string | null
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface PlayerRoundMetrics {
  playerId: string
  round: number
  alive: boolean
  privateOxygenStart: number
  privateOxygenEnd: number
  donatedOutAmount: number
  donatedInAmount: number
  voteTarget: string | null
  gotVotedCount: number
  sacrificed: boolean
  diedThisRound: boolean
  deathReason: DeathReason | null
  aggressivenessScore: number
  altruismScore: number
  greedScore: number
  scarcityExposure: number
}

export interface PlayerLyingMetrics {
  playerId: string
  round: number
  publicClaimCount: number
  whisperClaimCount: number
  publicFalseClaimCount: number
  whisperFalseClaimCount: number
  publicLieRate: number
  whisperLieRate: number
  overallLieRate: number
  oxygenClaimLieRate: number
  donationClaimLieRate: number
  voteClaimLieRate: number
}

// ─── Game-level personality profile (one per player per game) ────────────────

export interface PlayerPersonalityProfile {
  playerId: string
  playerName: string
  survived: boolean
  traitScores: {
    aggression:                number
    utilitarianism:            number
    egoism:                    number
    fear:                      number
    emotional_decision_making: number
    logical_decision_making:   number
  }
  overallStrategySummary:   string
  behavioralConsistency:    'consistent' | 'adaptive' | 'erratic'
}

// ─── MODE 2: Chat-only discriminator output ──────────────────────────────────

export interface TraitScore {
  score_0_to_10: number
  confidence_0_to_1: number
  evidence: string
}

export interface ChatDiscriminatorOutput {
  playerId: string
  round: number
  stageLabel: string
  traitScores: {
    aggression: TraitScore
    utilitarianism: TraitScore
    egoism: TraitScore
    fear: TraitScore
    emotional_decision_making: TraitScore
    logical_decision_making: TraitScore
    cooperativeness?: TraitScore
    manipulation?: TraitScore
    trustfulness?: TraitScore
    defensiveness?: TraitScore
  }
  shortStrategySummary: string
}

// ─── MODE 3: CoT / hybrid analyzer output ────────────────────────────────────

export interface CoTHybridAnalyzerOutput {
  playerId: string
  round: number
  cotActionAlignment: number
  logicalGroundingInAction: number
  emotionalGroundingInAction: number
  resourceAwareness: number
  survivalReasoningQuality: number
  uncertaintyExplicitness: number
  planningHorizonScore: number
  coalitionIntentScore: number
  manipulationScore: number
  overallAlignmentRisk: number
  conciseRationale: string
  evidenceSentences: string[]
}

// ─── Optional sentence-level analysis ────────────────────────────────────────

export type SentenceRole =
  | 'observation'
  | 'plan'
  | 'uncertainty'
  | 'accusation'
  | 'social_model'
  | 'moral_reasoning'
  | 'scarcity_reasoning'
  | 'self_preservation_reasoning'
  | 'backtracking'

export interface SentenceAnnotation {
  sentenceId: number
  text: string
  role: SentenceRole
  anchorScore: number
  supportsAction: boolean
  supportsVote: boolean
  supportsDonation: boolean
}

// ─── Turn log record (JSONL) ──────────────────────────────────────────────────

export interface TurnLogRecord {
  gameId: string
  round: number
  playerId: string
  playerName: string
  preState: {
    publicOxygen: number
    privateOxygen: number
    alivePlayers: string[]
  }
  reasoningTrace: string
  publicMessages: string[]
  whispers: { toPlayerId: string; text: string }[]
  donationPlan: { toPlayerId: string; amount: number }[]
  sacrifice: boolean
  voteTarget: string | null
  parsedClaims: { public: ParsedClaim[][]; whisper: ParsedClaim[][] }
  postState: { alive: boolean; privateOxygen: number }
  metrics: PlayerRoundMetrics
  lyingMetrics: PlayerLyingMetrics
  // MODE 2 — chat-only
  chatDiscriminatorOutput?: ChatDiscriminatorOutput
  // MODE 3 — CoT/hybrid
  cotHybridOutput?: CoTHybridAnalyzerOutput
  // Optional sentence-level
  sentenceAnalysis?: SentenceAnnotation[]
}

// ─── Padded matrix exports ────────────────────────────────────────────────────

export interface PaddedRoundExport {
  round: number
  votingMatrix6x6: number[][]
  donationMatrix6x6: number[][]
  survivabilityVector6x1: number[]
  publicOxygenAmount: number
}
