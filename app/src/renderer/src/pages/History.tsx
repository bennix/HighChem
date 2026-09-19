import { useEffect, useState } from 'react'
import { MarkdownView } from '../components/MarkdownView'

type Thread = { id: string; title: string; messages: { id: string; role: string; content: string }[]; updatedAt: number }

export function History({ onContinue }: { onContinue: (id: string) => void }) {
  const [items, setItems] = useState<Thread[]>([])
  const [sel, setSel] = useState<string[]>([])
  const [cur, setCur] = useState<Thread | null>(null)

  async function reload() {
    setItems(await window.highchem.chat.list())
  }
  useEffect(() => { reload() }, [])

  async function del() {
    await window.highchem.chat.delete(sel)
    setSel([])
    setCur(null)
    reload()
  }

  async function exp(kind: 'json' | 'md') {
    const rows = items.filter((i) => !sel.length || sel.includes(i.id))
    const content = kind === 'json'
      ? JSON.stringify(rows, null, 2)
      : rows.map((t) => `# ${t.title}\n\n` + t.messages.map((m) => `**${m.role}**\n\n${m.content}`).join('\n\n')).join('\n\n---\n\n')
    await window.highchem.exportWrite(kind === 'json' ? '对话历史.json' : '对话历史.md', content)
  }

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn" onClick={() => setSel(items.map((i) => i.id))}>全选</button>
        <button className="btn danger" disabled={!sel.length} onClick={del}>批量删除</button>
        <button className="btn" onClick={() => exp('json')}>导出 JSON</button>
        <button className="btn" onClick={() => exp('md')}>导出 Markdown</button>
        <button className="btn primary" disabled={!cur} onClick={() => cur && onContinue(cur.id)}>基于此对话追问</button>
      </div>
      <div className="grid split">
        <aside className="card">
          {items.map((t) => (
            <label key={t.id} className={`item ${cur?.id === t.id ? 'on' : ''}`}>
              <input type="checkbox" checked={sel.includes(t.id)} onChange={(e) => setSel(e.target.checked ? [...sel, t.id] : sel.filter((id) => id !== t.id))} />
              <button className="btn ghost" onClick={() => setCur(t)}>{t.title}</button>
            </label>
          ))}
        </aside>
        <section className="card paper">
          {cur?.messages.map((m) => (
            <div key={m.id}>
              <p className="small muted">{m.role}</p>
              <MarkdownView text={m.content} paper />
            </div>
          )) || <p className="muted">选择一段对话。</p>}
        </section>
      </div>
    </div>
  )
}
