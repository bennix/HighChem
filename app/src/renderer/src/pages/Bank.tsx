import { useEffect, useState } from 'react'
import { MarkdownView } from '../components/MarkdownView'

type Q = {
  id: string
  type: string
  stem: string
  options?: string[]
  blanks?: { id: string; answer: string; kind: string }[]
  answer: string
  analysis: string
  methodA?: string
  methodB?: string
  faster?: string
  verdict?: string
  genVerdict?: string
  createdAt: number
}

export function Bank() {
  const [items, setItems] = useState<Q[]>([])
  const [sel, setSel] = useState<string[]>([])
  const [cur, setCur] = useState<Q | null>(null)

  async function reload() {
    setItems(await window.highchem.bank.list())
  }
  useEffect(() => { reload() }, [])

  async function del() {
    await window.highchem.bank.delete(sel)
    setSel([])
    setCur(null)
    reload()
  }

  async function exp(kind: 'json' | 'md') {
    const rows = items.filter((i) => !sel.length || sel.includes(i.id))
    const content = kind === 'json'
      ? JSON.stringify(rows, null, 2)
      : rows.map((q) => `# ${q.type}\n\n${q.stem}\n\n答案：${q.answer}\n\n${q.analysis}`).join('\n\n---\n\n')
    await window.highchem.exportWrite(kind === 'json' ? '题库.json' : '题库.md', content)
  }

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn" onClick={() => setSel(items.map((i) => i.id))}>全选</button>
        <button className="btn" onClick={() => setSel([])}>清空选择</button>
        <button className="btn danger" disabled={!sel.length} onClick={del}>批量删除</button>
        <button className="btn" onClick={() => exp('json')}>导出 JSON</button>
        <button className="btn" onClick={() => exp('md')}>导出 Markdown</button>
      </div>
      <div className="grid split">
        <aside className="card" style={{ overflow: 'auto' }}>
          {items.map((q) => (
            <label key={q.id} className={`item ${cur?.id === q.id ? 'on' : ''}`}>
              <input type="checkbox" checked={sel.includes(q.id)} onChange={(e) => setSel(e.target.checked ? [...sel, q.id] : sel.filter((id) => id !== q.id))} />
              <button className="btn ghost" onClick={() => setCur(q)} style={{ textAlign: 'left', flex: 1 }}>{q.stem.slice(0, 48)}</button>
            </label>
          ))}
          {!items.length ? <p className="muted">题库还是空的。</p> : null}
        </aside>
        <section className="card paper">
          {cur ? (
            <>
              <MarkdownView text={[
                `**${typeLabel(cur.type)}**`,
                cur.stem,
                (cur.options || []).join('\n\n'),
                cur.blanks?.length ? `**分空**\n${cur.blanks.map((b) => `${b.id}（${kindLabel(b.kind)}） ${b.answer}`).join('\n')}` : '',
                `**答案** ${cur.answer}`,
                cur.analysis
              ].filter(Boolean).join('\n\n')} paper />
              {cur.genVerdict ? <MarkdownView text={`## 命题仲裁\n\n${cur.genVerdict}`} paper /> : null}
              {cur.methodA ? <MarkdownView text={`## 解法 A\n\n${cur.methodA}`} paper /> : null}
              {cur.methodB ? <MarkdownView text={`## 解法 B\n\n${cur.methodB}`} paper /> : null}
              {cur.faster ? <MarkdownView text={`## 更快捷的解法\n\n${cur.faster}`} paper /> : null}
              {cur.verdict ? <MarkdownView text={`## 双解仲裁\n\n${cur.verdict}`} paper /> : null}
            </>
          ) : <p className="muted">点左侧题目查看渲染后的 Markdown / LaTeX。</p>}
        </section>
      </div>
    </div>
  )
}

function typeLabel(t: string): string {
  if (t === 'choice') return '不定项 / 单选'
  if (t === 'short') return '简答评价'
  if (t === 'comprehensive') return '综合大题'
  if (t === 'gaokao') return '等级考综合题'
  return t
}

function kindLabel(k: string): string {
  if (k === 'choice') return '选择'
  if (k === 'calc') return '计算'
  if (k === 'short') return '简答'
  return '填空'
}
