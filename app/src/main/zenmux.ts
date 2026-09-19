import { getApiKey, loadSettings } from './persist'

export class ZenmuxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZenmuxError'
  }
}

function headers(): Record<string, string> {
  const key = getApiKey()
  if (!key) throw new ZenmuxError('尚未设置 API Key。请到设置页填写，或使用邀请链接申请。')
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  }
}

function baseUrl(): string {
  return loadSettings().baseUrl.replace(/\/$/, '')
}

export type ChatMsg = {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<Record<string, unknown>>
}

export async function chatComplete(params: {
  model: string
  messages: ChatMsg[]
  json?: boolean
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    stream: false
  }
  if (params.json) body.response_format = { type: 'json_object' }

  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const t = await res.text()
    throw new ZenmuxError(`模型调用失败 ${res.status}: ${t.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  return data.choices?.[0]?.message?.content || ''
}

function streamPiece(json: Record<string, unknown>): string {
  const choices = json.choices as Array<Record<string, unknown>> | undefined
  const ch = choices?.[0] || {}
  const delta = (ch.delta || json.delta) as Record<string, unknown> | undefined
  const content = delta?.content ?? (ch.message as Record<string, unknown> | undefined)?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === 'string' ? p : String((p as Record<string, unknown>)?.text || (p as Record<string, unknown>)?.content || ''))).join('')
  }
  if (typeof delta?.text === 'string') return delta.text
  return ''
}

export async function chatStream(
  params: {
    model: string
    messages: ChatMsg[]
  },
  onDelta: (text: string) => void
): Promise<string> {
  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      stream: true
    })
  })
  if (!res.ok || !res.body) {
    const t = await res.text()
    throw new ZenmuxError(`流式调用失败 ${res.status}: ${t.slice(0, 400)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as Record<string, unknown>
        const piece = streamPiece(json)
        if (piece) {
          full += piece
          onDelta(piece)
        }
      } catch {
        // ignore partial json
      }
    }
  }
  return full
}

export async function embedTexts(model: string, inputs: string[]): Promise<number[][]> {
  const out: number[][] = []
  const size = 32
  for (let i = 0; i < inputs.length; i += size) {
    const batch = inputs.slice(i, i + size)
    const res = await fetch(`${baseUrl()}/embeddings`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ model, input: batch })
    })
    if (!res.ok) {
      const t = await res.text()
      throw new ZenmuxError(`嵌入失败 ${res.status}: ${t.slice(0, 400)}`)
    }
    const data = (await res.json()) as { data?: { embedding: number[]; index: number }[] }
    const ordered = (data.data || []).sort((a, b) => a.index - b.index)
    for (const row of ordered) out.push(row.embedding)
  }
  return out
}

export function parseJsonLoose<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const text = (fenced?.[1] || raw).trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return JSON.parse(text.slice(start, end + 1)) as T
  }
  throw new Error('模型未返回可解析 JSON')
}
