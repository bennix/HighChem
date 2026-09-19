import { useEffect, useState } from 'react'
import { MarkdownView } from '../components/MarkdownView'
import {
  type ExamQ as Q,
  collectStudent,
  extraLabel,
  fmtAsk,
  fmtDraft,
  fmtKey,
  hasAttempt,
  kindLabel,
  optionLetter,
  showExtraBox,
  typeLabel
} from '../lib/examDisplay'

type ExamType = 'choice' | 'short' | 'comprehensive' | 'gaokao'
type Node = { id: string; label: string; bookId?: string }
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
  const [picks, setPicks] = useState<string[]>([])
  const [blankAns, setBlankAns] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [prog, setProg] = useState('')
  const [liveA, setLiveA] = useState('')
  const [liveB, setLiveB] = useState('')
  const [liveV, setLiveV] = useState('')
  const [liveJ, setLiveJ] = useState('')
  const [liveSA, setLiveSA] = useState('')
  const [liveSB, setLiveSB] = useState('')
  const [liveSV, setLiveSV] = useState('')
  const [genErr, setGenErr] = useState('')
  const [bankNote, setBankNote] = useState('')
  const [solveNote, setSolveNote] = useState('')
  const [openGuide, setOpenGuide] = useState(true)
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
    return window.highchem.exam.onProgress((p) => {
      setProg(`${p.label}（${p.step}/${p.total}）`)
      if (p.reset && p.lane === 'a') setLiveA('')
      if (p.reset && p.lane === 'b') setLiveB('')
      if (p.reset && p.lane === 'arbiter') setLiveV('')
      if (p.reset && p.lane === 'judge') setLiveJ('')
      if (p.reset && p.lane === 'sa') setLiveSA('')
      if (p.reset && p.lane === 'sb') setLiveSB('')
      if (p.reset && p.lane === 'sv') setLiveSV('')
      if (p.delta && p.lane === 'a') setLiveA((s) => s + p.delta)
      if (p.delta && p.lane === 'b') setLiveB((s) => s + p.delta)
      if (p.delta && p.lane === 'arbiter') setLiveV((s) => s + p.delta)
      if (p.delta && p.lane === 'judge') setLiveJ((s) => s + p.delta)
      if (p.delta && p.lane === 'sa') setLiveSA((s) => s + p.delta)
      if (p.delta && p.lane === 'sb') setLiveSB((s) => s + p.delta)
      if (p.delta && p.lane === 'sv') setLiveSV((s) => s + p.delta)
    })
  }, [])
  useEffect(() => {
    if (presetNodes.length) setNodes(presetNodes)
    if (presetType) setType(presetType)
  }, [presetNodes, presetType])

  async function generate() {
    setBusy('gen')
    setGen(null)
    setJudge(null)
    setSol(null)
    setStudent('')
    setPicks([])
    setBlankAns({})
    setLiveA('')
    setLiveB('')
    setLiveV('')
    setLiveJ('')
    setBankNote('')
    setProg('准备出题…')
    setGenErr('')
    try {
      setGen(await window.highchem.exam.generate({ type, nodes }))
    } catch (err) {
      setGenErr(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  async function solve(text: string) {
    setBusy('solve')
    setSol(null)
    setLiveSA('')
    setLiveSB('')
    setLiveSV('')
    setSolveNote('')
    setProg('准备双解…')
    try {
      const r = await window.highchem.exam.solve(text)
      setSol(r)
    } finally {
      setBusy('')
    }
  }

  function saveSolved() {
    if (!sol) return
    const q = gen?.verdict.question
    save({
      type: q?.type || type,
      stem: q?.stem || stem,
      options: q?.options,
      blanks: q?.blanks,
      answer: sol.verify.finalAnswer || q?.answer || '',
      analysis: q?.analysis || sol.verify.analysis,
      examPoints: q?.examPoints
    }, {
      methodA: sol.methodA.steps,
      methodB: sol.methodB.steps,
      answerA: sol.methodA.answer,
      answerB: sol.methodB.answer,
      faster: sol.verify.faster,
      verdict: sol.verify.analysis,
      genVerdict: gen?.verdict.reason || '',
      finalAnswer: sol.verify.finalAnswer
    })
    setSolveNote('已入库：题目 + 双解 + 仲裁')
  }

  async function doJudge() {
    const q = gen?.verdict.question
    if (!q) return
    setBusy('judge')
    setJudge(null)
    setLiveJ('')
    setProg('对照仲裁答案阅卷…')
    try {
      setJudge(await window.highchem.exam.judge(
        fmtAsk(q),
        collectStudent(q, picks, blankAns, student),
        {
          answer: q.answer,
          analysis: q.analysis,
          options: q.options,
          blanks: q.blanks,
          reason: gen.verdict.reason
        }
      ))
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
      blanks: q.blanks,
      answer: q.answer,
      analysis: q.analysis,
      nodes: nodes.map((n) => n.label),
      createdAt: Date.now(),
      ...extra
    })
    setBankNote('已写入题库')
  }

  function useChapter(ch: Guide['chapters'][number]) {
    setNodes([{ id: ch.id, label: ch.chapter, bookId: ch.bookId }])
    setType('gaokao')
  }

  function useSample(s: Guide['samples'][number]) {
    setStem(s.stem)
    setOpenGuide(false)
  }

  function togglePick(letter: string) {
    setPicks((cur) => cur.includes(letter) ? cur.filter((x) => x !== letter) : [...cur, letter].sort())
  }

  const finalQ = gen?.verdict.question
  const books = Array.from(new Set((guide?.chapters || []).map((c) => c.book || '教材')))

  return (
    <div className="page">
      {guide ? (
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
            {busy === 'gen' ? (prog || '双模型命题中…') : '双模型出题并仲裁'}
          </button>
        </div>
        {busy === 'gen' ? <p className="small muted">{prog || '正在出题…'}</p> : null}
        {genErr ? <p className="ask-error">{genErr}</p> : null}
        <p className="small muted">两模型独立命题，仲裁流式给出最终题。先作答，再由 AI 对照仲裁判分；是否入库由你决定。</p>
      </div>

      {gen || liveA || liveB ? (
        <div className="grid two" style={{ marginTop: 12 }}>
          <section className="card">
            <h3>模型 A{gen ? ` · ${gen.modelA.model}` : ''}</h3>
            {gen ? <MarkdownView text={fmtDraft(gen.modelA.question)} /> : <pre className="ocr">{liveA}{busy === 'gen' ? ' ▍' : ''}</pre>}
          </section>
          <section className="card">
            <h3>模型 B{gen ? ` · ${gen.modelB.model}` : ''}</h3>
            {gen ? <MarkdownView text={fmtDraft(gen.modelB.question)} /> : <pre className="ocr">{liveB}{busy === 'gen' ? ' ▍' : ''}</pre>}
          </section>
        </div>
      ) : null}

      {gen || liveV ? (
        <section className="card paper" style={{ marginTop: 12 }}>
          <h3>仲裁{gen ? ` · ${gen.verdict.model}` : ''}{busy === 'gen' && liveV ? ' · 流式输出中' : ''}</h3>
          {gen ? (
            <>
              <p>{gen.verdict.accept ? '可以形成题目' : '仲裁认为不宜直接入库'} · 采用 {gen.verdict.winner}</p>
              <MarkdownView text={gen.verdict.reason} paper />
            </>
          ) : (
            <pre className="ocr">{liveV} ▍</pre>
          )}
        </section>
      ) : null}

      {finalQ ? (
        <section className="card paper" style={{ marginTop: 12 }}>
          <div className="row">
            <h3 style={{ margin: 0 }}>请作答 · {typeLabel(finalQ.type)}</h3>
            <span className="chip on">{typeLabel(finalQ.type)}</span>
          </div>
          <MarkdownView text={fmtAsk(finalQ)} paper />
          {finalQ.options?.length ? (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {finalQ.options.map((opt, i) => {
                const letter = optionLetter(opt, i)
                return (
                  <button
                    key={`${letter}-${i}`}
                    type="button"
                    className={`chip ${picks.includes(letter) ? 'on' : ''}`}
                    style={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 8, padding: '8px 12px', whiteSpace: 'normal' }}
                    onClick={() => togglePick(letter)}
                  >
                    <MarkdownView text={opt} />
                  </button>
                )
              })}
            </div>
          ) : null}
          {finalQ.blanks?.length ? (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {finalQ.blanks.map((b) => (
                <div className="field" key={b.id}>
                  <label>{b.id} · {kindLabel(b.kind)}</label>
                  <input
                    className="plain-input"
                    value={blankAns[b.id] || ''}
                    onChange={(e) => setBlankAns((cur) => ({ ...cur, [b.id]: e.target.value }))}
                    placeholder={b.kind === 'choice' ? '填选项字母' : '写下该空答案'}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {showExtraBox(finalQ) ? (
            <div className="field" style={{ marginTop: 12 }}>
              <label>{extraLabel(finalQ)}</label>
              <textarea value={student} onChange={(e) => setStudent(e.target.value)} placeholder="写出推理、方程式或补充说明" />
            </div>
          ) : null}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={busy === 'judge' || !hasAttempt(finalQ, picks, blankAns, student)} onClick={doJudge}>
              {busy === 'judge' ? (prog || '阅卷中…') : '提交作答并判题'}
            </button>
            <button className="btn" onClick={() => { setStem(finalQ.stem); solve(finalQ.stem) }}>双解法求解这道题</button>
          </div>
          {busy === 'judge' ? (
            <pre className="ocr" style={{ marginTop: 10 }}>{liveJ} ▍</pre>
          ) : null}
          {judge ? (
            <div className="card paper" style={{ marginTop: 12 }}>
              <p>{judge.verdict} · {judge.score}/{judge.max}</p>
              <MarkdownView text={judge.comment} paper />
              <MarkdownView text={fmtKey(finalQ, judge)} paper />
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={() => save(finalQ, { verdict: gen?.verdict.reason || '', judge: judge.comment })}>
                  入库这道题
                </button>
                <button className="btn ghost" onClick={() => setBankNote('未入库，可继续改答或重新出题')}>不入库</button>
              </div>
              {bankNote ? <p className="small muted">{bankNote}</p> : null}
            </div>
          ) : (
            <p className="small muted" style={{ marginTop: 8 }}>参考答案在提交后才显示。是否入库由你决定，不会自动写入题库。</p>
          )}
        </section>
      ) : null}

      <section className="card paper" style={{ marginTop: 12 }}>
        <h3>已有题目：双解法 + 仲裁</h3>
        {stem ? <MarkdownView text={stem} paper /> : null}
        <div className="field" style={{ marginTop: stem ? 10 : 0 }}>
          <label>题目原文（可改）</label>
          <textarea value={stem} onChange={(e) => setStem(e.target.value)} placeholder="粘贴、带入样题，或从上方仲裁题点「双解法求解」" />
        </div>
        <div className="row">
          <button className="btn primary" disabled={busy === 'solve' || !stem} onClick={() => solve(stem)}>
            {busy === 'solve' ? (prog || '两模型求解中…') : '两种方法求解并仲裁'}
          </button>
        </div>
        {busy === 'solve' ? <p className="small muted">{prog}</p> : null}
      </section>

      {sol || liveSA || liveSB ? (
        <div className="grid two" style={{ marginTop: 12 }}>
          <section className="card">
            <h3>解法 A{sol ? ` · ${sol.methodA.model}` : ''}{busy === 'solve' && !sol ? ' · 流式输出中' : ''}</h3>
            {sol ? (
              <>
                <MarkdownView text={sol.methodA.steps} />
                {sol.methodA.answer ? <p>答案：{sol.methodA.answer}</p> : null}
              </>
            ) : (
              <pre className="ocr">{liveSA}{busy === 'solve' ? ' ▍' : ''}</pre>
            )}
          </section>
          <section className="card">
            <h3>解法 B{sol ? ` · ${sol.methodB.model}` : ''}{busy === 'solve' && !sol ? ' · 流式输出中' : ''}</h3>
            {sol ? (
              <>
                <MarkdownView text={sol.methodB.steps} />
                {sol.methodB.answer ? <p>答案：{sol.methodB.answer}</p> : null}
              </>
            ) : (
              <pre className="ocr">{liveSB}{busy === 'solve' ? ' ▍' : ''}</pre>
            )}
          </section>
        </div>
      ) : null}

      {sol || liveSV ? (
        <section className="card paper" style={{ marginTop: 12 }}>
          <h3>双解仲裁{sol ? ` · ${sol.verify.model}` : ''}{busy === 'solve' && liveSV && !sol ? ' · 流式输出中' : ''}</h3>
          {sol ? (
            <>
              <p>{sol.verify.sameAnswer ? '两解互相印证' : '两解不一致，需人工复核'}{sol.verify.accept ? '' : ' · 仲裁未建议直接入库'}</p>
              <p>最终答案：{sol.verify.finalAnswer}</p>
              <MarkdownView text={`**更快捷解法**\n\n${sol.verify.faster || '无'}\n\n${sol.verify.analysis}`} paper />
              {gen?.verdict.reason ? <MarkdownView text={`**命题仲裁**\n\n${gen.verdict.reason}`} paper /> : null}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={saveSolved}>入库（题目 + 双解 + 仲裁）</button>
                <button className="btn ghost" onClick={() => setSolveNote('未入库，可改题再解或重新出题')}>不入库</button>
              </div>
              {solveNote ? <p className="small muted">{solveNote}</p> : null}
              <p className="small muted">入库会保存题目、解法 A、解法 B，以及命题仲裁与双解仲裁。不会自动写入。</p>
            </>
          ) : (
            <pre className="ocr">{liveSV} ▍</pre>
          )}
        </section>
      ) : null}
    </div>
  )
}
