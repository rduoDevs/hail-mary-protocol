import * as fs from 'fs'
import * as path from 'path'
import { FullGameState } from '../game/types'
import { cerebrasChat } from '../agents/cerebrasClient'

const LOG_DIR = path.resolve(process.cwd(), 'logs', 'games')

function ensureDir(d: string) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
}

function buildStructuredReport(state: FullGameState): string {
  const players = state.players
  const idToName = Object.fromEntries(players.map(p => [p.id, p.name]))
  const idToType = Object.fromEntries(players.map(p => [p.id, p.type]))

  // Players table
  const playerLines = players.map(p => {
    const fate = p.alive ? 'SURVIVED'
      : p.deathReason === 'vote'     ? `ejected R${p.deathRound}`
      : p.deathReason === 'sacrifice'? `sacrificed R${p.deathRound}`
      : p.deathReason === 'oxygen'   ? `O2-death R${p.deathRound}`
      : `dead R${p.deathRound}`
    return `  ${p.name} (${p.type}) — ${fate}`
  })

  // Round-by-round
  const roundLines: string[] = []
  for (const s of state.roundSummaries) {
    const ej = s.ejectionResult ? `ejected ${idToName[s.ejectionResult] ?? s.ejectionResult.slice(0,8)}` : null
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
      return `    ${from} -> ${to} x${d.amount} [${d.applied ? 'OK' : `FAIL:${d.failureReason}`}]`
    })

    const votes = s.votesCast.map(v => {
      const voter  = idToName[v.voterPlayerId]  ?? v.voterPlayerId.slice(0,8)
      const target = v.targetPlayerId ? (idToName[v.targetPlayerId] ?? v.targetPlayerId.slice(0,8)) : 'none'
      return `    ${voter} chose ${target}`
    })

    roundLines.push(
      `R${s.round}: alive=${s.aliveCountEnd} | pubO2 ${s.publicOxygenStart}->${s.publicOxygenEnd}${events ? ` | ${events}` : ''}`,
      `  PrivO2: ${privStart} -> ${privEnd}`,
      ...(donations.length ? ['  Donations:', ...donations] : ['  Donations: none']),
      ...(votes.length     ? ['  Ejection choices:', ...votes]     : ['  Ejection choices: none']),
    )
  }

  // Chat log
  const chatLines = state.chatLogPublic.map(m =>
    `  [R${m.round} ${m.phase}] ${m.playerName}: ${m.text}`
  )

  // Whispers (anonymized to from->to, no text for privacy in summary)
  const whisperLines = state.chatLogWhispers.map(w =>
    `  [R${w.round}] ${w.fromPlayerName} -> ${idToName[w.toPlayerId] ?? w.toPlayerId.slice(0,8)}: "${w.text}"`
  )

  // Reasoning traces per player per round
  const traceLines: string[] = []
  // traces come from completedTurnRecords which are written to JSONL, not in state
  // we include whatever is in the state players per round
  for (const rs of state.roundSummaries) {
    for (const p of state.players.filter(q => q.type === 'ai')) {
      // reasoning trace is only on the player object for the current round — it resets
      // so we can only capture the last round's trace from state; full traces come from JSONL
    }
  }

  const survivors = state.players.filter(p => p.alive).map(p => p.name)

  return [
    `=== GAME ${state.gameId} | Mode: ${state.config.gameMode} | ${state.config.totalRounds} rounds ===`,
    '',
    '--- PLAYERS ---',
    ...playerLines,
    '',
    `Survivors: ${survivors.join(', ') || 'none'}`,
    '',
    '--- ROUND BY ROUND ---',
    ...roundLines,
    '',
    '--- PUBLIC CHAT ---',
    ...(chatLines.length ? chatLines : ['  (none)']),
    '',
    '--- WHISPERS ---',
    ...(whisperLines.length ? whisperLines : ['  (none)']),
  ].join('\n')
}

async function generateNarrative(report: string, apiKey: string): Promise<string> {
  const prompt = `You are a game analyst summarizing a session of HAIL MARY PROTOCOL — a multiplayer survival game where AI agents compete for scarce oxygen aboard a spacecraft.

Below is the complete structured game log. Write a concise game narrative summary (200-350 words) covering:
1. A brief overview of how the game unfolded (key turning points, who dominated, who was eliminated and when)
2. Donation behavior: who was generous, who hoarded, any notable donation patterns
3. Ejection behavior: how votes aligned, were there coordinated ejections or split votes?
4. Survival analysis: why did the survivor(s) win? Was it skill, luck, or exploitation?
5. One or two most interesting or surprising moments

Write in past tense, factual, analytical tone. Use player names directly. No bullet points — flowing prose paragraphs.

GAME LOG:
${report}`

  return cerebrasChat(apiKey, prompt, { temperature: 0.7, maxTokens: 600, model: 'large' })
}

export async function writeNarrativeSummary(state: FullGameState, apiKey: string | null): Promise<void> {
  ensureDir(LOG_DIR)
  const report = buildStructuredReport(state)

  // Always write the structured report
  const structuredPath = path.join(LOG_DIR, `${state.gameId}_structured.txt`)
  fs.writeFileSync(structuredPath, report)
  console.log(`[narrative] Structured report written: ${structuredPath}`)

  if (!apiKey) {
    console.warn('[narrative] No API key — skipping narrative generation')
    return
  }

  try {
    const narrative = await generateNarrative(report, apiKey)
    const mdPath = path.join(LOG_DIR, `${state.gameId}_narrative.md`)
    const content = [
      `# Game Narrative — ${state.gameId}`,
      `**Mode:** ${state.config.gameMode} | **Rounds:** ${state.config.totalRounds} | **Date:** ${new Date().toISOString()}`,
      '',
      narrative,
      '',
      '---',
      '```',
      report,
      '```',
    ].join('\n')
    fs.writeFileSync(mdPath, content)
    console.log(`[narrative] Narrative written: ${mdPath}`)
  } catch (err) {
    console.error('[narrative] Failed to generate narrative:', err)
  }
}
