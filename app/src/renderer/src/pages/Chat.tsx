import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { AttachBar } from '../components/AttachBar'
import { MarkdownView } from '../components/MarkdownView'
import { errMsg, filesFromClipboard, readAsAtt, type Att } from '../lib/attachments'
import { rememberAsk } from '../lib/last-ask'

type Msg = { id: string; role: 'user' | 'assistant'; content: string; attachments?: Att[] }
type Thread = { id: string; title: string; messages: Msg[]; updatedAt: number }

export function Chat({ initialThread }: { initialThread?: string }) {
  const [threads, setThreads] = useState<Thread[]>([])
  const [cur, setCur] = useState<string>('')
  const [text, setText] = useState('')
  const [atts, setAtts] = useState<Att[]>([])
  const [stream, setStream] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const live = useRef('')

  async function reload() {
    const list = await window.highchem.chat.list()
    setThreads(list)
    if (initialThread) setCur(initialThread)
    else if (!cur && list[0]) setCur(list[0].id)
  }

  useEffect(() => { reload() }, [])
  useEffect(() => {
    return window.highchem.chat.onDelta((p) => {
      if (live.current && p.threadId === live.current) setStream((s) => s + p.delta)
    })
  }, [])

  const thread = threads.find((t) => t.id === cur)

  async function addFiles(files: File[]) {
    if (!files.length) return
    const next = await Promise.all(files.map(readAsAtt))
    setAtts((curAtts) => [...curAtts, ...next])
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
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

  async function send() {
    if (!text.trim() && !atts.length) return
    const tid = cur || `chat-${Date.now().toString(36)}`
    live.current = tid
    setCur(tid)
    setBusy(true)
    setStream('')
    setError('')
    const history = (thread?.messages || []).map((m) => ({ role: m.role, content: m.content }))
    try {
      const res = await window.highchem.chat.ask({
        threadId: tid,
        text: text.trim() || '请结合附件作答。',
        attachments: atts,
        history
      })
      if (res.error) {
        setError(res.error)
        if (res.full) setStream(res.full)
        return
      }
      if (!res.full) {
        setError('模型没有返回内容。请到设置页确认 API Key 和对话模型。')
        return
      }
      setCur(res.threadId)
      rememberAsk(text.trim() || '请结合附件作答。', res.full)
      setText('')
      setAtts([])
      setStream('')
      await reload()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      live.current = ''
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="grid" style={{ gridTemplateColumns: '260px 1fr', minHeight: 'calc(100vh - 120px)' }}>
        <aside className="card">
          <button className="btn primary" onClick={() => { setCur(''); setStream('') }}>新对话</button>
          <div className="list" style={{ marginTop: 10 }}>
            {threads.map((t) => (
              <button key={t.id} className={`item ${t.id === cur ? 'on' : ''}`} onClick={() => setCur(t.id)} style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }}>
                {t.title}
              </button>
            ))}
          </div>
        </aside>
        <section className="card" style={{ display: 'flex', flexDirection: 'column' }} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {(thread?.messages || []).map((m) => (
              <div className={`msg ${m.role}`} key={m.id}>
                <div className="bubble">
                  {m.attachments?.length ? (
                    <div className="thumbs">
                      {m.attachments.map((a) =>
                        a.dataUrl ? <img key={a.id || a.dataUrl} src={a.dataUrl} alt={a.name} /> : <span key={a.id || a.name} className="chip">{a.name}</span>
                      )}
                    </div>
                  ) : null}
                  {m.role === 'assistant' ? <MarkdownView text={m.content} /> : <p>{m.content}</p>}
                </div>
              </div>
            ))}
            {error ? <p className="ask-error">{error}</p> : null}
            {stream ? (
              <div className="msg assistant">
                <div className="bubble"><MarkdownView text={stream + (busy ? ' ▍' : '')} /></div>
              </div>
            ) : busy ? (
              <div className="msg assistant"><div className="bubble muted">正在检索教材并流式作答…</div></div>
            ) : null}
          </div>
          <div className="field">
            <label>提问（可粘贴截图，或以缩略图附上图片/文件）</label>
            <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} onPaste={onPaste} placeholder="例如：根据教材说明氯气与碱反应的产物，并写出离子方程式。" />
            <div className="row">
              <AttachBar atts={atts} disabled={busy} onPick={addFiles} onRemove={(id) => setAtts((cur) => cur.filter((a) => a.id !== id))} />
              <button className="btn primary" disabled={busy || (!text.trim() && !atts.length)} onClick={send}>{busy ? '正在作答…' : '发送并检索教材'}</button>
              <span className="muted small">可基于本对话继续追问。</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
