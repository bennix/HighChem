import { useEffect, useRef, useState } from 'react'
import { MOLECULES } from '../lib/molecules'
import { LOCAL_XYZ } from '../lib/mol-xyz'
import { AtomLegend, MoleculeViewer } from '../components/MoleculeViewer'
import { MarkdownView } from '../components/MarkdownView'
import { rememberAsk } from '../lib/last-ask'

const PROMPTS = ['空间结构是怎样的？', '分子极性和化学键如何判断？', '教材里写了哪些性质？', '相关离子方程式怎么写？']

export function Lab() {
  const [id, setId] = useState(MOLECULES[0].id)
  const [elems, setElems] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [threadId, setThreadId] = useState('')
  const [reply, setReply] = useState('')
  const [stream, setStream] = useState('')
  const [busy, setBusy] = useState(false)
  const live = useRef('')
  const mol = MOLECULES.find((m) => m.id === id) || MOLECULES[0]
  const focus = `${mol.name}（${mol.formula}），教材知识点：${mol.note}，组成原子：${elems.join('、') || mol.formula}`

  useEffect(() => {
    setReply('')
    setStream('')
    setQ('')
    setElems([])
    setThreadId('')
    live.current = ''
  }, [id])

  async function ask(text: string) {
    const question = text.trim()
    if (!question) return
    const tid = `lab-${Date.now().toString(36)}`
    live.current = tid
    setThreadId(tid)
    setBusy(true)
    setStream('')
    setReply('')
    const unsub = window.highchem.chat.onDelta((p) => {
      if (!p?.delta || !live.current) return
      if (!p.threadId || p.threadId === tid) setStream((s) => s + p.delta)
    })
    try {
      const res = await window.highchem.chat.ask({
        threadId: tid,
        title: `${mol.name} · 分子问答`,
        text: question,
        focus,
        history: []
      })
      if (res.error) setReply(res.error)
      else {
        setReply(res.full || '')
        rememberAsk(question, res.full || '')
        setStream('')
        setQ('')
      }
    } finally {
      unsub()
      live.current = ''
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="grid" style={{ gridTemplateColumns: '260px minmax(0, 1fr)' }}>
        <aside className="card" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 140px)' }}>
          {MOLECULES.map((m) => (
            <button key={m.id} className={`item ${m.id === id ? 'on' : ''}`} onClick={() => setId(m.id)} style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }}>
              <strong>{m.name}</strong>
              <div className="small muted">{m.formula} · {m.note}</div>
            </button>
          ))}
        </aside>
        <div style={{ minWidth: 0, display: 'grid', gap: 14 }}>
          <section className="card">
            <h3>{mol.name}　{mol.formula}</h3>
            <p className="muted">拖转旋转，滚轮缩放。点复位回到默认位置、缩放和旋转。原子旁标注元素中文名。对应教材：{mol.note}</p>
            <MoleculeViewer key={mol.id} id={mol.id} name={mol.name} formula={mol.formula} xyz={LOCAL_XYZ[mol.id]} onAtoms={setElems} />
            <AtomLegend elems={elems} />
          </section>
          <section className="card">
            <h3>按课本问这个分子</h3>
            <p className="small muted">带着 {mol.formula} 检索教材原文，回答会边生成边显示。</p>
            <div className="chips" style={{ margin: '8px 0' }}>
              {PROMPTS.map((p) => (
                <button key={p} className="chip" onClick={() => ask(p)} disabled={busy}>{p}</button>
              ))}
            </div>
            <div className="field">
              <label>问题</label>
              <textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder={`例如：${mol.formula} 在教材中如何体现氧化性？`} />
            </div>
            <button className="btn primary" disabled={busy || !q.trim()} onClick={() => ask(q)}>
              {busy ? '正在检索教材…' : '提问'}
            </button>
            {busy || stream || reply ? (
              <div className="card paper" style={{ marginTop: 12 }}>
                {stream || reply ? (
                  <MarkdownView text={(stream || reply) + (busy ? ' ▍' : '')} paper />
                ) : (
                  <p className="muted">正在检索教材并流式作答…</p>
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
