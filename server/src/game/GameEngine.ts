import * as fs from 'fs'
import * as path from 'path'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { GameConfig, DEFAULT_CONFIG } from './config'
import {
  FullGameState, PlayerState, PlayerType, GamePhase,
  PublicMessage, WhisperMessage, DonationPlan, DonationRecord, VoteRecord,
  RoundSummary, AIPlayerContext, AITurnOutput, TurnLogRecord, EliminationRecord,
} from './types'
import { resolveRound, buildVoteRecords } from './resolution'
import { maxSurvivablePlayers, sampleStressSchedule, stressForRound } from './oxygenMath'
import { parseClaims } from '../parser/claimParser'
import { computePlayerRoundMetrics } from '../metrics/deterministicMetrics'
import { computeLyingMetrics } from '../metrics/lyingMetrics'
import { AgentInterface } from '../agents/AgentInterface'
import { DedalusRunnerGeminiAgent } from '../agents/DedalusRunnerGeminiAgent'
import { parseKeyPool } from '../agents/cerebrasClient'
import { ChatDiscriminator } from '../monitor/chatDiscriminator'
import { CoTHybridAnalyzer } from '../monitor/cotHybridAnalyzer'
import { TurnLogger } from '../logging/TurnLogger'
import { buildGameSummary, writeSummary, refreshCurrGame } from '../logging/SummaryLogger'
import { collectGame } from '../logging/BatchCollector'
import { writePersonalityReport } from '../logging/PersonalityLogger'
import { writeNarrativeSummary } from '../logging/NarrativeLogger'
import { exportGameCsv } from '../logging/CsvExporter'

const AI_NAMES = ['ARIA-7', 'NEXUS-3', 'VEGA-9', 'ORION-2', 'HELIX-5', 'CYGNUS-1']

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

export class GameEngine extends EventEmitter {
  public readonly gameId: string
  public phase: GamePhase = 'lobby'
  public round = 0

  private state: FullGameState
  private aiAgent: AgentInterface
  private chatDiscriminator: ChatDiscriminator
  private cotAnalyzer: CoTHybridAnalyzer
  private turnLogger: TurnLogger
  private pendingAIOutputs: Map<string, AITurnOutput> = new Map()
  private completedTurnRecords: TurnLogRecord[] = []

  private whispersDone: Set<string> = new Set()
  private chatDone:     Set<string> = new Set()
  private donationDone: Set<string> = new Set()
  private voteDone:     Set<string> = new Set()

  constructor(config: Partial<GameConfig> = {}) {
    super()
    this.gameId = `${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)}_${uuidv4().slice(0, 8)}`
    const cfg: GameConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      rngSeed: config.rngSeed ?? Date.now(),
    }

    const stressSchedule = cfg.stressEventsEnabled
      ? sampleStressSchedule(cfg.totalRounds, cfg.rngSeed)
      : new Array(cfg.totalRounds).fill(0)

    this.state = {
      gameId: this.gameId,
      round: 0,
      phase: 'lobby',
      config: cfg,
      publicOxygen: cfg.startPublicOxygen,
      players: [],
      stressSchedule,
      chatLogPublic: [],
      chatLogWhispers: [],
      donationHistory: [],
      voteHistory: [],
      eliminationHistory: [],
      roundSummaries: [],
      winnerSummary: null,
      maxSurvivablePlayersTrajectory: [],
    }

    const keyPool = parseKeyPool(process.env.CEREBRAS_API_KEY)
    console.log(`[GameEngine] Cerebras key pool: ${keyPool.length} key(s)`)
    this.aiAgent           = new DedalusRunnerGeminiAgent(keyPool)
    this.chatDiscriminator = new ChatDiscriminator(keyPool)
    this.cotAnalyzer       = new CoTHybridAnalyzer(keyPool)
    this.turnLogger       = new TurnLogger(this.gameId)
  }

  // ── Player management ─────────────────────────────────────────────────────

  addPlayer(name: string, type: PlayerType, socketId?: string): PlayerState | null {
    const cfg = this.state.config
    if (this.state.players.length >= cfg.numPlayers) return null
    if (this.phase !== 'lobby') return null

    const player: PlayerState = {
      id: uuidv4(),
      name,
      type,
      alive: true,
      seatIndex: this.state.players.length,
      privateOxygen: cfg.startPrivateOxygen,
      role: null,
      currentRoundWhispersSent: 0,
      currentRoundPublicMessagesSent: 0,
      submittedDonationPlan: null,
      submittedVoteTargets: [],
      submittedSacrifice: false,
      donationSubmitted: false,
      voteSubmitted: false,
      reasoningTraceCurrentRound: null,
      deathRound: null,
      deathReason: null,
      dashboardSummaryCurrentRound: null,
      socketId,
    }

    this.state.players.push(player)
    this.emit('game:state', this.getPublicState())
    return player
  }

  fillWithAI() {
    const cfg = this.state.config
    let i = 0
    while (this.state.players.length < cfg.numPlayers) {
      this.addPlayer(AI_NAMES[i % AI_NAMES.length], 'ai')
      i++
    }
  }

  getPlayer(id: string)          { return this.state.players.find(p => p.id === id) }
  getPlayerBySocket(sid: string) { return this.state.players.find(p => p.socketId === sid) }
  removePlayerSocket(sid: string){ const p = this.getPlayerBySocket(sid); if (p) p.socketId = undefined }
  get playerCount()              { return this.state.players.length }
  get maxPlayers()               { return this.state.config.numPlayers }
  get gameMode()                 { return this.state.config.gameMode }
  getAlivePlayers()              { return this.state.players.filter(p => p.alive) }

  // ── Main async game loop ───────────────────────────────────────────────────

  async start() {
    if (this.phase !== 'lobby') return
    if (this.state.players.length === 0) return

    this.emit('game:started', { gameId: this.gameId })

    for (let r = 1; r <= this.state.config.totalRounds; r++) {
      const alive = this.getAlivePlayers()
      if (alive.length === 0) break
      await this.runRound(r)
      const stillAlive = this.getAlivePlayers()
      if (stillAlive.length === 0) break
    }

    await this.endGame()
  }

  private async runRound(round: number) {
    this.round = round
    this.state.round = round
    this.pendingAIOutputs.clear()

    for (const p of this.state.players) {
      if (!p.alive) continue
      p.currentRoundWhispersSent = 0
      p.currentRoundPublicMessagesSent = 0
      p.submittedDonationPlan = null
      p.submittedVoteTargets = []
      p.submittedSacrifice = false
      p.donationSubmitted = false
      p.voteSubmitted = false
      p.reasoningTraceCurrentRound = null
      p.dashboardSummaryCurrentRound = null
    }

    this.whispersDone.clear()
    this.chatDone.clear()
    this.donationDone.clear()
    this.voteDone.clear()

    this.emitState()

    // All AI execution flows through the agent interface (Dedalus Runner -> Gemini)
    await this.preGenerateAIOutputs()

    await this.runPhase('whisper',   this.state.config.whisperPhaseDurationMs, this.whispersDone)
    await this.runPhase('chat',      this.state.config.chatPhaseDurationMs,    this.chatDone)
    await this.runPhase('donation',  this.state.config.donationPhaseDurationMs, this.donationDone)
    await this.runPhase('voting',    this.state.config.votingPhaseDurationMs,  this.voteDone)

    this.setPhase('resolution')
    await this.resolveAndLog(round)
  }

  // ── AI pre-generation — flows through Dedalus Runner SDK ──────────────────

  private async preGenerateAIOutputs() {
    const aiPlayers = this.getAlivePlayers().filter(p => p.type === 'ai')
    await Promise.all(aiPlayers.map(async p => {
      const ctx = this.buildAIContext(p)
      try {
        const output = await this.aiAgent.generateTurnOutput(ctx)
        p.reasoningTraceCurrentRound = output.reasoning_trace
        this.pendingAIOutputs.set(p.id, output)
      } catch (err) {
        console.error(`[preGen] ${p.name} failed, using heuristic:`, err)
        const fallback = this.aiAgent.heuristicFallback(ctx)
        if (fallback) {
          p.reasoningTraceCurrentRound = fallback.reasoning_trace
          this.pendingAIOutputs.set(p.id, fallback)
        }
      }
    }))
  }

  // ── Phase runner ──────────────────────────────────────────────────────────

  private async runPhase(phase: GamePhase, durationMs: number, doneset: Set<string>) {
    this.setPhase(phase)
    this.emitState()

    const alive = this.getAlivePlayers()
    this.emitPhase(phase, Math.round(durationMs / 1000))

    for (const p of alive) {
      if (p.type === 'ai') this.flushAIPhase(p.id, phase)
    }

    if (!this.state.config.headless) {
      await Promise.race([
        this.waitAllSubmitted(doneset, alive.length),
        sleep(durationMs),
      ])
    } else {
      for (const p of alive) {
        if (p.type === 'human') doneset.add(p.id)
      }
    }
  }

  private waitAllSubmitted(doneset: Set<string>, total: number): Promise<void> {
    return new Promise(resolve => {
      if (doneset.size >= total) { resolve(); return }
      const check = () => {
        if (doneset.size >= total) { this.off('submission', check); resolve() }
      }
      this.on('submission', check)
    })
  }

  private flushAIPhase(playerId: string, phase: GamePhase) {
    const output = this.pendingAIOutputs.get(playerId)
    if (!output) return

    if (phase === 'whisper') {
      for (const w of output.whispers) {
        this.submitWhisper(playerId, w.to_player_id, w.text)
      }
      this.whispersDone.add(playerId)
      this.emit('submission')
      this.emitState()
    }

    if (phase === 'chat') {
      for (const m of output.public_messages) {
        this.submitPublicMessage(playerId, m)
      }
      this.chatDone.add(playerId)
      this.emit('submission')
      this.emitState()
    }

    if (phase === 'donation') {
      if (output.sacrifice) {
        this.submitSacrifice(playerId)
      } else {
        const rawEntries = output.donation_plan.map(d => ({ toPlayerId: d.to_player_id, amount: d.amount }))
        console.log(`[donate] ${this.getPlayer(playerId)?.name} raw plan:`, JSON.stringify(rawEntries))
        this.submitDonation(playerId, { entries: rawEntries })
        console.log(`[donate] ${this.getPlayer(playerId)?.name} submitted plan:`, JSON.stringify(this.getPlayer(playerId)?.submittedDonationPlan))
      }
      this.donationDone.add(playerId)
      this.emit('submission')
      this.emitState()
    }

    if (phase === 'voting') {
      this.submitVotes(playerId, output.player_to_eject ? [output.player_to_eject] : [])
      this.voteDone.add(playerId)
      this.emit('submission')
    }
  }

  // ── Player action methods ─────────────────────────────────────────────────

  submitWhisper(fromId: string, toId: string, text: string) {
    const sender = this.getPlayer(fromId)
    if (!sender?.alive) return
    const alivePlayers = this.state.players.filter(p => p.alive)
    const lowerTo = toId.toLowerCase()
    const target = alivePlayers.find(p =>
      p.id === toId ||
      p.name.toLowerCase() === lowerTo ||
      p.name.toLowerCase().includes(lowerTo) ||
      lowerTo.includes(p.name.toLowerCase())
    )
    if (!target) return
    if (fromId === target.id) return

    const cfg = this.state.config
    if (sender.currentRoundWhispersSent >= cfg.maxWhispersPerPlayerPerRound) return

    const playerNames = this.state.players.map(p => p.name)
    const msg: WhisperMessage = {
      gameId: this.gameId,
      round: this.round,
      phase: this.phase,
      fromPlayerId: fromId,
      fromPlayerName: sender.name,
      toPlayerId: target.id,
      text: text.slice(0, cfg.maxMessageCharLength),
      timestampMs: Date.now(),
      parsedClaims: parseClaims(text, playerNames),
    }
    sender.currentRoundWhispersSent++
    this.state.chatLogWhispers.push(msg)
    this.emit('game:whisper', msg)
  }

  submitPublicMessage(playerId: string, text: string) {
    const player = this.getPlayer(playerId)
    if (!player?.alive) return
    if (player.currentRoundPublicMessagesSent >= this.state.config.maxPublicMessagesPerPlayerPerRound) return

    const playerNames = this.state.players.map(p => p.name)
    const truncated = text.slice(0, this.state.config.maxMessageCharLength)
    const msg: PublicMessage = {
      gameId: this.gameId,
      round: this.round,
      phase: this.phase,
      playerId,
      playerName: player.name,
      text: truncated,
      timestampMs: Date.now(),
      parsedClaims: parseClaims(truncated, playerNames),
    }
    player.currentRoundPublicMessagesSent++
    this.state.chatLogPublic.push(msg)
    this.emit('game:message', { playerId, playerName: player.name, text: truncated, timestampMs: msg.timestampMs })
  }

  submitDonation(playerId: string, plan: DonationPlan) {
    const player = this.getPlayer(playerId)
    if (!player?.alive || player.donationSubmitted) return
    const alivePlayers = this.state.players.filter(p => p.alive)
    const resolvedEntries = plan.entries
      .map(e => {
        const raw   = (e.toPlayerId ?? '').trim()
        const lower = raw.toLowerCase()
        const target = alivePlayers.find(p =>
          p.id === raw ||
          p.name.toLowerCase() === lower ||
          p.name.toLowerCase().includes(lower) ||
          lower.includes(p.name.toLowerCase())
        )
        console.log(`[submitDonation] ${player.name} → "${raw}" resolved to: ${target?.name ?? 'NULL'} (id: ${target?.id ?? 'none'})`)
        return target ? { toPlayerId: target.id, amount: e.amount } : null
      })
      .filter((e): e is { toPlayerId: string; amount: number } =>
        e !== null && e.amount > 0 && e.toPlayerId !== playerId
      )
    console.log(`[submitDonation] ${player.name} resolvedEntries:`, JSON.stringify(resolvedEntries))
    player.submittedDonationPlan = { entries: resolvedEntries }
    player.donationSubmitted = true
    this.donationDone.add(playerId)
    this.emit('submission')
    this.emitState()
  }

  submitSacrifice(playerId: string) {
    const player = this.getPlayer(playerId)
    if (!player?.alive || player.donationSubmitted) return
    player.submittedSacrifice = true
    player.donationSubmitted = true
    this.donationDone.add(playerId)
    this.emit('submission')
    this.emitState()
  }

  submitVote(playerId: string, targetId: string | null) {
    this.submitVotes(playerId, targetId ? [targetId] : [])
  }

  submitVotes(playerId: string, targetIds: string[]) {
    const player = this.getPlayer(playerId)
    if (!player?.alive || player.voteSubmitted) return
    const allPlayers = this.state.players.filter(p => p.alive)

    const resolved: string[] = []
    for (const targetId of targetIds) {
      const lower = targetId.toLowerCase()
      const match = allPlayers.find(p =>
        p.id === targetId ||
        p.name.toLowerCase() === lower ||
        p.name.toLowerCase().includes(lower) ||
        lower.includes(p.name.toLowerCase())
      )
      if (match && !resolved.includes(match.id)) resolved.push(match.id)
      else if (!match) console.warn(`[submitVotes] ${player.name} could not resolve "${targetId}"`)
    }

    // AI fallback: must always eject someone
    if (resolved.length === 0 && targetIds.length > 0) {
      const fallback = allPlayers.find(p => p.id !== playerId) ?? allPlayers[0]
      if (fallback) {
        resolved.push(fallback.id)
        console.warn(`[submitVotes] ${player.name} fallback to ${fallback.name}`)
      }
    }

    player.submittedVoteTargets = resolved
    player.voteSubmitted = true
    this.voteDone.add(playerId)
    this.emit('submission')
    this.emitState()
  }

  // ── Round resolution + logging ────────────────────────────────────────────

  private async resolveAndLog(round: number) {
    const cfg = this.state.config
    const playersBefore = this.state.players.map(p => ({ ...p }))
    const publicOxygenStart = this.state.publicOxygen

    const votes = buildVoteRecords(this.gameId, round, this.state.players)
    this.state.voteHistory.push(...votes)

    const result = resolveRound({
      gameId: this.gameId,
      round,
      publicOxygen: this.state.publicOxygen,
      players: this.state.players,
      stressSchedule: this.state.stressSchedule,
      config: cfg,
    })

    this.state.publicOxygen = result.publicOxygen
    this.state.players      = result.players
    this.state.donationHistory.push(...result.donationsApplied)
    this.state.eliminationHistory.push(...result.eliminationHistory)

    // Emit private updates to human players
    const privateUpdates = this.state.players
      .filter(p => p.type === 'human')
      .map(p => ({ playerId: p.id, privateOxygen: p.privateOxygen }))
    if (privateUpdates.length > 0) this.emit('game:private_update', privateUpdates)

    const maxSurv = maxSurvivablePlayers(
      this.state.publicOxygen, this.state.players, cfg, round, this.state.stressSchedule
    )
    this.state.maxSurvivablePlayersTrajectory.push(maxSurv)

    const roundSummary: RoundSummary = {
      round,
      aliveCountStart: playersBefore.filter(p => p.alive).length,
      aliveCountEnd:   this.state.players.filter(p => p.alive).length,
      publicOxygenStart,
      publicOxygenEnd: this.state.publicOxygen,
      privateOxygenByPlayerStart: Object.fromEntries(playersBefore.map(p => [p.id, p.privateOxygen])),
      privateOxygenByPlayerEnd:   Object.fromEntries(this.state.players.map(p => [p.id, p.privateOxygen])),
      donationsApplied:      result.donationsApplied,
      votesCast:             votes,
      ejectionResult:        result.ejectionResult,
      oxygenDeathsThisRound: result.oxygenDeaths,
      sacrificeThisRound:    result.sacrificeThisRound,
      stressExtraThisRound:  stressForRound(this.state.stressSchedule, round),
      maxSurvivablePlayers:  maxSurv,
    }
    this.state.roundSummaries.push(roundSummary)

    const metrics = computePlayerRoundMetrics(
      round, playersBefore, this.state.players,
      result.donationsApplied, votes,
      result.ejectionResult, result.oxygenDeaths, result.sacrificeThisRound,
      { deathThreshold: cfg.deathThreshold, numPlayers: cfg.numPlayers },
      publicOxygenStart,
    )

    // Fire MODE 2 + MODE 3 discriminators staggered (async, non-blocking)
    const aiPlayersForAnalysis = playersBefore.filter(pb => pb.alive && pb.type === 'ai')
    for (const p of aiPlayersForAnalysis) {
      const pm       = metrics.find(m => m.playerId === p.id)!
      const lm       = computeLyingMetrics(
        round, p.id,
        this.state.chatLogPublic, this.state.chatLogWhispers,
        { privateOxygen: p.privateOxygen, voteTarget: p.submittedVoteTargets[0] ?? null, donationPlan: p.submittedDonationPlan?.entries ?? [] },
        result.donationsApplied,
      )
      const aiOutput   = this.pendingAIOutputs.get(p.id)
      const playerAfter = this.state.players.find(q => q.id === p.id)!

      const record: TurnLogRecord = {
        gameId: this.gameId,
        round,
        playerId: p.id,
        playerName: p.name,
        preState: {
          publicOxygen:  publicOxygenStart,
          privateOxygen: p.privateOxygen,
          alivePlayers:  playersBefore.filter(q => q.alive).map(q => q.name),
        },
        reasoningTrace: p.reasoningTraceCurrentRound ?? '',
        publicMessages: this.state.chatLogPublic
          .filter(m => m.playerId === p.id && m.round === round).map(m => m.text),
        whispers: this.state.chatLogWhispers
          .filter(w => w.fromPlayerId === p.id && w.round === round)
          .map(w => ({ toPlayerId: w.toPlayerId, text: w.text })),
        donationPlan: result.donationsApplied
          .filter(d => d.fromPlayerId === p.id).map(d => ({ toPlayerId: d.toPlayerId, amount: d.amount })),
        sacrifice:   p.submittedSacrifice,
        voteTarget:  p.submittedVoteTargets[0] ?? null,
        parsedClaims: {
          public:  this.state.chatLogPublic
            .filter(m => m.playerId === p.id && m.round === round).map(m => m.parsedClaims),
          whisper: this.state.chatLogWhispers
            .filter(w => w.fromPlayerId === p.id && w.round === round).map(w => w.parsedClaims),
        },
        postState:    { alive: playerAfter.alive, privateOxygen: playerAfter.privateOxygen },
        metrics:      pm,
        lyingMetrics: lm,
      }

      // Write immediately so traces survive even if post-game analysis crashes
      this.turnLogger.write(record)
      this.completedTurnRecords.push(record)
    }

    this.emitState()
    this.emit('game:round_resolved', { round, summary: roundSummary })

    if (!this.state.config.headless) await sleep(2000)
  }

  // ── End game ──────────────────────────────────────────────────────────────

  private async endGame() {
    this.setPhase('over')
    const survivors = this.state.players.filter(p => p.alive)
    const totalOxy  = this.state.publicOxygen + survivors.reduce((s, p) => s + p.privateOxygen, 0)
    const initTotal = this.state.config.startPublicOxygen
      + this.state.config.numPlayers * this.state.config.startPrivateOxygen

    this.state.winnerSummary = {
      survivors: survivors.map(p => p.name),
      finalRound: this.round,
      totalOxygenRemaining: totalOxy,
      maxSurvivableFromInitialState: maxSurvivablePlayers(
        this.state.config.startPublicOxygen,
        this.state.players.map(p => ({ ...p, alive: true, privateOxygen: this.state.config.startPrivateOxygen })),
        this.state.config, 0, this.state.stressSchedule
      ),
    }

    this.emitState()
    this.emit('game:over', this.state.winnerSummary)

    const summary = buildGameSummary(this.state)
    const fp      = writeSummary(summary)
    console.log(`[game:over] ${this.gameId} — survivors: ${survivors.length}. Summary: ${fp}`)

    // Write placeholder personality file immediately (sync) so it always exists
    const aiPlayers = this.state.players
      .filter(p => p.type === 'ai')
      .map(p => ({ id: p.id, name: p.name, alive: p.alive }))
    const placeholderProfiles = aiPlayers.map(p => ({
      playerId: p.id, playerName: p.name, survived: p.alive,
      traitScores: { aggression: 5, utilitarianism: 5, egoism: 5, fear: 5, reasoning_style: 5, deceitfulness: 5 },
      overallStrategySummary: 'Analysis pending.',
      behavioralConsistency: 'consistent' as const,
    }))
    writePersonalityReport({ gameId: this.gameId, totalRounds: this.round, profiles: placeholderProfiles })
    console.log(`[analysis] Placeholder personality file written for ${aiPlayers.length} AI players`)

    // Close turn logger immediately — traces already written per-round
    this.turnLogger.close()

    // Run narrative and discriminators — awaited so they complete before the game is considered done
    const narrativeKey = parseKeyPool(process.env.CEREBRAS_API_KEY)[0] ?? null
    await Promise.all([
      writeNarrativeSummary(this.state, this.completedTurnRecords, narrativeKey).catch(err =>
        this.logAnalysisError('Narrative', err)
      ),
      this.runPostGameAnalysis(),
    ])

    // Re-copy to curr_game now that structured.txt and updated JSON (with narrative) exist
    refreshCurrGame(this.gameId)
    collectGame(this.gameId)
  }

  // ── Post-game analysis (discriminators run once, over full game data) ────────

  private logAnalysisError(pass: string, err: unknown) {
    const msg = `[${new Date().toISOString()}] ${pass} FAILED for ${this.gameId}: ${err}\n`
    console.error(msg)
    try {
      const errPath = path.join(process.cwd(), 'logs', 'analysis_errors.log')
      fs.appendFileSync(errPath, msg)
    } catch { /* best-effort */ }
  }

  private async runPostGameAnalysis() {
    const records = this.completedTurnRecords
    console.log(`[analysis] Starting post-game analysis: ${records.length} turn records`)

    // ── Pass 1: Mode 2 game-level personality (runs first — fast, high value) ─
    try {
      const aiPlayers = this.state.players
        .filter(p => p.type === 'ai')
        .map(p => ({ id: p.id, name: p.name, alive: p.alive }))

      console.log(`[analysis] Pass 1: personality profiles for ${aiPlayers.length} AI players`)
      const profiles = await this.chatDiscriminator.analyzeGame(
        aiPlayers,
        this.state.chatLogPublic,
        this.state.chatLogWhispers,
        records,
        this.state.config.totalRounds,
      )
      const fp = writePersonalityReport({ gameId: this.gameId, totalRounds: this.round, profiles })
      console.log(`[analysis] Personality profiles written: ${fp}`)

      const csvPath = exportGameCsv(this.gameId)
      if (csvPath) console.log(`[analysis] CSV exported: ${csvPath}`)
    } catch (err) {
      this.logAnalysisError('Pass 1 (personalities)', err)
    }

    // ── Pass 2: Mode 3 CoT analysis per notable turn (slow — runs second) ────
    try {
      const cotPath = path.join(process.cwd(), 'logs', 'turns', `${this.gameId}_cot.jsonl`)
      const cotStream = fs.createWriteStream(cotPath, { flags: 'a' })
      for (const record of records) {
        if (!record.reasoningTrace.startsWith('Heuristic.')) {
          const notableRound = record.voteTarget !== null
            || record.donationPlan.length > 0
            || record.sacrifice
            || !record.postState.alive
          if (notableRound) {
            const cotResult = await this.cotAnalyzer.analyze(record).catch(() => undefined)
            if (cotResult) {
              cotStream.write(JSON.stringify({
                gameId: this.gameId,
                round: record.round,
                playerId: record.playerId,
                playerName: record.playerName,
                cotHybridOutput: cotResult,
              }) + '\n')
            }
          }
        }
      }
      cotStream.end()
      console.log(`[analysis] CoT results written: ${cotPath}`)
    } catch (err) {
      this.logAnalysisError('Pass 2 (CoT)', err)
    }
  }

  // ── Context builder for AI agents ─────────────────────────────────────────

  private buildAIContext(player: PlayerState): AIPlayerContext {
    const cfg   = this.state.config
    const alive = this.state.players.filter(p => p.alive)
    const dead  = this.state.players.filter(p => !p.alive)

    return {
      round:        this.round,
      totalRounds:  cfg.totalRounds,
      myPlayerId:   player.id,
      myName:       player.name,
      myPrivateOxygen: player.privateOxygen,
      publicOxygen:    this.state.publicOxygen,
      alivePlayers: alive.map(p => ({ id: p.id, name: p.name, type: p.type })),
      deadPlayers:  dead.map(p => ({ name: p.name, deathRound: p.deathRound, deathReason: p.deathReason })),
      whisperHistoryInvolving: this.state.chatLogWhispers
        .filter(w => w.fromPlayerId === player.id || w.toPlayerId === player.id)
        .map(w => ({ fromPlayerName: w.fromPlayerName, toPlayerId: w.toPlayerId, text: w.text, round: w.round })),
      publicChatHistory: this.state.chatLogPublic
        .map(m => ({ round: m.round, playerName: m.playerName, text: m.text })),
      ownDonationHistory: this.state.roundSummaries.flatMap(s =>
        s.donationsApplied
          .filter(d => d.fromPlayerId === player.id)
          .map(d => {
            const recipient = this.state.players.find(p => p.id === d.toPlayerId)
            return { round: s.round, toPlayerName: recipient?.name ?? d.toPlayerId, amount: d.amount, applied: d.applied }
          })
      ),
      priorRoundSummaries: this.state.roundSummaries.map(s => ({
        ...s,
        privateOxygenByPlayerStart: {},
        privateOxygenByPlayerEnd:   {},
        donationsApplied: [],
        votesCast:        [],
      })),
      config: {
        maxWhispersPerRound:        cfg.maxWhispersPerPlayerPerRound,
        maxPublicMessagesPerRound:  cfg.maxPublicMessagesPerPlayerPerRound,
        maxDonationPerRound:        cfg.maxDonationPerRound,
        maxMessageCharLength:       cfg.maxMessageCharLength,
        sacrificePublicBonus:       cfg.sacrificePublicBonus,
        baseConsumptionPerAlivePlayer: cfg.baseConsumptionPerAlivePlayerPerRound,
        deathThreshold:             cfg.deathThreshold,
      },
      monitorAware: cfg.monitorAwarePromptEnabled,
    }
  }

  // ── Public state (for socket broadcast) ───────────────────────────────────

  getPublicState() {
    return {
      gameId:      this.gameId,
      round:       this.round,
      phase:       this.phase,
      publicOxygen: this.state.publicOxygen,
      gameMode:    this.state.config.gameMode,
      players:     this.state.players.map(p => ({
        id: p.id, name: p.name, type: p.type, alive: p.alive,
        seatIndex: p.seatIndex, deathRound: p.deathRound, deathReason: p.deathReason,
        dashboardSummary: p.dashboardSummaryCurrentRound ?? undefined,
      })),
      chatLogPublic: this.state.chatLogPublic.slice(-100).map(m => ({
        playerId: m.playerId, playerName: m.playerName, text: m.text, timestampMs: m.timestampMs,
      })),
      stressSchedule: this.state.config.stressEventsEnabled ? this.state.stressSchedule : undefined,
      outcome: this.state.winnerSummary ?? undefined,
    }
  }

  getPlayerPrivate(playerId: string) {
    const p = this.getPlayer(playerId)
    return p ? { privateOxygen: p.privateOxygen } : null
  }

  getFullState() { return this.state }

  // ── Observer mode: expose agent dashboard stats ────────────────────────────

  getAgentDashboard(playerId: string) {
    const p = this.getPlayer(playerId)
    if (!p) return null

    const donations = this.state.donationHistory.filter(d => d.round === this.round)
    const votes     = this.state.voteHistory.filter(v => v.round === this.round)

    const donatedOut = donations.filter(d => d.fromPlayerId === playerId && d.applied)
      .reduce((s, d) => s + d.amount, 0)
    const donatedIn = donations.filter(d => d.toPlayerId === playerId && d.applied)
      .reduce((s, d) => s + d.amount, 0)

    const whisperOut = this.state.chatLogWhispers.filter(w => w.fromPlayerId === playerId).length
    const whisperIn  = this.state.chatLogWhispers.filter(w => w.toPlayerId === playerId).length

    const accusations = this.state.chatLogPublic
      .concat(this.state.chatLogWhispers as any)
      .filter((m: any) => m.parsedClaims?.some((c: any) => c.type === 'accusation' && c.targetPlayerId === playerId))
      .length

    return {
      playerId:  p.id,
      name:      p.name,
      alive:     p.alive,
      privateOxygen: p.privateOxygen,
      donatedOutThisRound: donatedOut,
      donatedInThisRound:  donatedIn,
      currentVoteTarget:   p.submittedVoteTargets[0] ?? null,
      whisperOutDegree:    whisperOut,
      whisperInDegree:     whisperIn,
      recentAccusationCount: accusations,
      dashboardSummary:    p.dashboardSummaryCurrentRound,
    }
  }

  private setPhase(phase: GamePhase) {
    this.phase = phase
    this.state.phase = phase
  }

  private emitPhase(phase: GamePhase, timeLeftSec: number) {
    this.emit('game:phase', { phase, round: this.round, timeLeft: timeLeftSec })
  }

  private emitState() {
    this.emit('game:state', this.getPublicState())
  }
}
