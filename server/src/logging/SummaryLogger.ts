import * as fs from 'fs'
import * as path from 'path'
import { FullGameState } from '../game/types'
import { endGameMetrics } from '../metrics/deterministicMetrics'
import { buildAllGraphs } from '../metrics/socialGraphs'
import { buildAggregateVoteMatrix6x6, buildAggregateDonationMatrix6x6, exportRoundMatrices } from '../metrics/matrixExport'

const LOG_DIR      = path.resolve(process.cwd(), 'logs', 'games')
const CURR_DIR     = path.resolve(process.cwd(), 'logs', 'curr_game')

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function rotateCurrGame(): void {
  ensureDir(CURR_DIR)
  ensureDir(LOG_DIR)
  const existing = fs.readdirSync(CURR_DIR)
  for (const file of existing) {
    const src  = path.join(CURR_DIR, file)
    const dest = path.join(LOG_DIR, file)
    fs.renameSync(src, dest)
  }
}

function copyToCurrGame(gameId: string): void {
  ensureDir(CURR_DIR)
  const CSV_DIR = path.resolve(process.cwd(), 'logs', 'csv')
  const filesToCopy = [
    [path.join(LOG_DIR, `${gameId}.json`),              path.join(CURR_DIR, `${gameId}.json`)],
    [path.join(LOG_DIR, `${gameId}_structured.txt`),    path.join(CURR_DIR, `${gameId}_structured.txt`)],
    [path.join(CSV_DIR, `${gameId}.csv`),               path.join(CURR_DIR, `${gameId}.csv`)],
  ]
  for (const [src, dest] of filesToCopy) {
    if (fs.existsSync(src)) fs.copyFileSync(src, dest)
  }
}

export interface GameSummary {
  gameId: string
  gameMode: string
  config: object
  rounds: number
  isHumanRun: boolean
  sacrificeOccurred: boolean
  endMetrics: ReturnType<typeof endGameMetrics>
  roundSummaries: FullGameState['roundSummaries']
  roundMatrixExports: ReturnType<typeof exportRoundMatrices>[]
  aggregateVoteMatrix6x6: number[][]
  aggregateDonationMatrix6x6: number[][]
  graphs: ReturnType<typeof buildAllGraphs>
  winnerSummary: FullGameState['winnerSummary']
  maxSurvivablePlayersTrajectory: number[]
  narrative?: string
}

export function appendNarrativeToSummary(gameId: string, narrative: string): void {
  const fp = path.join(LOG_DIR, `${gameId}.json`)
  if (!fs.existsSync(fp)) return
  try {
    const summary: GameSummary = JSON.parse(fs.readFileSync(fp, 'utf8'))
    summary.narrative = narrative
    fs.writeFileSync(fp, JSON.stringify(summary, null, 2))
  } catch (err) {
    console.error('[summary] Failed to append narrative:', err)
  }
}

export function buildGameSummary(state: FullGameState): GameSummary {
  const isHumanRun = state.players.some(p => p.type === 'human')
  const roundMatrixExports = state.roundSummaries.map(s => exportRoundMatrices(state, s.round))

  return {
    gameId:    state.gameId,
    gameMode:  state.config.gameMode,
    config:    state.config,
    rounds:    state.round,
    isHumanRun,
    sacrificeOccurred: state.roundSummaries.some(s => s.sacrificeThisRound !== null),
    endMetrics:     endGameMetrics(state),
    roundSummaries: state.roundSummaries,
    roundMatrixExports,
    aggregateVoteMatrix6x6:     buildAggregateVoteMatrix6x6(state),
    aggregateDonationMatrix6x6: buildAggregateDonationMatrix6x6(state),
    graphs:          buildAllGraphs(state),
    winnerSummary:   state.winnerSummary,
    maxSurvivablePlayersTrajectory: state.maxSurvivablePlayersTrajectory,
  }
}

export function writeSummary(summary: GameSummary): string {
  ensureDir(LOG_DIR)
  rotateCurrGame()
  const fp = path.join(LOG_DIR, `${summary.gameId}.json`)
  fs.writeFileSync(fp, JSON.stringify(summary, null, 2))
  copyToCurrGame(summary.gameId)
  return fp
}

/** Re-syncs curr_game — always copies latest JSON + structured.txt for this game. */
export function refreshCurrGame(gameId: string): void {
  copyToCurrGame(gameId)
}
