import { chatComplete, chatStream, parseJsonLoose } from './zenmux'
import { loadSettings } from './persist'
import { formatContext, retrieve } from './rag'
import { guidePrompt } from './exam-guide'

export type ExamType = 'choice' | 'short' | 'comprehensive' | 'gaokao'

export interface GeneratedQuestion {
  type: ExamType
  stem: string
  options?: string[]
  blanks?: { id: string; answer: string; kind: 'choice' | 'blank' | 'calc' | 'short' }[]
  answer: string
  analysis: string
  examPoints: string[]
}

function extractQuoted(raw: string, key: string): string {
  const re = new RegExp(`"${key}"\\s*:\\s*"`)
  const m = re.exec(raw)
  if (!m) return ''
  let out = ''
  let esc = false
  for (let i = m.index + m[0].length; i < raw.length; i++) {
    const ch = raw[i]
    if (esc) {
      out += ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === 'r' ? '' : ch
      esc = false
      continue
    }
    if (ch === '\\') {
      esc = true
      continue
    }
    if (ch === '"') {
      if (/^\s*[,}\]]/.test(raw.slice(i + 1))) break
      out += ch
      continue
    }
    out += ch
  }
  return out.trim()
}

function pickLonger(...parts: string[]): string {
  return parts.reduce((a, b) => ((b || '').length > (a || '').length ? b : a), '')
}

function readQuestion(raw: string, fallbackType: ExamType = 'gaokao'): GeneratedQuestion {
  let parsed: GeneratedQuestion | null = null
  try {
    const q = parseJsonLoose<GeneratedQuestion>(raw)
    if (q && typeof q.stem === 'string') parsed = q
  } catch {
    // 模型常把 \\ce 写成非法 JSON，改为抽字段
  }
  const stem = pickLonger(parsed?.stem || '', extractQuoted(raw, 'stem')) || raw.replace(/```(?:json)?/g, '').trim().slice(0, 8000)
  return {
    type: parsed?.type || fallbackType,
    stem,
    options: Array.isArray(parsed?.options) ? parsed.options : undefined,
    blanks: Array.isArray(parsed?.blanks) ? parsed.blanks : undefined,
    answer: pickLonger(parsed?.answer || '', extractQuoted(raw, 'answer')),
    analysis: pickLonger(parsed?.analysis || '', extractQuoted(raw, 'analysis')),
    examPoints: parsed?.examPoints || []
  }
}

function readVerdict(raw: string, qA: GeneratedQuestion, qB: GeneratedQuestion) {
  try {
    const v = parseJsonLoose<{
      accept: boolean
      reason: string
      winner: 'A' | 'B' | 'merge'
      question?: GeneratedQuestion
    }>(raw)
    return {
      accept: Boolean(v.accept),
      reason: v.reason || '',
      winner: v.winner || 'A',
      question: v.question?.stem
        ? (() => {
            const parsed = readQuestion(JSON.stringify(v.question), qA.type)
            return { ...parsed, ...v.question, type: v.question.type || parsed.type }
          })()
        : undefined
    }
  } catch {
    return {
      accept: true,
      reason: '仲裁输出不是完整 JSON，先采用模型 A。',
      winner: 'A' as const,
      question: qA
    }
  }
}

function systemPrompt(): string {
  return [
    '你是上海等级考化学命题教师，教材是沪科版（上海科学技术出版社）。',
    '必须依据教材原文，不得超纲。第一册结构只到键型与简单电子式。',
    '化学式用 LaTeX / mhchem：$n=\\dfrac{m}{M}=\\dfrac{N}{N_A}=\\dfrac{V}{V_m}=cV$，$\\ce{Cl2 + 2NaOH -> NaCl + NaClO + H2O}$。',
    '输出简体中文 Markdown。'
  ].join('')
}

export type ExamProgress = {
  step: number
  total: number
  label: string
  lane?: 'a' | 'b' | 'arbiter' | 'judge' | 'sa' | 'sb' | 'sv'
  delta?: string
  reset?: boolean
}

export async function generateQuestion(
  params: {
    type: ExamType
    nodes: { id: string; label: string; bookId?: string }[]
  },
  onProgress?: (p: ExamProgress) => void
) {
  const settings = loadSettings()
  const topic = params.nodes.map((n) => n.label).join('、')
  onProgress?.({ step: 0, total: 3, label: '正在检索教材原文' })
  const { hits } = await retrieve(`上海等级考 ${topic} 粗盐 氯气 离子方程式 物质的量`, 10)
  const ctx = formatContext(hits)

  const user = [
    `按上海等级考风格出一道${labelType(params.type)}。可跨第1–4章原位迁移，但不要做成全国卷那种「选择 40 分」。`,
    `知识节点：${topic || '必修第一册高频考点'}`,
    guidePrompt(topic),
    specForType(params.type),
    '教材摘录：',
    ctx || '（索引未建立时严格按大纲高频考点，并在 analysis 注明依据不足）'
  ].join('\n')

  onProgress?.({ step: 1, total: 3, label: '模型 A、B 并行命题', lane: 'a', reset: true })
  onProgress?.({ step: 1, total: 3, label: '模型 A、B 并行命题', lane: 'b', reset: true })
  const settled = await Promise.allSettled([
    chatStream(
      {
        model: settings.roles.genA,
        messages: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: user + '\n请用模型A的思路独立命题。' }
        ]
      },
      (delta) => onProgress?.({ step: 1, total: 3, label: '模型 A 正在出题', lane: 'a', delta })
    ),
    chatStream(
      {
        model: settings.roles.genB,
        messages: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: user + '\n请用模型B的思路独立命题，不要模仿常见套路。' }
        ]
      },
      (delta) => onProgress?.({ step: 1, total: 3, label: '模型 B 正在出题', lane: 'b', delta })
    )
  ])
  const rawA = settled[0].status === 'fulfilled' ? settled[0].value : `{"stem":"${String(settled[0].reason).replace(/"/g, '\\"')}"}`
  const rawB = settled[1].status === 'fulfilled' ? settled[1].value : `{"stem":"${String(settled[1].reason).replace(/"/g, '\\"')}"}`
  const qA = readQuestion(rawA, params.type)
  const qB = readQuestion(rawB, params.type)

  onProgress?.({ step: 2, total: 3, label: '仲裁模型评判能否入库', lane: 'arbiter', reset: true })
  const verdictRaw = await chatStream(
    {
      model: settings.roles.arbiter,
      messages: [
        { role: 'system', content: systemPrompt() + '你是命题仲裁。按上海等级考综合题标准判定能否入库。' },
        {
          role: 'user',
          content: [
            '比较两道独立命题。必须像近两年上海卷：综合题小空、工业+实验包装、计算看清标准状况。第一册不要出晶胞/杂化/配合物。',
            '输出 JSON：{"accept":true,"reason":"...","winner":"A|B|merge","question":{...同上字段}}',
            '若两题都不合格 accept=false。若可合并则 winner=merge 并给出最终题。',
            `模型A：${JSON.stringify(qA)}`,
            `模型B：${JSON.stringify(qB)}`,
            `教材摘录：\n${ctx}`
          ].join('\n')
        }
      ]
    },
    (delta) => onProgress?.({ step: 2, total: 3, label: '仲裁正在比较两题', lane: 'arbiter', delta })
  )

  const verdict = readVerdict(verdictRaw, qA, qB)

  const result = {
    modelA: { model: settings.roles.genA, question: qA },
    modelB: { model: settings.roles.genB, question: qB },
    verdict: {
      model: settings.roles.arbiter,
      accept: Boolean(verdict.accept),
      reason: verdict.reason,
      winner: verdict.winner,
      question: verdict.question || (verdict.winner === 'B' ? qB : qA)
    },
    sources: hits.map((h) => ({ bookId: h.bookId, page: h.page, score: h.score }))
  }
  onProgress?.({ step: 3, total: 3, label: '命题完成' })
  return result
}

function readSolve(raw: string) {
  let parsed: { steps?: string; answer?: string; key?: string } | null = null
  try {
    parsed = parseJsonLoose<{ steps: string; answer: string; key: string }>(raw)
  } catch {
    // 流式 JSON 常被 LaTeX 打断
  }
  return {
    steps: pickLonger(parsed?.steps || '', extractQuoted(raw, 'steps'), raw),
    answer: pickLonger(parsed?.answer || '', extractQuoted(raw, 'answer')),
    key: pickLonger(parsed?.key || '', extractQuoted(raw, 'key'))
  }
}

function readVerify(raw: string) {
  try {
    const v = parseJsonLoose<{
      sameAnswer: boolean
      finalAnswer: string
      faster: string
      analysis: string
      accept: boolean
    }>(raw)
    return {
      sameAnswer: Boolean(v.sameAnswer),
      finalAnswer: v.finalAnswer || '',
      faster: v.faster || '',
      analysis: v.analysis || '',
      accept: Boolean(v.accept)
    }
  } catch {
    return {
      sameAnswer: false,
      finalAnswer: extractQuoted(raw, 'finalAnswer'),
      faster: extractQuoted(raw, 'faster'),
      analysis: extractQuoted(raw, 'analysis') || raw.slice(0, 2000),
      accept: false
    }
  }
}

export async function solveQuestion(stem: string, onProgress?: (p: ExamProgress) => void) {
  const settings = loadSettings()
  onProgress?.({ step: 0, total: 3, label: '正在检索教材原文' })
  const { hits } = await retrieve(stem, 10)
  const ctx = formatContext(hits)
  const ask = (tag: 'A' | 'B', lane: 'sa' | 'sb') =>
    chatStream(
      {
        model: tag === 'A' ? settings.roles.genA : settings.roles.genB,
        messages: [
          { role: 'system', content: systemPrompt() },
          {
            role: 'user',
            content: [
              `用${tag === 'A' ? '上海等级考常规思维（先情境再分空）' : '另一条独立路径，尽量找更快捷算法'}逐步求解。`,
              '输出 JSON：{"steps":"...Markdown+LaTeX...","answer":"...","key":"..."}',
              `题目：\n${stem}`,
              `教材摘录：\n${ctx}`
            ].join('\n')
          }
        ]
      },
      (delta) => onProgress?.({ step: 1, total: 3, label: `解法 ${tag} 正在求解`, lane, delta })
    )

  onProgress?.({ step: 1, total: 3, label: '两模型并行求解', lane: 'sa', reset: true })
  onProgress?.({ step: 1, total: 3, label: '两模型并行求解', lane: 'sb', reset: true })
  const settled = await Promise.allSettled([ask('A', 'sa'), ask('B', 'sb')])
  const rawA = settled[0].status === 'fulfilled' ? settled[0].value : String(settled[0].reason)
  const rawB = settled[1].status === 'fulfilled' ? settled[1].value : String(settled[1].reason)
  const sA = readSolve(rawA)
  const sB = readSolve(rawB)

  onProgress?.({ step: 2, total: 3, label: '仲裁正在核对两解', lane: 'sv', reset: true })
  const checkRaw = await chatStream(
    {
      model: settings.roles.arbiter,
      messages: [
        { role: 'system', content: systemPrompt() + '你验证两解是否互相印证，并指出更快捷的解法。' },
        {
          role: 'user',
          content: [
            '输出 JSON：{"sameAnswer":true,"finalAnswer":"...","faster":"更快捷解法或无","analysis":"...","accept":true}',
            `题目：${stem}`,
            `解法A：${JSON.stringify(sA)}`,
            `解法B：${JSON.stringify(sB)}`,
            `教材：\n${ctx}`
          ].join('\n')
        }
      ]
    },
    (delta) => onProgress?.({ step: 2, total: 3, label: '仲裁正在核对两解', lane: 'sv', delta })
  )
  const check = readVerify(checkRaw)
  onProgress?.({ step: 3, total: 3, label: '双解验证完成' })

  return {
    methodA: { model: settings.roles.genA, ...sA },
    methodB: { model: settings.roles.genB, ...sB },
    verify: { model: settings.roles.arbiter, ...check },
    sources: hits.map((h) => ({ bookId: h.bookId, page: h.page, score: h.score }))
  }
}

export async function judgeAnswer(
  stem: string,
  student: string,
  official?: { answer?: string; analysis?: string; options?: string[]; blanks?: { id: string; answer: string; kind: string }[]; reason?: string },
  onProgress?: (p: ExamProgress) => void
) {
  const settings = loadSettings()
  const { hits } = await retrieve(`${stem}\n${student}`, 8)
  const ctx = formatContext(hits)
  onProgress?.({ step: 0, total: 1, label: '对照仲裁答案阅卷', lane: 'judge', reset: true })
  const raw = await chatStream(
    {
      model: settings.roles.arbiter,
      messages: [
        { role: 'system', content: systemPrompt() + '你是等级考阅卷教师。必须依据仲裁给出的参考答案判分，不要另起一套答案。' },
        {
          role: 'user',
          content: [
            '对照仲裁参考答案，给学生作答判分。输出 JSON：',
            '{"score":0,"max":10,"verdict":"正确|部分正确|错误","comment":"Markdown","rightAnswer":"...","analysis":"..."}',
            `题目：${stem}`,
            official?.answer ? `仲裁参考答案：${official.answer}` : '',
            official?.options?.length ? `选项：${official.options.join(' / ')}` : '',
            official?.blanks?.length ? `仲裁分空：${JSON.stringify(official.blanks)}` : '',
            official?.analysis ? `仲裁解析：${official.analysis}` : '',
            official?.reason ? `仲裁说明：${official.reason}` : '',
            `学生作答：${student || '（空白）'}`,
            `教材：\n${ctx}`
          ].filter(Boolean).join('\n')
        }
      ]
    },
    (delta) => onProgress?.({ step: 1, total: 1, label: '正在根据作答判分', lane: 'judge', delta })
  )
  try {
    return parseJsonLoose<{
      score: number
      max: number
      verdict: string
      comment: string
      rightAnswer: string
      analysis: string
    }>(raw)
  } catch {
    return {
      score: 0,
      max: 10,
      verdict: '待复核',
      comment: raw.slice(0, 2000),
      rightAnswer: official?.answer || '',
      analysis: official?.analysis || ''
    }
  }
}

export async function extractGraph(bookId?: string) {
  const settings = loadSettings()
  const q = bookId
    ? `提炼${bookId}教材的高考考点与知识点，形成知识图谱`
    : '提炼沪科版高中化学教材的高考考点与知识点，形成知识图谱'
  const { hits } = await retrieve(q, 14, bookId)
  const ctx = formatContext(hits)
  const raw = await chatComplete({
    model: settings.roles.chat,
    messages: [
      { role: 'system', content: systemPrompt() },
      {
        role: 'user',
        content: [
          '根据教材摘录提炼知识节点与关系。只输出 JSON：',
          '{"nodes":[{"id":"n1","label":"物质的量","kind":"concept|exam|chapter","bookId":"b1","page":20}],',
          '"links":[{"source":"n1","target":"n2","rel":"包含|前置|应用"}]}',
          '节点 12-24 个，label 短，不要杜撰教材没有的内容。',
          `教材摘录：\n${ctx}`
        ].join('\n')
      }
    ],
    json: true
  })
  return parseJsonLoose<{
    nodes: { id: string; label: string; kind: string; bookId?: string; page?: number }[]
    links: { source: string; target: string; rel: string }[]
  }>(raw)
}

function labelType(t: ExamType): string {
  if (t === 'choice') return '不定项 / 单选题（可嵌在综合题里）'
  if (t === 'short') return '简答评价题'
  if (t === 'gaokao') return '上海等级考综合题（8～12 个小空的压缩版，4～6 空即可）'
  return '综合性大题'
}

function specForType(t: ExamType): string {
  if (t === 'choice') {
    return [
      '只出一道不定项或单选题，选项必须完整写出 A–D（必要时 E）。不要出多空综合题。',
      '只输出 JSON：',
      '{"type":"choice","stem":"Markdown+LaTeX","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A 或 A,C","analysis":"...","examPoints":["..."]}'
    ].join('\n')
  }
  if (t === 'short') {
    return [
      '只出一道简答或评价题（写方程式、判断并说明理由）。不要做成 4 空以上综合题。',
      '只输出 JSON：',
      '{"type":"short","stem":"Markdown+LaTeX","answer":"采分点","analysis":"...","examPoints":["..."]}'
    ].join('\n')
  }
  const kind = t === 'comprehensive' ? 'comprehensive' : 'gaokao'
  return [
    'stem 写成综合题：一段工业/实验情境 + (1)(2)(3)(4) 小空，混入填空、简答、小计算，必要时带一个不定项。',
    '只输出 JSON：',
    `{"type":"${kind}","stem":"Markdown+LaTeX","options":[],"blanks":[{"id":"(1)","answer":"...","kind":"blank|choice|calc|short"}],"answer":"各空参考答案","analysis":"步骤与细节坑","examPoints":["..."]}`
  ].join('\n')
}
