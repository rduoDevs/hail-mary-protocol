const CEREBRAS_BASE = 'https://api.cerebras.ai/v1'
const MIN_GAP_MS   = 500   // 0.5 s between requests per key — Cerebras handles burst well

// Per-key independent queues — each key gets its own serial lane
interface Lane { queue: Promise<void>; lastSent: number }
const lanes = new Map<string, Lane>()

function getLane(apiKey: string): Lane {
  if (!lanes.has(apiKey)) lanes.set(apiKey, { queue: Promise.resolve(), lastSent: 0 })
  return lanes.get(apiKey)!
}

function enqueue<T>(apiKey: string, fn: () => Promise<T>): Promise<T> {
  const lane = getLane(apiKey)
  const slot = lane.queue.then(async () => {
    const wait = Math.max(0, lane.lastSent + MIN_GAP_MS - Date.now())
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lane.lastSent = Date.now()
    return fn()
  })
  lane.queue = slot.then(() => {}, () => {})
  return slot
}

// Hash a laneKey (e.g. playerId) to deterministically pick one key from the pool.
// Same laneKey always maps to the same key, spreading agents evenly across keys.
export function pickKey(keys: string[], laneKey: string): string {
  if (keys.length === 1) return keys[0]
  let hash = 0
  for (let i = 0; i < laneKey.length; i++) {
    hash = (Math.imul(hash, 31) + laneKey.charCodeAt(i)) >>> 0
  }
  return keys[hash % keys.length]
}

// Parse a comma-separated env string into a trimmed, non-empty key array
export function parseKeyPool(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map(k => k.trim()).filter(Boolean)
}

export async function cerebrasChat(
  apiKey: string,
  prompt: string,
  opts: { temperature?: number; maxTokens?: number; model?: string } = {},
): Promise<string> {
  return enqueue(apiKey, () => _call(apiKey, prompt, opts))
}

async function _call(
  apiKey: string,
  prompt: string,
  opts: { temperature?: number; maxTokens?: number; model?: string },
): Promise<string> {
  const model       = opts.model === 'large' ? 'llama-3.3-70b' : 'llama3.1-8b'
  const temperature = opts.temperature ?? 0.7
  const max_tokens  = opts.maxTokens   ?? 700

  const body = JSON.stringify({
    model, temperature, max_tokens,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  })

  for (let attempt = 0; attempt < 4; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)
    let res: Response
    try {
      res = await fetch(`${CEREBRAS_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body,
        signal: controller.signal,
      })
    } catch (err: any) {
      clearTimeout(timeout)
      if (err.name === 'AbortError') throw new Error('[Cerebras] request timed out after 25s')
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (res.ok) {
      const json = await res.json() as { choices: { message: { content: string } }[] }
      return json.choices[0].message.content
    }

    const isRetryable = res.status === 429 || res.status >= 500
    if (!isRetryable || attempt === 3) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`[Cerebras] ${res.status} ${res.statusText}: ${text}`)
    }

    const delay = (2 ** attempt) * 2000 + Math.random() * 500
    console.warn(`[Cerebras] ${res.status} — retrying in ${Math.round(delay)}ms (attempt ${attempt + 1})`)
    await new Promise(r => setTimeout(r, delay))
    lane_resetAfterRetry(apiKey)
  }

  throw new Error('[Cerebras] unreachable')
}

function lane_resetAfterRetry(apiKey: string) {
  const lane = lanes.get(apiKey)
  if (lane) lane.lastSent = Date.now()
}
