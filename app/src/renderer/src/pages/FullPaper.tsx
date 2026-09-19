import { useEffect, useState } from 'react'
import { MarkdownView } from '../components/MarkdownView'

type PaperQ = { id: string; section: string; stem: string; answer: string; analysis: string; examPoints?: string[]; max: number }
type Paper = { id?: string; title: string; accept: boolean; verdict: string; questions: PaperQ[]; createdAt?: number }

export function FullPaper() {
  const [busy, setBusy] = useState('')
  const [prog, setProg] = useState('')
  const [draft, setDraft] = useState<Paper | null>(null)
  const [saved, setSaved] = useState<Paper[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState(false)
  const [grade, setGrade] = useState<null | { score: number; max: number; parts: { id: string; section: string; score: number; max: number; verdict: string; comment: string }[] }>(null)

  async function reload() {
    setSaved(await window.highchem.papers.list())
  }
  useEffect(() => {
    reload()
    return window.highchem.exam.onPaperProgress((p) => setProg(`${p.label}（${p.step}/${p.total}）`))
  }, [])

  async function make() {
    setBusy('gen')
    setGrade(null)
    setAnswers({})
    try {
      const paper = await window.highchem.exam.paper()
      setDraft({ ...paper, createdAt: Date.now() })
    } finally {
      setBusy('')
      setProg('')
    }
  }

  async function saveDraft() {
    if (!draft) return
    await window.highchem.papers.save({ ...draft, id: draft.id || `paper-${Date.now()}` })
    for (const q of draft.questions) {
      await window.highchem.bank.save({
        id: `q-${Date.now()}-${q.id}`,
        type: 'gaokao',
        stem: `${q.section}\n\n${q.stem}`,
        answer: q.answer,
        analysis: q.analysis,
        nodes: q.examPoints,
        source: draft.title,
        createdAt: Date.now()
      })
    }
    alert('整卷已保存，四道大题已入库')
    reload()
  }

  async function mark() {
    if (!draft) return
    setBusy('grade')
    try {
      setGrade(await window.highchem.exam.gradePaper(draft, answers))
    } finally {
      setBusy('')
    }
  }

  async function exp(paper: Paper) {
    const md = [`# ${paper.title}`, paper.verdict, ...paper.questions.map((q) => `## ${q.section}\n\n${q.stem}\n\n**答案**\n${q.answer}\n\n${q.analysis}`)].join('\n\n')
    await window.highchem.exportWrite(`${paper.title}.md`, md)
  }

  return (
    <div>
      <section className="card">
        <h3>整套等级考模拟卷</h3>
        <p className="muted">四道综合题：原理综合 · 结构与元素 · 有机合成 · 工业流程/实验。每题双模型命题，再由仲裁合成整卷。</p>
        <div className="row">
          <button className="btn primary" disabled={Boolean(busy)} onClick={make}>
            {busy === 'gen' ? '正在组卷…' : '生成一整套试卷'}
          </button>
          <span className="small muted">{prog}</span>
        </div>
        <p className="small muted">大约要跑 13 次模型调用，请保持网络畅通。</p>
      </section>

      {draft ? (
        <section className="card paper" style={{ marginTop: 12 }}>
          <h3>{draft.title}</h3>
          <p>{draft.accept ? '仲裁认为可以成卷' : '仲裁有保留，可改后再存'} · {draft.verdict}</p>
          <div className="row">
            <button className="btn primary" onClick={saveDraft}>入库整卷与四道大题</button>
            <button className="btn" onClick={() => exp(draft)}>导出 Markdown</button>
            <button className="btn ghost" onClick={() => setShowKey((v) => !v)}>{showKey ? '隐藏答案' : '显示答案'}</button>
          </div>
          {draft.questions.map((q) => (
            <article key={q.id} style={{ marginTop: 16 }}>
              <h3>{q.section}</h3>
              <MarkdownView text={q.stem} paper />
              <div className="field">
                <label>作答（可分空书写）</label>
                <textarea value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              </div>
              {showKey ? <MarkdownView text={`**参考答案**\n${q.answer}\n\n${q.analysis}`} paper /> : null}
            </article>
          ))}
          <button className="btn primary" disabled={busy === 'grade'} onClick={mark}>
            {busy === 'grade' ? '整卷阅卷中…' : 'AI 整卷判题'}
          </button>
        </section>
      ) : null}

      {grade ? (
        <section className="card" style={{ marginTop: 12 }}>
          <h3>得分 {grade.score} / {grade.max}</h3>
          {grade.parts.map((p) => (
            <div key={p.id}>
              <p>{p.section} · {p.verdict} · {p.score}/{p.max}</p>
              <MarkdownView text={p.comment} />
            </div>
          ))}
        </section>
      ) : null}

      <section className="card" style={{ marginTop: 12 }}>
        <h3>已存试卷</h3>
        {saved.map((p) => (
          <div className="item" key={p.id}>
            <button className="btn ghost" onClick={() => { setDraft(p); setGrade(null) }}>{p.title}</button>
            <button className="btn" onClick={() => exp(p)}>导出</button>
            <button className="btn danger" onClick={async () => { await window.highchem.papers.delete([p.id!]); reload(); if (draft?.id === p.id) setDraft(null) }}>删除</button>
          </div>
        ))}
        {!saved.length ? <p className="muted">还没有整卷。</p> : null}
      </section>
    </div>
  )
}
