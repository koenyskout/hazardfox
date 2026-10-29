export interface LlmSettings { endpoint: string; model: string; writer: string }

const KEY = 'hazardfox.decision'
export const defaultLlm = (): LlmSettings => ({ endpoint: 'http://localhost:11434', model: 'd1', writer: 'lfm3:latest' })

export function loadLlm(): LlmSettings {
  try {
    return { ...defaultLlm(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return defaultLlm()
  }
}
export function saveLlm(s: LlmSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage unavailable */ }
}

const base = (s: LlmSettings) => s.endpoint.replace(/\/+$/, '')

/** Installed models that can answer decision questions (falls back to all models if capabilities are unknown). */
export async function listDecisionModels(s: LlmSettings, signal?: AbortSignal): Promise<string[]> {
  const r = await fetch(`${base(s)}/api/tags`, { signal })
  if (!r.ok) throw new Error(`Ollama answered ${r.status}`)
  const names = ((await r.json()) as { models?: { name: string }[] }).models?.map((m) => m.name) ?? []
  const caps = await Promise.all(
    names.map((model) =>
      fetch(`${base(s)}/api/show`, { method: 'POST', signal, body: JSON.stringify({ model }) })
        .then((x) => x.json() as Promise<{ capabilities?: string[] }>)
        .then((j) => j.capabilities ?? null)
        .catch(() => null),
    ),
  )
  const dec = names.filter((_, i) => caps[i]?.includes('decision'))
  return dec.length ? dec : names
}

export interface DecisionQuestion {
  type: 'noul'
  instructions: string
  criteria: { true: string; false: string }
}

/** Ask a decision model (Ollama `/v1/systemone`) yes/no questions about `state`; returns P(true) per question. */
export async function decide(
  s: LlmSettings,
  state: string,
  questions: Record<string, DecisionQuestion>,
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  const r = await fetch(`${base(s)}/v1/systemone`, {
    method: 'POST',
    signal,
    body: JSON.stringify({ model: s.model, state, questions, keep_alive: '10m' }),
  })
  if (!r.ok) throw new Error(`Ollama answered ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
  const d = (await r.json()) as { answers?: Record<string, { noul?: number }> }
  const out: Record<string, number> = {}
  for (const k of Object.keys(questions)) {
    const v = d.answers?.[k]?.noul
    if (typeof v !== 'number') throw new Error(`No answer for "${k}" – is "${s.model}" a decision model?`)
    out[k] = v
  }
  return out
}

/** One-shot chat completion from a regular (generative) model, used to draft improved wording. */
export async function chat(s: LlmSettings, system: string, user: string, signal?: AbortSignal): Promise<string> {
  const r = await fetch(`${base(s)}/api/chat`, {
    method: 'POST',
    signal,
    body: JSON.stringify({
      model: s.writer,
      stream: false,
      keep_alive: '10m',
      options: { temperature: 0.4 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })
  if (!r.ok) throw new Error(`Ollama answered ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
  return ((await r.json()) as { message?: { content?: string } }).message?.content ?? ''
}
