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

function asText(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map(asText).join('')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return asText(o.text ?? o.content ?? o.output_text ?? o.value)
  }
  return ''
}

function streamPiece(json: Record<string, unknown>): { keep: string; visible: string } {
  const choices = json.choices as Array<Record<string, unknown>> | undefined
  const ch = choices?.[0] || {}
  const delta = (ch.delta || json.delta) as Record<string, unknown> | undefined
  const msg = (ch.message || json.message) as Record<string, unknown> | undefined
  const content = asText(
    delta?.content ?? msg?.content ?? json.content ?? delta?.text ?? json.output_text ?? delta?.output_text
  )
  const think = asText(delta?.reasoning_content ?? msg?.reasoning_content ?? delta?.reasoning ?? msg?.reasoning)
  if (content) return { keep: content, visible: content }
  if (think) return { keep: '', visible: think }
  return { keep: '', visible: '' }
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
  let keep = ''
  let visible = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) takeSseLine(line)
  }
  buffer += decoder.decode()
  if (buffer.trim()) takeSseLine(buffer)

  function takeSseLine(line: string) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    try {
      const json = JSON.parse(payload) as Record<string, unknown>
      const piece = streamPiece(json)
      if (piece.visible) {
        visible += piece.visible
        onDelta(piece.visible)
      }
      if (piece.keep) keep += piece.keep
    } catch {
      // ignore partial json
    }
  }
  return keep || visible
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

function sliceObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const text = (fenced?.[1] || raw).trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型未返回可解析 JSON')
  return text.slice(start, end + 1)
}

function escapeBrokenJsonStrings(src: string): string {
  let out = ''
  let inStr = false
  let esc = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (!inStr) {
      if (ch === '"') inStr = true
      out += ch
      continue
    }
    if (esc) {
      out += ch
      esc = false
      continue
    }
    if (ch === '\\') {
      const next = src[i + 1] || ''
      const after = src[i + 2] || ''
      if (next === '"' || next === '\\' || next === '/') {
        out += ch
        esc = true
      } else if (next === 'u' && /^[0-9a-fA-F]{4}/.test(src.slice(i + 2, i + 6))) {
        out += ch
        esc = true
      } else if ('bfnrt'.includes(next) && !/[A-Za-z]/.test(after)) {
        out += ch
        esc = true
      } else {
        out += '\\\\'
      }
      continue
    }
    if (ch === '"') {
      inStr = false
      out += ch
      continue
    }
    if (ch === '\n') {
      out += '\\n'
      continue
    }
    if (ch === '\r') {
      out += '\\r'
      continue
    }
    if (ch === '\t') {
      out += '\\t'
      continue
    }
    out += ch
  }
  return out
}

export function parseJsonLoose<T>(raw: string): T {
  const sliced = sliceObject(raw)
  const repaired = escapeBrokenJsonStrings(sliced).replace(/,\s*([}\]])/g, '$1')
  try {
    return JSON.parse(repaired) as T
  } catch {
    return JSON.parse(sliced) as T
  }
}
