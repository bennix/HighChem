import { useEffect, useState } from 'react'
import { MarkdownView } from '../components/MarkdownView'

type Q = {
  id: string
  type: string
  stem: string
  options?: string[]
  answer: string
  analysis: string
  methodA?: string
  methodB?: string
  faster?: string
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
              <MarkdownView text={`**${cur.type}**\n\n${cur.stem}\n\n${(cur.options || []).join('\n\n')}\n\n**答案** ${cur.answer}\n\n${cur.analysis}`} paper />
              {cur.methodA ? <MarkdownView text={`## 解法 A\n\n${cur.methodA}`} paper /> : null}
              {cur.methodB ? <MarkdownView text={`## 解法 B\n\n${cur.methodB}`} paper /> : null}
              {cur.faster ? <MarkdownView text={`## 更快捷的解法\n\n${cur.faster}`} paper /> : null}
            </>
          ) : <p className="muted">点左侧题目查看渲染后的 Markdown / LaTeX。</p>}
        </section>
      </div>
    </div>
  )
}
