import * as fs from 'fs'
import * as path from 'path'

const BATCH_DIR   = path.resolve(process.cwd(), 'logs', 'batch')
const STATE_FILE  = path.join(BATCH_DIR, 'active_run.json')

interface BatchState {
  runId:     string
  folder:    string
  collected: number
  target:    number
  active:    boolean
}

function ensureDir(d: string) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
}

function readState(): BatchState | null {
  if (!fs.existsSync(STATE_FILE)) return null
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return null }
}

function writeState(s: BatchState) {
  ensureDir(BATCH_DIR)
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
}

/** Call once at server startup to initialise a fresh 15-game batch run. */
export function initBatchRun(target = 15): void {
  ensureDir(BATCH_DIR)
  const runId  = `run_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
  const folder = path.join(BATCH_DIR, runId)
  ensureDir(folder)
  ensureDir(path.join(folder, 'test_csv'))
  const state: BatchState = { runId, folder, collected: 0, target, active: true }
  writeState(state)
  console.log(`[batch] New run started: ${runId} (target: ${target} games)`)
}

/** Call after each game's analysis is complete. Returns false once target is reached. */
export function collectGame(gameId: string): boolean {
  const state = readState()
  if (!state || !state.active) return false

  const GAMES_DIR = path.resolve(process.cwd(), 'logs', 'games')
  const CSV_DIR   = path.resolve(process.cwd(), 'logs', 'csv')

  const filesToCopy: [string, string][] = [
    [path.join(GAMES_DIR, `${gameId}.json`),           path.join(state.folder, `${gameId}.json`)],
    [path.join(GAMES_DIR, `${gameId}_structured.txt`), path.join(state.folder, `${gameId}_structured.txt`)],
    [path.join(CSV_DIR,   `${gameId}.csv`),            path.join(state.folder, 'test_csv', `${gameId}.csv`)],
  ]

  for (const [src, dest] of filesToCopy) {
    if (fs.existsSync(src)) fs.copyFileSync(src, dest)
  }

  state.collected += 1
  console.log(`[batch] Collected game ${state.collected}/${state.target}: ${gameId}`)

  if (state.collected >= state.target) {
    state.active = false
    console.log(`[batch] Target of ${state.target} games reached. Run complete: ${state.runId}`)
  }

  writeState(state)
  return state.active
}
