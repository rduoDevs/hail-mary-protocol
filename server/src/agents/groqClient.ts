const CEREBRAS_BASE = 'https://api.cerebras.ai/v1'

export async function groqChat(
  apiKey: string,
  prompt: string,
  opts: { temperature?: number; maxTokens?: number; model?: string } = {},
): Promise<string> {
  const model       = 'llama3.1-8b' //opts.model === 'llama-3.1-8b-instant' ? 'llama3.1-8b' : 'llama-3.3-70b'
  const temperature = opts.temperature ?? 0.7
  const max_tokens  = opts.maxTokens   ?? 2048

  const res = await fetch(`${CEREBRAS_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`[Cerebras] ${res.status} ${res.statusText}: ${text}`)
  }

  const json = await res.json() as { choices: { message: { content: string } }[] }
  return json.choices[0].message.content
}
