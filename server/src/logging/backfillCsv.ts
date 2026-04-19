/**
 * Backfill CSVs for all existing games that have a turn log.
 * Run with: npx ts-node server/src/logging/backfillCsv.ts
 */
import * as fs from 'fs'
import * as path from 'path'
import { exportGameCsv } from './CsvExporter'

const TURNS_DIR = path.resolve(process.cwd(), 'logs', 'turns')

const files = fs.readdirSync(TURNS_DIR)
  .filter(f => f.endsWith('.jsonl') && !f.endsWith('_cot.jsonl'))

let ok = 0, skip = 0
for (const f of files) {
  const gameId = f.replace('.jsonl', '')
  const csvPath = exportGameCsv(gameId)
  if (csvPath) { console.log(`✓ ${gameId}`); ok++ }
  else          { console.log(`- ${gameId} (skipped)`); skip++ }
}
console.log(`\nDone: ${ok} exported, ${skip} skipped.`)
