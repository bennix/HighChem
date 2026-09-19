import { useEffect, useState } from 'react'
import { MarkdownView } from '../components/MarkdownView'

const DEMO = `
设置页渲染自检：物质的量 $n=\\dfrac{m}{M}$，氯气与碱：

$$\\ce{Cl2 + 2NaOH -> NaCl + NaClO + H2O}$$

若索引已建立，问答会引用教材页码而不是只看大纲。
`

type Roles = Record<'chat' | 'genA' | 'genB' | 'arbiter' | 'embed', string>

export function Settings({
  onIndexed,
  theme,
  onTheme
}: {
  onIndexed: () => void
  theme: 'dark' | 'light'
  onTheme: () => void
}) {
  const [cfg, setCfg] = useState<{
    hasKey: boolean
    maskedKey: string
    baseUrl: string
    models: string[]
    roles: Roles
    inviteUrl: string
    encryption: string
  } | null>(null)
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [modelName, setModelName] = useState('')
  const [prog, setProg] = useState<null | {
    phase: string
    phaseLabel: string
    done: number
    total: number
    percent: number
    bookTitle?: string
    bookIndex?: number
    bookCount?: number
    page?: number
    preview?: string
    elapsedMs: number
    etaMs: number
    model?: string
    books?: { id: string; title: string; pages: number; chunks: number; embedded: number; status: string }[]
    message: string
  }>(null)
  const [indexing, setIndexing] = useState(false)
  const [confirmRebuild, setConfirmRebuild] = useState(false)
  const [rag, setRag] = useState<{ ready: boolean; chunks: number; model?: string; books?: { id: string; title: string; chunks: number }[] } | null>(null)

  async function load() {
    setCfg(await window.highchem.settings.get())
    setRag(await window.highchem.rag.status())
  }
  useEffect(() => {
    load()
    return window.highchem.rag.onProgress((p) => setProg(p as NonNullable<typeof prog>))
  }, [])

  async function saveKey() {
    await window.highchem.settings.setKey(key)
    setKey('')
    load()
  }

  async function addModel() {
    if (!cfg || !modelName.trim()) return
    const models = [...new Set([...cfg.models, modelName.trim()])]
    await window.highchem.settings.save({ models })
    setModelName('')
    load()
  }

  async function removeModel(name: string) {
    if (!cfg) return
    await window.highchem.settings.save({ models: cfg.models.filter((m) => m !== name) })
    load()
  }

  async function setRole(role: keyof Roles, model: string) {
    if (!cfg) return
    await window.highchem.settings.save({ roles: { ...cfg.roles, [role]: model } })
    load()
  }

  async function requestIndex() {
    if (rag?.ready && !confirmRebuild) {
      setConfirmRebuild(true)
      return
    }
    setConfirmRebuild(false)
    await runIndex()
  }

  async function runIndex() {
    setIndexing(true)
    setProg({
      phase: 'scan',
      phaseLabel: '准备',
      done: 0,
      total: 0,
      percent: 0,
      elapsedMs: 0,
      etaMs: 0,
      message: rag?.ready ? '开始重建教材索引…' : '开始建立教材索引…'
    })
    try {
      await window.highchem.rag.build()
      onIndexed()
      await load()
    } catch (err) {
      setProg((cur) => ({
        phase: 'error',
        phaseLabel: '失败',
        done: cur?.done || 0,
        total: cur?.total || 0,
        percent: cur?.percent || 0,
        elapsedMs: cur?.elapsedMs || 0,
        etaMs: 0,
        message: err instanceof Error ? err.message : String(err)
      }))
    } finally {
      setIndexing(false)
    }
  }

  if (!cfg) return null

  return (
    <div className="page">
      <section className="card" style={{ marginBottom: 12 }}>
        <h3>外观</h3>
        <p className="muted">当前是{theme === 'dark' ? '暗色台面' : '亮色纸面'}，选择会永久保存在本机。</p>
        <div className="row">
          <button className={`btn ${theme === 'dark' ? 'primary' : ''}`} onClick={() => theme !== 'dark' && onTheme()}>暗色</button>
          <button className={`btn ${theme === 'light' ? 'primary' : ''}`} onClick={() => theme !== 'light' && onTheme()}>亮色</button>
        </div>
      </section>
      <div className="grid two">
        <section className="card">
          <h3>ZenMux API</h3>
          <p className="muted">Base URL：{cfg.baseUrl}</p>
          <p>当前密钥：{cfg.hasKey ? (show ? '已保存（界面默认掩码） ' + cfg.maskedKey : cfg.maskedKey) : '未设置'}</p>
          <p className="small muted">本地用系统保险箱存储（{cfg.encryption}），界面只显示掩码。</p>
          <div className="field">
            <label>写入新的 API Key</label>
            <input type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} placeholder="粘贴后永久保存在本机" />
          </div>
          <div className="row">
            <button className="btn primary" onClick={saveKey}>保存密钥</button>
            <button className="btn" onClick={() => setShow((s) => !s)}>{show ? '隐藏' : '显示掩码细节'}</button>
            <button className="btn ghost" onClick={() => window.highchem.settings.setKey('').then(load)}>清除</button>
          </div>
          {!cfg.hasKey ? (
            <p className="warn">
              还没有 Key？使用邀请链接申请：
              <a href={cfg.inviteUrl} target="_blank" rel="noreferrer"> {cfg.inviteUrl}</a>
            </p>
          ) : null}
        </section>
        <section className="card paper">
          <h3>Markdown / LaTeX 渲染</h3>
          <MarkdownView text={DEMO} paper />
        </section>
      </div>

      <section className="card" style={{ marginTop: 12 }}>
        <h3>模型名单</h3>
        <div className="chips">
          {cfg.models.map((m) => (
            <span className="chip" key={m}>
              {m} <button className="btn ghost" onClick={() => removeModel(m)}>×</button>
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input className="plain-input" value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="增加模型名称，如 anthropic/claude-sonnet-5" style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 6, padding: '8px 10px' }} />
          <button className="btn" onClick={addModel}>增加</button>
        </div>
        <div className="grid two" style={{ marginTop: 12 }}>
          {([
            ['chat', '问答'],
            ['genA', '命题 / 解法 A'],
            ['genB', '命题 / 解法 B'],
            ['arbiter', '仲裁 / 验证'],
            ['embed', '文本嵌入']
          ] as [keyof Roles, string][]).map(([role, label]) => (
            <div className="field" key={role}>
              <label>{label}</label>
              <select value={cfg.roles[role]} onChange={(e) => setRole(role, e.target.value)}>
                {cfg.models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <h3>教材向量索引</h3>
        <p>{rag?.ready ? `已有 ${rag.chunks} 个片段${rag.model ? ` · ${rag.model}` : ''}` : '尚未建立。出题和问答会缺少教材原文。'}</p>
        {rag?.books?.length ? (
          <p className="small muted">{rag.books.map((b) => `${b.title} ${b.chunks} 段`).join(' · ')}</p>
        ) : null}
        {prog ? (
          <div style={{ margin: '12px 0' }}>
            <div className="row">
              <strong>{prog.phaseLabel}</strong>
              <span>{prog.percent}%</span>
              <span className="muted small">{clock(prog.elapsedMs)} 已用{prog.etaMs ? ` · 约剩 ${clock(prog.etaMs)}` : ''}</span>
            </div>
            <div className="bar" style={{ margin: '8px 0' }}><i style={{ width: `${prog.percent}%` }} /></div>
            <p>{prog.message}</p>
            {prog.bookTitle ? (
              <p className="small muted">
                第 {prog.bookIndex}/{prog.bookCount} 册 · {prog.bookTitle}
                {prog.page ? ` · PDF 第 ${prog.page} 页` : ''}
                {prog.total ? ` · 片段 ${prog.done}/${prog.total}` : ''}
              </p>
            ) : null}
            {prog.preview ? <p className="small muted">当前文本：{prog.preview}…</p> : null}
            {prog.model ? <p className="small muted">嵌入模型：{prog.model}</p> : null}
            {prog.books?.length ? (
              <div style={{ marginTop: 8 }}>
                {prog.books.map((b) => (
                  <div className="book-line" key={b.id}>
                    <span>{mark(b.status)} {b.title}</span>
                    <span className="muted">{b.pages ? `${b.pages} 页 · ` : ''}{b.embedded || 0}/{b.chunks || 0} 段</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {confirmRebuild ? (
          <div className="card paper" style={{ margin: '12px 0' }}>
            <p>已有 {rag?.chunks} 段索引。重建会覆盖现有向量，问答和出题在完成前都按新索引来。</p>
            <div className="row">
              <button className="btn danger" disabled={indexing} onClick={runIndex}>确认重建</button>
              <button className="btn" disabled={indexing} onClick={() => setConfirmRebuild(false)}>取消</button>
            </div>
          </div>
        ) : null}
        <button className="btn primary" disabled={indexing} onClick={requestIndex}>
          {indexing ? (rag?.ready ? '正在重建索引…' : '正在建立索引…') : rag?.ready ? '重建索引' : '建立索引'}
        </button>
      </section>
    </div>
  )
}

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return m ? `${m} 分 ${r} 秒` : `${r} 秒`
}

function mark(status: string): string {
  if (status === 'done') return '✓'
  if (status === 'active') return '►'
  return '○'
}
