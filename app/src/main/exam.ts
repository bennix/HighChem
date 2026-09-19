import { chatComplete, parseJsonLoose } from './zenmux'
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

function systemPrompt(): string {
  return [
    '你是上海等级考化学命题教师，教材是沪科版（上海科学技术出版社）。',
    '必须依据教材原文，不得超纲。第一册结构只到键型与简单电子式。',
    '化学式用 LaTeX / mhchem：$n=\\dfrac{m}{M}=\\dfrac{N}{N_A}=\\dfrac{V}{V_m}=cV$，$\\ce{Cl2 + 2NaOH -> NaCl + NaClO + H2O}$。',
    '输出简体中文 Markdown。'
  ].join('')
}

export async function generateQuestion(params: {
  type: ExamType
  nodes: { id: string; label: string; bookId?: string }[]
}) {
  const settings = loadSettings()
  const topic = params.nodes.map((n) => n.label).join('、')
  const { hits } = await retrieve(`上海等级考 ${topic} 粗盐 氯气 离子方程式 物质的量`, 10)
  const ctx = formatContext(hits)

  const user = [
    `按上海等级考风格出一道${labelType(params.type)}。可跨第1–4章原位迁移，但不要做成全国卷那种「选择 40 分」。`,
    `知识节点：${topic || '必修第一册高频考点'}`,
    guidePrompt(topic),
    'stem 写成综合题：一段工业/实验情境 + (1)(2)(3)(4) 小空，混入填空、简答、小计算，必要时带一个不定项。',
    '只输出 JSON：',
    '{"type":"gaokao","stem":"Markdown+LaTeX","options":[],"blanks":[{"id":"(1)","answer":"...","kind":"blank"}],"answer":"各空参考答案","analysis":"步骤与细节坑","examPoints":["..."]}',
    '教材摘录：',
    ctx || '（索引未建立时严格按大纲高频考点，并在 analysis 注明依据不足）'
  ].join('\n')

  const [rawA, rawB] = await Promise.all([
    chatComplete({
      model: settings.roles.genA,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: user + '\n请用模型A的思路独立命题。' }
      ],
      json: true,
      
    }),
    chatComplete({
      model: settings.roles.genB,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: user + '\n请用模型B的思路独立命题，不要模仿常见套路。' }
      ],
      json: true,
      
    })
  ])

  const qA = parseJsonLoose<GeneratedQuestion>(rawA)
  const qB = parseJsonLoose<GeneratedQuestion>(rawB)

  const verdictRaw = await chatComplete({
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
    ],
    json: true,
    
  })

  const verdict = parseJsonLoose<{
    accept: boolean
    reason: string
    winner: 'A' | 'B' | 'merge'
    question?: GeneratedQuestion
  }>(verdictRaw)

  return {
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
}

export async function solveQuestion(stem: string) {
  const settings = loadSettings()
  const { hits } = await retrieve(stem, 10)
  const ctx = formatContext(hits)
  const ask = (tag: string) =>
    chatComplete({
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
      ],
      json: true,
      
    })

  const [rawA, rawB] = await Promise.all([ask('A'), ask('B')])
  const sA = parseJsonLoose<{ steps: string; answer: string; key: string }>(rawA)
  const sB = parseJsonLoose<{ steps: string; answer: string; key: string }>(rawB)

  const check = parseJsonLoose<{
    sameAnswer: boolean
    finalAnswer: string
    faster: string
    analysis: string
    accept: boolean
  }>(
    await chatComplete({
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
      ],
      json: true,
      
    })
  )

  return {
    methodA: { model: settings.roles.genA, ...sA },
    methodB: { model: settings.roles.genB, ...sB },
    verify: { model: settings.roles.arbiter, ...check },
    sources: hits.map((h) => ({ bookId: h.bookId, page: h.page, score: h.score }))
  }
}

export async function judgeAnswer(stem: string, student: string) {
  const settings = loadSettings()
  const { hits } = await retrieve(`${stem}\n${student}`, 8)
  const ctx = formatContext(hits)
  const raw = await chatComplete({
    model: settings.roles.arbiter,
    messages: [
      { role: 'system', content: systemPrompt() },
      {
        role: 'user',
        content: [
          '按高考阅卷给这道学生作答判分。输出 JSON：',
          '{"score":0,"max":10,"verdict":"正确|部分正确|错误","comment":"Markdown","rightAnswer":"...","analysis":"..."}',
          `题目：${stem}`,
          `学生作答：${student}`,
          `教材：\n${ctx}`
        ].join('\n')
      }
    ],
    json: true,
    
  })
  return parseJsonLoose(raw)
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

const PAPER_SECTIONS = [
  {
    id: 'I',
    section: '第Ⅰ题　原理综合（25 分）',
    max: 25,
    nodes: [
      { id: 'p-h', label: '盖斯定律与ΔH' },
      { id: 'p-g', label: 'ΔG=ΔH-TΔS' },
      { id: 'p-eq', label: '速率与平衡 合成氨' }
    ]
  },
  {
    id: 'II',
    section: '第Ⅱ题　结构与元素（25 分）',
    max: 25,
    nodes: [
      { id: 'p-atom', label: '电负性 电离能 晶胞' },
      { id: 'p-el', label: '金属或卤素硫氮性质' }
    ]
  },
  {
    id: 'III',
    section: '第Ⅲ题　有机合成（25 分）',
    max: 25,
    nodes: [
      { id: 'p-org1', label: '乙醇乙酸官能团' },
      { id: 'p-org2', label: '保护基 手性 合成路线' }
    ]
  },
  {
    id: 'IV',
    section: '第Ⅳ题　工业流程与实验（25 分）',
    max: 25,
    nodes: [
      { id: 'p-flow', label: '金属提取 电化学 滴定 绿色化学' },
      { id: 'p-exp', label: '粗盐或菠菜中铁实验评价' }
    ]
  }
]

export async function generatePaper(onProgress?: (p: { step: number; total: number; label: string }) => void) {
  const settings = loadSettings()
  const questions: {
    id: string
    section: string
    stem: string
    answer: string
    analysis: string
    examPoints?: string[]
    max: number
    modelA?: string
    modelB?: string
  }[] = []

  let step = 0
  const total = PAPER_SECTIONS.length + 1
  for (const sec of PAPER_SECTIONS) {
    onProgress?.({ step, total, label: `双模型命制${sec.section}` })
    const one = await generateQuestion({ type: 'gaokao', nodes: sec.nodes })
    const q = one.verdict.question
    questions.push({
      id: sec.id,
      section: sec.section,
      stem: q.stem,
      answer: q.answer,
      analysis: q.analysis,
      examPoints: q.examPoints,
      max: sec.max,
      modelA: JSON.stringify(one.modelA.question.stem),
      modelB: JSON.stringify(one.modelB.question.stem)
    })
    step += 1
  }

  onProgress?.({ step, total, label: '仲裁整卷覆盖与超纲' })
  const review = parseJsonLoose<{ accept: boolean; reason: string; title: string }>(
    await chatComplete({
      model: settings.roles.arbiter,
      messages: [
        { role: 'system', content: systemPrompt() },
        {
          role: 'user',
          content: [
            '审阅这套上海等级考化学卷。必须四条主线齐全：原理综合、结构+元素、有机合成、工业/实验。',
            '检查深度：第Ⅲ题前几空应是必修有机水平；第Ⅰ题才允许 ΔG 与 K；第Ⅱ题才允许晶胞/杂化。',
            '输出 JSON：{"accept":true,"reason":"...","title":"20xx 风格模拟卷·短标题"}',
            JSON.stringify(questions.map((q) => ({ id: q.id, section: q.section, stem: q.stem, points: q.examPoints })))
          ].join('\n')
        }
      ],
      json: true,
      
    })
  )

  return {
    title: review.title || '上海等级考化学模拟卷',
    accept: Boolean(review.accept),
    verdict: review.reason,
    questions,
    models: { genA: settings.roles.genA, genB: settings.roles.genB, arbiter: settings.roles.arbiter }
  }
}

export async function gradePaper(paper: { questions: { id: string; section: string; stem: string; answer: string; max: number }[] }, answers: Record<string, string>) {
  const parts = await Promise.all(
    paper.questions.map(async (q) => {
      const one = (await judgeAnswer(
        `${q.section}\n${q.stem}\n参考答案：${q.answer}\n满分 ${q.max}`,
        answers[q.id] || '（空白）'
      )) as { score: number; max: number; verdict: string; comment: string; rightAnswer: string; analysis: string }
      return { id: q.id, section: q.section, ...one, max: q.max, score: Math.min(q.max, Number(one.score) || 0) }
    })
  )
  const score = parts.reduce((s, p) => s + p.score, 0)
  const max = parts.reduce((s, p) => s + p.max, 0)
  return { score, max, parts }
}

function labelType(t: ExamType): string {
  if (t === 'choice') return '不定项 / 单选题（可嵌在综合题里）'
  if (t === 'short') return '简答评价题'
  if (t === 'gaokao') return '上海等级考综合题（8～12 个小空的压缩版，4～6 空即可）'
  return '综合性大题'
}
