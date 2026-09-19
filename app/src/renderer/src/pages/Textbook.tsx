import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { AttachBar } from '../components/AttachBar'
import { MarkdownView } from '../components/MarkdownView'
import { readLastAsk, rememberAsk } from '../lib/last-ask'
import { errMsg, filesFromClipboard, readAsAtt, type Att } from '../lib/attachments'

type Nav = {
  id: string
  bookId: string
  title: string
  page?: number
  bookPage?: number
  children?: Nav[]
}
type Book = { id: string; title: string; short: string; pdfUrl: string; pages: number }

const PROMPTS = ['这一页在讲什么？', '有哪些高考常考点？', '相关方程式怎么写？']

function pdfPageOf(node: Nav): number | undefined {
  if (node.page && node.page > 0) return node.page
  for (const child of node.children || []) {
    const page = pdfPageOf(child)
    if (page) return page
  }
  return undefined
}

function loadWidth(key: string, fallback: number, min: number, max: number) {
  const n = Number(localStorage.getItem(key))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

function useColWidth(key: string, initial: number, min: number, max: number) {
  const [w, setW] = useState(() => loadWidth(key, initial, min, max))
  const ref = useRef(w)
  ref.current = w
  function start(e: ReactMouseEvent, sign: 1 | -1, onDrag: (v: boolean) => void) {
    e.preventDefault()
    const x0 = e.clientX
    const w0 = ref.current
    onDrag(true)
    const move = (ev: MouseEvent) => {
      const next = Math.min(max, Math.max(min, w0 + sign * (ev.clientX - x0)))
      ref.current = next
      setW(next)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      onDrag(false)
      localStorage.setItem(key, String(ref.current))
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  return [w, start] as const
}

function titleAt(nodes: Nav[], page: number): string {
  let best = ''
  let bestPage = 0
  const visit = (node: Nav) => {
    if (node.page && node.page <= page && node.page >= bestPage) {
      best = node.title
      bestPage = node.page
    }
    for (const child of node.children || []) visit(child)
  }
  nodes.forEach(visit)
  return best
}

export function Textbook({
  books,
  nav,
  initialBook,
  initialPage
}: {
  books: Book[]
  nav: Nav[]
  initialBook?: string
  initialPage?: number
}) {
  const [bookId, setBookId] = useState(initialBook || 'b1')
  const [page, setPage] = useState(initialPage || 1)
  const [ocr, setOcr] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [askQ, setAskQ] = useState('')
  const [hits, setHits] = useState<{ page: number; text: string }[]>([])
  const [threadId, setThreadId] = useState('')
  const [reply, setReply] = useState('')
  const [stream, setStream] = useState('')
  const [error, setError] = useState('')
  const [atts, setAtts] = useState<Att[]>([])
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [showPdf, setShowPdf] = useState(() => localStorage.getItem('highchem-pdf-show') !== '0')
  const [showToc, setShowToc] = useState(() => localStorage.getItem('highchem-toc-show') !== '0')
  const [tocW, startToc] = useColWidth('highchem-toc-w', 248, 180, 480)
  const [askW, startAsk] = useColWidth('highchem-ask-w', 320, 240, 560)
  const live = useRef('')

  function togglePdf(next: boolean) {
    setShowPdf(next)
    localStorage.setItem('highchem-pdf-show', next ? '1' : '0')
  }

  function toggleToc(next: boolean) {
    setShowToc(next)
    localStorage.setItem('highchem-toc-show', next ? '1' : '0')
  }

  const book = books.find((b) => b.id === bookId)
  const tree = useMemo(() => nav.find((n) => n.id === bookId)?.children || [], [nav, bookId])
  const section = useMemo(() => titleAt(tree, page), [tree, page])
  const pdfSrc = book ? `${book.pdfUrl}?p=${page}#page=${page}&view=FitH` : ''
  const focus = [
    `正在阅读《${book?.title || ''}》PDF 第 ${page} 页`,
    section ? `章节：${section}` : '',
    ocr ? `本页原文：${ocr.slice(0, 1400)}` : '本页没有抽出可用文字。'
  ].filter(Boolean).join('。')

  useEffect(() => {
    if (initialBook) setBookId(initialBook)
    if (initialPage) setPage(initialPage)
  }, [initialBook, initialPage])

  useEffect(() => {
    const go = (e: Event) => {
      const { bookId: nextBook, page: nextPage } = (e as CustomEvent<{ bookId: string; page: number }>).detail || {}
      if (!nextBook || !nextPage) return
      setBookId(nextBook)
      setPage(nextPage)
      togglePdf(true)
      const kept = readLastAsk()
      if (kept?.reply) {
        setReply(kept.reply)
        setStream('')
        setError('')
      }
    }
    window.addEventListener('highchem-goto', go)
    return () => window.removeEventListener('highchem-goto', go)
  }, [])

  useEffect(() => {
    window.highchem.books.page(bookId, page).then((p: { text: string }) => setOcr(p.text || ''))
  }, [bookId, page])

  useEffect(() => {
    setAtts([])
    setThreadId('')
    live.current = ''
  }, [bookId])

  useEffect(() => {
    return window.highchem.chat.onDelta((p) => {
      if (live.current && p.threadId === live.current) setStream((s) => s + p.delta)
    })
  }, [])

  function goto(n?: number) {
    if (!n || n < 1) return
    setPage(n)
  }

  async function addFiles(files: File[]) {
    if (!files.length) return
    const next = await Promise.all(files.map(readAsAtt))
    setAtts((cur) => [...cur, ...next])
  }

  function onPaste(e: ClipboardEvent) {
    const files = filesFromClipboard(e)
    if (!files.length) return
    e.preventDefault()
    e.stopPropagation()
    addFiles(files)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    addFiles([...e.dataTransfer.files])
  }

  async function search() {
    const rows = await window.highchem.books.search(bookId, searchQ)
    setHits(rows)
    if (rows[0]) goto(rows[0].page)
  }

  async function ask(text: string) {
    const question = text.trim()
    if (!question && !atts.length) return
    const tid = threadId || `book-${bookId}-${Date.now().toString(36)}`
    live.current = tid
    setThreadId(tid)
    setBusy(true)
    setStream('')
    setReply('')
    setError('')
    const unsub = window.highchem.chat.onDelta((p) => {
      if (!p?.delta || !live.current) return
      if (!p.threadId || p.threadId === tid) setStream((s) => s + p.delta)
    })
    try {
      const res = await window.highchem.chat.ask({
        threadId: tid,
        title: `${book?.short || bookId} · 第 ${page} 页`,
        text: question || '请结合当前页和附件作答。',
        focus,
        bookId,
        attachments: atts,
        history: []
      })
      if (res.error) {
        setError(res.error)
        if (res.full) setReply(res.full)
        return
      }
      if (!res.full) {
        setError('模型没有返回内容。请到设置页确认 API Key 和对话模型。')
        return
      }
      setReply(res.full)
      rememberAsk(question || '请结合当前页和附件作答。', res.full)
      setStream('')
      setAskQ('')
      setAtts([])
    } catch (err) {
      setError(errMsg(err))
    } finally {
      unsub()
      live.current = ''
      setBusy(false)
    }
  }

  return (
    <div className="page fill">
      <div className={`textbook-split${showPdf ? '' : ' pdf-off'}${showToc ? '' : ' toc-off'}`}>
        {showToc ? (
        <aside className="card toc-col" style={{ width: tocW }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>目录</h3>
            <button type="button" className="btn ghost" onClick={() => toggleToc(false)}>隐藏目录</button>
          </div>
          <div className="field">
            <label>教材</label>
            <select value={bookId} onChange={(e) => { setBookId(e.target.value); setPage(1) }}>
              {books.map((b) => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="plain-input" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="在本册 OCR 中搜索" style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 6, padding: '7px 8px' }} />
            <button className="btn" onClick={search}>搜</button>
          </div>
          <div className="tree" style={{ marginTop: 12 }}>
            {tree.map((ch) => (
              <div key={ch.id}>
                <button className={page === pdfPageOf(ch) ? 'on' : ''} onClick={() => goto(pdfPageOf(ch))}>
                  {ch.title}
                  {pdfPageOf(ch) ? <span className="muted"> · PDF {pdfPageOf(ch)}</span> : null}
                </button>
                {(ch.children || []).map((s) => (
                  <div key={s.id} className="sec">
                    <button className={page === pdfPageOf(s) ? 'on' : ''} onClick={() => goto(pdfPageOf(s))}>
                      {s.title}
                      {pdfPageOf(s) ? <span className="muted"> · {pdfPageOf(s)}</span> : null}
                    </button>
                    {(s.children || []).map((t) => (
                      <div key={t.id} className="topic">
                        <button className={page === pdfPageOf(t) ? 'on' : ''} onClick={() => goto(pdfPageOf(t))}>{t.title}</button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {hits.length ? (
            <div style={{ marginTop: 12 }}>
              <p className="small muted">检索命中</p>
              {hits.slice(0, 8).map((h) => (
                <button key={h.page} className="btn ghost" onClick={() => goto(h.page)}>PDF {h.page}</button>
              ))}
            </div>
          ) : null}
          <button type="button" className="btn ghost" style={{ marginTop: 12, width: '100%' }} onClick={() => togglePdf(!showPdf)}>
            {showPdf ? '隐藏教材预览' : '显示教材预览'}
          </button>
        </aside>
        ) : null}
        {showToc ? (
          <button type="button" className="splitter" aria-label="拖动调整目录宽度" onMouseDown={(e) => startToc(e, 1, setDrag)} />
        ) : null}
        {showPdf ? (
          <section className="card pdf-col">
            <div className="row" style={{ padding: '2px 4px 8px' }}>
              <button className="btn" onClick={() => goto(page - 1)}>上一页</button>
              <span>PDF {page} / {book?.pages}</span>
              <button className="btn" onClick={() => goto(Math.min(book?.pages || page, page + 1))}>下一页</button>
              {!showToc ? (
                <button className="btn" onClick={() => toggleToc(true)}>显示目录</button>
              ) : null}
              <button className="btn ghost" onClick={() => togglePdf(false)}>隐藏预览</button>
            </div>
            {pdfSrc ? (
              <iframe
                key={`${bookId}-${page}`}
                className="pdf-frame"
                title="教材 PDF"
                src={pdfSrc}
              />
            ) : null}
          </section>
        ) : null}
        {showPdf ? (
          <button type="button" className="splitter" aria-label="拖动调整问答宽度" onMouseDown={(e) => startAsk(e, -1, setDrag)} />
        ) : null}
        <aside className="card ask-col" style={showPdf ? { width: askW } : undefined} onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onPaste={onPaste}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>本页问答</h3>
            <div className="row">
              {!showToc ? (
                <button type="button" className="btn" onClick={() => toggleToc(true)}>显示目录</button>
              ) : null}
              {!showPdf ? (
                <button type="button" className="btn" onClick={() => togglePdf(true)}>显示教材预览</button>
              ) : null}
            </div>
          </div>
          <p className="small muted">
            {section ? `${section} · ` : ''}PDF {page}。可粘贴截图或上传文件，回答会流式显示。
          </p>
          <details className="ocr-box">
            <summary>本页原文</summary>
            <div className="ocr">{ocr || '这一页没有抽出可用文字。'}</div>
          </details>
          <div className="chips" style={{ margin: '8px 0' }}>
            {PROMPTS.map((p) => (
              <button key={p} className="chip" onClick={() => ask(p)} disabled={busy}>{p}</button>
            ))}
          </div>
          <div className="ask-log">
            {error ? <p className="ask-error">{error}</p> : null}
            {stream || reply ? (
              <div className="card paper">
                <MarkdownView text={(stream || reply) + (busy ? ' ▍' : '')} paper />
              </div>
            ) : busy ? (
              <p className="muted">正在检索教材并流式作答…</p>
            ) : error ? null : (
              <p className="muted small">可就当前页概念、方程式或高考考法提问。</p>
            )}
          </div>
          <div className="field">
            <label>针对本页提问</label>
            <textarea
              value={askQ}
              onChange={(e) => setAskQ(e.target.value)}
              onPaste={onPaste}
              placeholder={section ? `例如：结合${section}说明这一页的要点。` : '例如：这一页的核心概念是什么？'}
            />
            <AttachBar atts={atts} disabled={busy} onPick={addFiles} onRemove={(id) => setAtts((cur) => cur.filter((a) => a.id !== id))} />
            <button className="btn primary" disabled={busy || (!askQ.trim() && !atts.length)} onClick={() => ask(askQ)}>
              {busy ? '正在作答…' : '提问'}
            </button>
          </div>
        </aside>
        {drag ? <div className="drag-mask" /> : null}
      </div>
    </div>
  )
}
