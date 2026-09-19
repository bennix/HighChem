import { useEffect, useState } from 'react'
import { MarkdownView } from '../components/MarkdownView'
import { FullPaper } from './FullPaper'

type ExamType = 'choice' | 'short' | 'comprehensive' | 'gaokao'
type Node = { id: string; label: string; bookId?: string }
type Q = {
  type: string
  stem: string
  options?: string[]
  blanks?: { id: string; answer: string; kind: string }[]
  answer: string
  analysis: string
  examPoints?: string[]
}
type Guide = {
  style: string
  assembly?: string
  chapters: { id: string; book?: string; chapter: string; bookId: string; page: number; freq: string; points: string[]; forms: string }[]
  samples: { id: string; title: string; chapters: string[]; stem: string; answer: string; traps: string }[]
}

export function Exam({
  presetNodes,
  presetType
}: {
  presetNodes: Node[]
  presetType: ExamType
}) {
  const [guide, setGuide] = useState<Guide | null>(null)
  const [nodes, setNodes] = useState(presetNodes)
  const [type, setType] = useState<ExamType>(presetType || 'gaokao')
  const [stem, setStem] = useState('')
  const [student, setStudent] = useState('')
  const [busy, setBusy] = useState('')
  const [openGuide, setOpenGuide] = useState(true)
  const [tab, setTab] = useState<'one' | 'paper'>('paper')
  const [gen, setGen] = useState<null | {
    modelA: { model: string; question: Q }
    modelB: { model: string; question: Q }
    verdict: { model: string; accept: boolean; reason: string; winner: string; question: Q }
  }>(null)
  const [sol, setSol] = useState<null | {
    methodA: { model: string; steps: string; answer: string }
    methodB: { model: string; steps: string; answer: string }
    verify: { model: string; sameAnswer: boolean; finalAnswer: string; faster: string; analysis: string; accept: boolean }
  }>(null)
  const [judge, setJudge] = useState<null | { score: number; max: number; verdict: string; comment: string; rightAnswer: string; analysis: string }>(null)

  useEffect(() => {
    window.highchem.exam.guide().then(setGuide)
  }, [])
  useEffect(() => {
    if (presetNodes.length) setNodes(presetNodes)
    if (presetType) setType(presetType)
  }, [presetNodes, presetType])

  async function generate() {
    setBusy('gen')
    try {
      setGen(await window.highchem.exam.generate({ type, nodes }))
    } finally {
      setBusy('')
    }
  }

  async function solve(text: string) {
    setBusy('solve')
    try {
      const r = await window.highchem.exam.solve(text)
      setSol(r)
    } finally {
      setBusy('')
    }
  }

  async function doJudge() {
    setBusy('judge')
    try {
      setJudge(await window.highchem.exam.judge(stem || gen?.verdict.question.stem || '', student))
    } finally {
      setBusy('')
    }
  }

  async function save(q: Q, extra?: Partial<Record<string, string>>) {
    await window.highchem.bank.save({
      id: `q-${Date.now()}`,
      type: q.type,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      analysis: q.analysis,
      nodes: nodes.map((n) => n.label),
      createdAt: Date.now(),
      ...extra
    })
    alert('已入库')
  }

  function useChapter(ch: Guide['chapters'][number]) {
    setNodes([{ id: ch.id, label: ch.chapter, bookId: ch.bookId }])
    setType('gaokao')
  }

  function useSample(s: Guide['samples'][number]) {
    setStem(s.stem)
    setOpenGuide(false)
  }

  const finalQ = gen?.verdict.question

  const books = Array.from(new Set((guide?.chapters || []).map((c) => c.book || '教材')))

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={`btn ${tab === 'paper' ? 'primary' : ''}`} onClick={() => setTab('paper')}>整套试卷</button>
        <button className={`btn ${tab === 'one' ? 'primary' : ''}`} onClick={() => setTab('one')}>单题出题</button>
      </div>
      {tab === 'paper' ? <FullPaper /> : null}
      {tab === 'one' && guide ? (
        <section className="card paper" style={{ marginBottom: 12 }}>
          <div className="row">
            <h3 style={{ margin: 0 }}>上海等级考命题口径</h3>
            <button className="btn ghost" onClick={() => setOpenGuide((v) => !v)}>{openGuide ? '收起' : '展开'}</button>
          </div>
          {openGuide ? (
            <>
              <MarkdownView text={guide.style} paper />
              {guide.assembly ? <p className="small">{guide.assembly}</p> : null}
              {books.map((book) => (
                <div key={book} style={{ marginTop: 12 }}>
                  <h3>{book}</h3>
                  <div className="grid two">
                    {guide.chapters.filter((c) => (c.book || '教材') === book).map((ch) => (
                      <article key={ch.id}>
                        <h3>{ch.chapter}</h3>
                        <p className="small muted">{ch.freq}</p>
                        <MarkdownView text={ch.points.map((p) => `- ${p}`).join('\n')} paper />
                        <p className="small">{ch.forms}</p>
                        <button className="btn" onClick={() => useChapter(ch)}>按本章高频考点出题</button>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
              {guide.samples.map((s) => (
                <article key={s.id} style={{ marginTop: 14 }}>
                  <h3>{s.title}</h3>
                  <MarkdownView text={s.stem} paper />
                  <p className="small muted">细节坑：{s.traps}</p>
                  <details>
                    <summary>参考答案</summary>
                    <MarkdownView text={s.answer} paper />
                  </details>
                  <button className="btn" onClick={() => useSample(s)}>把样题带入双解法</button>
                </article>
              ))}
            </>
          ) : null}
        </section>
      ) : null}

      {tab === 'one' ? <>
      <div className="card">
        <div className="chips">
          {nodes.length ? nodes.map((n) => <span className="chip on" key={n.id}>{n.label}</span>) : <span className="muted">可从图谱点选，或上方点一章</span>}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <select value={type} onChange={(e) => setType(e.target.value as ExamType)}>
            <option value="gaokao">等级考综合题（推荐）</option>
            <option value="comprehensive">综合大题</option>
            <option value="choice">不定项 / 单选</option>
            <option value="short">简答评价</option>
          </select>
          <button className="btn primary" disabled={busy === 'gen' || !nodes.length} onClick={generate}>
            {busy === 'gen' ? '双模型命题中…' : '双模型出题并仲裁'}
          </button>
        </div>
        <p className="small muted">两模型独立命题，仲裁模型按近两年上海卷综合题标准判定能否入库。不要按全国卷「选择 40 分」来出。</p>
      </div>

      {gen ? (
        <div className="grid two" style={{ marginTop: 12 }}>
          <section className="card">
            <h3>模型 A · {gen.modelA.model}</h3>
            <MarkdownView text={fmtQ(gen.modelA.question)} />
          </section>
          <section className="card">
            <h3>模型 B · {gen.modelB.model}</h3>
            <MarkdownView text={fmtQ(gen.modelB.question)} />
          </section>
        </div>
      ) : null}

      {gen ? (
        <section className="card paper" style={{ marginTop: 12 }}>
          <h3>仲裁 · {gen.verdict.model}</h3>
          <p>{gen.verdict.accept ? '可以形成题目' : '不建议入库'} · 采用 {gen.verdict.winner}</p>
          <MarkdownView text={gen.verdict.reason} paper />
          {finalQ ? <MarkdownView text={fmtQ(finalQ)} paper /> : null}
          <div className="row">
            <button className="btn primary" disabled={!gen.verdict.accept || !finalQ} onClick={() => finalQ && save(finalQ, { verdict: gen.verdict.reason })}>
              入库最终题
            </button>
            <button className="btn" onClick={() => finalQ && (setStem(finalQ.stem), solve(finalQ.stem))}>
              双解法求解这道题
            </button>
          </div>
        </section>
      ) : null}

      <section className="card" style={{ marginTop: 12 }}>
        <h3>已有题目：双解法 + 验证</h3>
        <div className="field">
          <label>题目</label>
          <textarea value={stem} onChange={(e) => setStem(e.target.value)} placeholder="粘贴、带入样题或仲裁结果" />
        </div>
        <button className="btn" disabled={busy === 'solve' || !stem} onClick={() => solve(stem)}>
          {busy === 'solve' ? '两模型求解中…' : '两种方法求解并互相印证'}
        </button>
      </section>

      {sol ? (
        <div className="grid two" style={{ marginTop: 12 }}>
          <section className="card">
            <h3>解法 A · {sol.methodA.model}</h3>
            <MarkdownView text={sol.methodA.steps} />
            <p>答案：{sol.methodA.answer}</p>
          </section>
          <section className="card">
            <h3>解法 B · {sol.methodB.model}</h3>
            <MarkdownView text={sol.methodB.steps} />
            <p>答案：{sol.methodB.answer}</p>
          </section>
        </div>
      ) : null}

      {sol ? (
        <section className="card paper" style={{ marginTop: 12 }}>
          <h3>验证 · {sol.verify.model}</h3>
          <p>{sol.verify.sameAnswer ? '两解互相印证' : '两解不一致，需人工复核'}</p>
          <p>最终答案：{sol.verify.finalAnswer}</p>
          <MarkdownView text={`**更快捷解法**\n\n${sol.verify.faster}\n\n${sol.verify.analysis}`} paper />
          <button className="btn primary" disabled={!sol.verify.accept} onClick={() => save({
            type: 'gaokao',
            stem,
            answer: sol.verify.finalAnswer,
            analysis: sol.verify.analysis
          }, { methodA: sol.methodA.steps, methodB: sol.methodB.steps, faster: sol.verify.faster, verdict: sol.verify.analysis })}>
            将题目与双解法入库
          </button>
        </section>
      ) : null}

      <section className="card" style={{ marginTop: 12 }}>
        <h3>判题</h3>
        <div className="field">
          <label>学生作答</label>
          <textarea value={student} onChange={(e) => setStudent(e.target.value)} />
        </div>
        <button className="btn" disabled={busy === 'judge'} onClick={doJudge}>{busy === 'judge' ? '阅卷中…' : '按等级考分空判题'}</button>
        {judge ? (
          <div className="card paper" style={{ marginTop: 10 }}>
            <p>{judge.verdict} · {judge.score}/{judge.max}</p>
            <MarkdownView text={`${judge.comment}\n\n**参考答案** ${judge.rightAnswer}\n\n${judge.analysis}`} paper />
          </div>
        ) : null}
      </section>
      </> : null}
    </div>
  )
}

function fmtQ(q: Q): string {
  const opts = (q.options || []).join('\n\n')
  const blanks = (q.blanks || []).map((b) => `${b.id}（${b.kind}） ${b.answer}`).join('\n')
  return [`**题目**`, q.stem, opts, blanks ? `**分空**\n${blanks}` : '', `**答案**\n${q.answer}`, `**解析**`, q.analysis, q.examPoints?.length ? `**考点** ${q.examPoints.join('、')}` : ''].filter(Boolean).join('\n\n')
}
