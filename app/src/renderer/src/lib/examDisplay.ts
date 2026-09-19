export function sanitizeExamMarkdown(text: string): string {
  if (!text) return ''
  let s = text.replace(/\r\n/g, '\n').replace(/[\u0008\u000c\r]/g, '')
  s = s.replace(/\$\)\s*(\\ce)/g, '$$$1')
  s = wrapBareCe(s)
  s = s.split('\n\n').map(balanceDollars).join('\n\n')
  return s
}

function findBraceEnd(s: string, openAt: number): number {
  let depth = 0
  for (let i = openAt; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function wrapBareCe(s: string): string {
  let out = ''
  let i = 0
  let inDollar = false
  while (i < s.length) {
    if (s[i] === '$') {
      if (s[i + 1] === '$') {
        out += '$$'
        i += 2
        continue
      }
      inDollar = !inDollar
      out += '$'
      i++
      continue
    }
    if (!inDollar && s.startsWith('\\ce{', i)) {
      const end = findBraceEnd(s, i + 3)
      if (end > 0) {
        out += '$' + s.slice(i, end + 1) + '$'
        i = end + 1
        continue
      }
    }
    out += s[i]
    i++
  }
  return out
}

function balanceDollars(block: string): string {
  let i = 0
  let singles = 0
  while (i < block.length) {
    if (block[i] === '$') {
      if (block[i + 1] === '$') {
        i += 2
        continue
      }
      singles++
      i++
    } else i++
  }
  return singles % 2 ? `${block}$` : block
}

export type ExamQ = {
  type: string
  stem: string
  options?: string[]
  blanks?: { id: string; answer: string; kind: string }[]
  answer: string
  analysis: string
  examPoints?: string[]
}

export function typeLabel(t: string): string {
  if (t === 'choice') return '不定项 / 单选'
  if (t === 'short') return '简答评价'
  if (t === 'comprehensive') return '综合大题'
  if (t === 'gaokao') return '等级考综合题'
  return t || '等级考综合题'
}

export function kindLabel(k: string): string {
  if (k === 'choice') return '选择'
  if (k === 'calc') return '计算'
  if (k === 'short') return '简答'
  return '填空'
}

export function optionLetter(opt: string, i: number): string {
  const m = opt.match(/^\s*([A-H])[.、．\s]/)
  return m ? m[1] : String.fromCharCode(65 + i)
}

export function fmtDraft(q: ExamQ): string {
  return [
    `**${typeLabel(q.type)}**`,
    q.stem,
    (q.options || []).join('\n\n'),
    q.blanks?.length ? `**空** ${q.blanks.map((b) => `${b.id}（${kindLabel(b.kind)}）`).join('　')}` : '',
    q.examPoints?.length ? `**考点** ${q.examPoints.join('、')}` : ''
  ].filter(Boolean).join('\n\n')
}

export function fmtAsk(q: ExamQ): string {
  const blanks = (q.blanks || []).map((b) => `${b.id}（${kindLabel(b.kind)}）`).join('　')
  return [
    q.stem,
    blanks ? `**待填空** ${blanks}` : '',
    q.examPoints?.length ? `**考点** ${q.examPoints.join('、')}` : ''
  ].filter(Boolean).join('\n\n')
}

export function fmtKey(q: ExamQ, judge?: { rightAnswer: string; analysis: string }): string {
  const blanks = (q.blanks || []).map((b) => `${b.id}（${kindLabel(b.kind)}） ${b.answer}`).join('\n')
  return [
    `**参考答案**\n${judge?.rightAnswer || q.answer}`,
    blanks ? `**分空**\n${blanks}` : '',
    `**解析**\n${judge?.analysis || q.analysis}`
  ].filter(Boolean).join('\n\n')
}

export function showExtraBox(q: ExamQ): boolean {
  if (q.type === 'short' || q.type === 'comprehensive' || q.type === 'gaokao' || !q.type) return true
  if (q.blanks?.some((b) => b.kind === 'short' || b.kind === 'calc')) return true
  return !q.options?.length && !q.blanks?.length
}

export function extraLabel(q: ExamQ): string {
  if (q.type === 'choice') return '补充说明（可选）'
  if (q.type === 'short') return '简答 / 评价'
  return '书面作答 / 计算过程'
}

export function collectStudent(q: ExamQ, picks: string[], blanks: Record<string, string>, extra: string): string {
  const parts: string[] = []
  if (q.options?.length) parts.push(`选项：${picks.join('、') || '未选'}`)
  if (q.blanks?.length) parts.push(q.blanks.map((b) => `${b.id}：${blanks[b.id]?.trim() || '（空白）'}`).join('\n'))
  if (extra.trim()) parts.push(extra.trim())
  return parts.join('\n') || '（空白）'
}

export function hasAttempt(q: ExamQ, picks: string[], blanks: Record<string, string>, extra: string): boolean {
  if (picks.length) return true
  if (Object.values(blanks).some((v) => v.trim())) return true
  if (extra.trim()) return true
  return false
}
