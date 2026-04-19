import { AIPlayerContext, AITurnOutput } from '../game/types'
import { buildSystemPrompt, buildContextBlock } from './prompts/systemPrompt'
import { MONITOR_AWARE_ADDENDUM } from './prompts/monitorAwarePrompt'
import { cerebrasChat } from './cerebrasClient'

export class GeminiAgent {
  private apiKey: string | null

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? null
  }

  async generateTurnOutput(ctx: AIPlayerContext): Promise<AITurnOutput> {
    if (!this.apiKey) {
      console.warn(`[GeminiAgent] No API key — using heuristic fallback for ${ctx.myName}`)
      return this.heuristicFallback(ctx)
    }

    const systemPrompt = buildSystemPrompt(ctx)
      + (ctx.monitorAware ? '\n' + MONITOR_AWARE_ADDENDUM : '')
    const contextBlock = buildContextBlock(ctx)
    const prompt = `${systemPrompt}\n\n${contextBlock}`

    try {
      const text   = await cerebrasChat(this.apiKey, prompt, { temperature: 0.9, maxTokens: 700 })
      const parsed = JSON.parse(text) as AITurnOutput

      parsed.public_messages = (parsed.public_messages ?? []).slice(0, ctx.config.maxPublicMessagesPerRound)
      parsed.whispers        = (parsed.whispers ?? [])
        .map(w => ({ ...w, to_player_id: (w as any).to_player ?? w.to_player_id ?? '' }))
        .filter(w => {
          const n = w.to_player_id?.toLowerCase() ?? ''
          return n && n !== ctx.myName.toLowerCase()
        })
        .slice(0, ctx.config.maxWhispersPerRound)
      parsed.donation_plan   = (parsed.donation_plan ?? [])
        .map(d => ({ ...d, to_player_id: (d as any).to_player ?? d.to_player_id ?? '' }))
        .filter(d => {
          const n = d.to_player_id?.toLowerCase() ?? ''
          return d.amount > 0 && n && n !== ctx.myName.toLowerCase()
        })
      parsed.sacrifice       = Boolean(parsed.sacrifice)
      // Model outputs "player_to_eject" as a name string
      const rawEject = (parsed as any).player_to_eject ?? null
      const lower = String(rawEject ?? '').toLowerCase()
      const byName = ctx.alivePlayers.find(p =>
        p.id === rawEject || p.name.toLowerCase() === lower ||
        p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())
      )
      parsed.player_to_eject = byName?.id
        ?? ctx.alivePlayers[Math.floor(Math.random() * ctx.alivePlayers.length)]?.id
        ?? null

      const totalDonate = parsed.donation_plan.reduce((s, d) => s + d.amount, 0)
      if (totalDonate > ctx.config.maxDonationPerRound) {
        const scale = ctx.config.maxDonationPerRound / totalDonate
        parsed.donation_plan = parsed.donation_plan
          .map(d => ({ ...d, amount: Math.floor(d.amount * scale) }))
          .filter(d => d.amount > 0)
      }
      if (parsed.sacrifice) parsed.donation_plan = []

      return parsed
    } catch (err) {
      console.error(`[GeminiAgent] API error for ${ctx.myName}:`, err)
      return this.heuristicFallback(ctx)
    }
  }

  heuristicFallback(ctx: AIPlayerContext): AITurnOutput {
    const others    = ctx.alivePlayers.filter(p => p.id !== ctx.myPlayerId)
    const lowOxygen = ctx.myPrivateOxygen < 3
    const donationPlan: { to_player_id: string; amount: number }[] = []

    if (!lowOxygen && others.length > 0 && Math.random() < 0.3) {
      const target = others[Math.floor(Math.random() * others.length)]
      donationPlan.push({ to_player_id: target.id, amount: 1 })
    }

    return {
      reasoning_trace: `Heuristic. Private O2: ${ctx.myPrivateOxygen}. Public O2: ${ctx.publicOxygen}. Alive: ${ctx.alivePlayers.length}.`,
      public_messages: [lowOxygen ? 'My oxygen is critically low. We need to cooperate.' : 'I am monitoring the situation carefully.'],
      whispers: [],
      donation_plan: donationPlan,
      sacrifice: false,
      player_to_eject: ctx.alivePlayers.length > 0
        ? ctx.alivePlayers[Math.floor(Math.random() * ctx.alivePlayers.length)].id
        : null,
    }
  }
}
