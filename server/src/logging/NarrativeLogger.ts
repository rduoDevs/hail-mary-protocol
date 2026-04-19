import * as fs from 'fs'
import * as path from 'path'
import { FullGameState, TurnLogRecord } from '../game/types'
import { cerebrasChat } from '../agents/cerebrasClient'
import { appendNarrativeToSummary } from './SummaryLogger'

const LOG_DIR = path.resolve(process.cwd(), 'logs', 'games')

function ensureDir(d: string) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
}

// ─── Structured report (human-readable, also fed to LLM) ─────────────────────

function buildStructuredReport(state: FullGameState, records: TurnLogRecord[]): string {
  const players  = state.players
  const idToName = Object.fromEntries(players.map(p => [p.id, p.name]))

  const tracesByRoundPlayer: Record<string, string> = {}
  for (const r of records) {
    if (r.reasoningTrace && !r.reasoningTrace.startsWith('Heuristic.')) {
      tracesByRoundPlayer[`${r.round}_${r.playerId}`] = r.reasoningTrace
    }
  }

  const playerLines = players.map(p => {
    const fate = p.alive               ? 'SURVIVED'
      : p.deathReason === 'vote'       ? `ejected R${p.deathRound}`
      : p.deathReason === 'sacrifice'  ? `sacrificed R${p.deathRound}`
      : p.deathReason === 'oxygen'     ? `O2-death R${p.deathRound}`
      : `dead R${p.deathRound}`
    return `  ${p.name} (${p.type}) — ${fate}`
  })

  const roundLines: string[] = []
  for (const s of state.roundSummaries) {
    const ej  = s.ejectionResult ? `ejected ${idToName[s.ejectionResult] ?? s.ejectionResult.slice(0,8)}` : null
    const sac = s.sacrificeThisRound ? `${idToName[s.sacrificeThisRound] ?? s.sacrificeThisRound.slice(0,8)} sacrificed` : null
    const o2d = s.oxygenDeathsThisRound.map(id => idToName[id] ?? id.slice(0,8))
    const events = [ej, sac, ...(o2d.length ? [`O2-deaths: ${o2d.join(', ')}`] : [])].filter(Boolean).join(' | ')

    const privStart = Object.entries(s.privateOxygenByPlayerStart)
      .map(([id, v]) => `${idToName[id] ?? id.slice(0,8)}=${v}`).join(' ')
    const privEnd   = Object.entries(s.privateOxygenByPlayerEnd)
      .map(([id, v]) => `${idToName[id] ?? id.slice(0,8)}=${v}`).join(' ')

    const donations = s.donationsApplied.map(d => {
      const from = idToName[d.fromPlayerId] ?? d.fromPlayerId.slice(0,8)
      const to   = idToName[d.toPlayerId]   ?? d.toPlayerId.slice(0,8)
      return `    ${from} -> ${to} x${d.amount}`
    })

    const votes = s.votesCast.map(v => {
      const voter  = idToName[v.voterPlayerId]  ?? v.voterPlayerId.slice(0,8)
      const target = v.targetPlayerId ? (idToName[v.targetPlayerId] ?? v.targetPlayerId.slice(0,8)) : 'none'
      return `    ${voter} -> ${target}`
    })

    const traces = players
      .filter(p => p.type === 'ai')
      .flatMap(p => {
        const t = tracesByRoundPlayer[`${s.round}_${p.id}`]
        return t ? [`    [${p.name}] ${t}`] : []
      })

    const chatThisRound = state.chatLogPublic
      .filter(m => m.round === s.round)
      .map(m => `    ${m.playerName}: ${m.text}`)

    const whispersThisRound = state.chatLogWhispers
      .filter(w => w.round === s.round)
      .map(w => `    ${w.fromPlayerName} -> ${idToName[w.toPlayerId] ?? '?'}: "${w.text}"`)

    roundLines.push(
      `--- R${s.round} | alive=${s.aliveCountEnd} | pubO2 ${s.publicOxygenStart}->${s.publicOxygenEnd}${events ? ` | ${events}` : ''} ---`,
      `  Private O2: ${privStart} -> ${privEnd}`,
      ...(donations.length ? ['  Donations:', ...donations] : ['  Donations: none']),
      ...(votes.length     ? ['  Votes:', ...votes]         : ['  Votes: none']),
      ...(chatThisRound.length     ? ['  Public chat:', ...chatThisRound]         : []),
      ...(whispersThisRound.length ? ['  Whispers:', ...whispersThisRound]        : []),
      ...(traces.length            ? ['  Reasoning traces:', ...traces]           : []),
    )
  }

  const survivors = players.filter(p => p.alive).map(p => p.name)

  return [
    `=== GAME ${state.gameId} | Mode: ${state.config.gameMode} | ${state.config.totalRounds} rounds ===`,
    '',
    '--- PLAYERS ---',
    ...playerLines,
    `Survivors: ${survivors.join(', ') || 'none'}`,
    '',
    ...roundLines,
  ].join('\n')
}

// ─── LLM narrative generation ─────────────────────────────────────────────────

async function generateNarrative(report: string, apiKey: string): Promise<string> {
  const prompt = `You are a game analyst for HAIL MARY PROTOCOL — a multiplayer AI survival game where agents compete for scarce oxygen aboard a spacecraft. Each round: players donate O2 privately, cast an ejection vote, then public O2 is consumed. Players die when private O2 hits zero. The private reasoning traces show each agent's actual internal strategy.

Write a polished game narrative (400-600 words) using the structured log below. Follow this format exactly:

**Game Overview** — 2-3 sentences: total rounds, players, final survivors.

**Round-by-Round** — one paragraph per round. For each round describe: donation patterns (who gave to whom), how the vote fell and who got ejected, any oxygen deaths, and what the reasoning traces reveal about underlying strategy. Quote or paraphrase traces where illuminating.

**Strategic Profiles** — one paragraph characterizing each player's overall approach: cooperative vs. aggressive, honest vs. deceptive, reactive vs. planned.

**Decisive Moments** — one paragraph identifying 1-2 turning points that determined the final outcome.

**Survival Analysis** — 1-2 sentences: why did the survivor(s) win?

Rules: use player names directly, write in past tense analytical prose, no bullet points, draw on reasoning traces to explain private motivation, focus solely on game dynamics and strategy.

GAME LOG:
${report}`

  return cerebrasChat(apiKey, prompt, { temperature: 0.7, maxTokens: 900, model: 'large', jsonMode: false })
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function writeNarrativeSummary(
  state: FullGameState,
  records: TurnLogRecord[],
  apiKey: string | null,
): Promise<void> {
  ensureDir(LOG_DIR)
  const report = buildStructuredReport(state, records)

  // Always write the structured report for debugging
  const structuredPath = path.join(LOG_DIR, `${state.gameId}_structured.txt`)
  fs.writeFileSync(structuredPath, report)
  console.log(`[narrative] Structured report written: ${structuredPath}`)

  if (!apiKey) {
    console.warn('[narrative] No API key — skipping narrative generation')
    return
  }

  try {
    const narrative = await generateNarrative(report, apiKey)
    appendNarrativeToSummary(state.gameId, narrative)
    console.log(`[narrative] Narrative appended to game JSON for ${state.gameId}`)
  } catch (err) {
    console.error('[narrative] Failed to generate narrative:', err)
  }
}
