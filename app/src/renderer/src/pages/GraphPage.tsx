import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'

type GNode = { id: string; label: string; kind: string; bookId?: string; page?: number }
type GLink = { source: string | { id: string }; target: string | { id: string }; rel: string }

const BOOK_FILTERS = [
  { id: 'all', label: '全高中' },
  { id: 'b1', label: '必修一' },
  { id: 'b2', label: '必修二' },
  { id: 'b3', label: '选必1' },
  { id: 'b4', label: '选必2' },
  { id: 'b5', label: '选必3' }
]

export function GraphPage({
  onGoto,
  onExam
}: {
  onGoto: (bookId: string, page: number) => void
  onExam: (nodes: GNode[], type: 'choice' | 'short' | 'comprehensive' | 'gaokao') => void
}) {
  const [nodes, setNodes] = useState<GNode[]>([])
  const [links, setLinks] = useState<GLink[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 640 })
  const [skin, setSkin] = useState(readSkin)
  const [bookFilter, setBookFilter] = useState('all')

  useEffect(() => {
    window.highchem.graph.seed().then((d: { seed: { nodes: GNode[]; links: GLink[] }; overlay: { nodes?: GNode[]; links?: GLink[] }; note: string }) => {
      setNote(d.note)
      const extraN = d.overlay?.nodes || []
      const extraL = d.overlay?.links || []
      setNodes([...d.seed.nodes, ...extraN])
      setLinks([...d.seed.links, ...extraL])
    })
  }, [])

  useEffect(() => {
    const sync = () => setSkin(readSkin())
    window.addEventListener('highchem-theme', sync)
    return () => window.removeEventListener('highchem-theme', sync)
  }, [])

  useEffect(() => {
    if (!box.current) return
    const ro = new ResizeObserver(() => {
      if (box.current) setSize({ w: box.current.clientWidth, h: box.current.clientHeight })
    })
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  const graph = useMemo(() => {
    const visible = bookFilter === 'all'
      ? nodes
      : nodes.filter((n) => n.id === 'hs' || n.id === bookFilter || n.bookId === bookFilter)
    const ids = new Set(visible.map((n) => n.id))
    return {
      nodes: visible,
      links: links.filter((l) => ids.has(idOf(l.source)) && ids.has(idOf(l.target)))
    }
  }, [nodes, links, bookFilter])

  const selected = nodes.filter((n) => picked.includes(n.id))

  async function extract() {
    setBusy(true)
    try {
      const extra = await window.highchem.graph.extract(bookFilter === 'all' ? undefined : bookFilter)
      const mergedN = [...nodes]
      for (const n of extra.nodes || []) {
        if (!mergedN.some((x) => x.id === n.id)) mergedN.push(n)
      }
      const mergedL = [...links, ...(extra.links || [])]
      setNodes(mergedN)
      setLinks(mergedL)
      await window.highchem.graph.saveOverlay({ nodes: extra.nodes, links: extra.links })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="muted">{note}</span>
        <button className="btn" disabled={busy} onClick={extract}>{busy ? '正在从教材提炼…' : bookFilter === 'all' ? '用 AI 从五册提炼考点' : '用 AI 从本册提炼考点'}</button>
        <button className="btn primary" disabled={!selected.length} onClick={() => onExam(selected, 'gaokao')}>出等级考综合题</button>
        <button className="btn" disabled={!selected.length} onClick={() => onExam(selected, 'choice')}>出不定项</button>
        <button className="btn" disabled={!selected.length} onClick={() => onExam(selected, 'short')}>出简答评价</button>
      </div>
      <div className="chips" style={{ marginBottom: 8 }}>
        {BOOK_FILTERS.map((b) => (
          <button key={b.id} className={`chip ${bookFilter === b.id ? 'on' : ''}`} onClick={() => setBookFilter(b.id)}>{b.label}</button>
        ))}
      </div>
      <div className="chips">
        {selected.map((n) => (
          <span className="chip on" key={n.id}>{n.label}</span>
        ))}
      </div>
      <div className="graph-box" ref={box} style={{ marginTop: 10 }}>
        <ForceGraph2D
          width={size.w}
          height={size.h}
          graphData={graph}
          backgroundColor={skin.graph}
          nodeLabel={(n: GNode) => n.label}
          nodeRelSize={6}
          linkColor={() => skin.link}
          nodeCanvasObject={(node: GNode & { x?: number; y?: number }, ctx, scale) => {
            const x = node.x || 0
            const y = node.y || 0
            const on = picked.includes(node.id)
            ctx.beginPath()
            ctx.arc(x, y, on ? 7 : 5, 0, Math.PI * 2)
            ctx.fillStyle = color(node, on)
            ctx.fill()
            const label = node.label
            ctx.font = `${12 / scale}px "IBM Plex Sans"`
            ctx.fillStyle = skin.text
            ctx.fillText(label, x + 8, y + 4)
          }}
          onNodeClick={(node: GNode) => {
            setPicked((cur) => (cur.includes(node.id) ? cur.filter((id) => id !== node.id) : [...cur, node.id]))
            if (node.bookId && node.page) onGoto(node.bookId, node.page)
          }}
        />
      </div>
    </div>
  )
}

function readSkin() {
  const css = getComputedStyle(document.documentElement)
  return {
    graph: css.getPropertyValue('--graph').trim() || '#121915',
    text: css.getPropertyValue('--text').trim() || '#ede6d4',
    link: document.documentElement.dataset.theme === 'light' ? 'rgba(80,90,80,0.35)' : 'rgba(159,176,164,0.35)'
  }
}

function idOf(v: string | { id: string }): string {
  return typeof v === 'string' ? v : v.id
}

function color(node: GNode, on: boolean): string {
  if (on) return '#c56a2d'
  if (node.kind === 'exam') return '#b45c24'
  if (node.id === 'hs') return '#e0a84b'
  if (node.kind === 'book') return '#d4a04a'
  const byBook: Record<string, string> = {
    b1: '#4f8f78',
    b2: '#c56a2d',
    b3: '#8a5f16',
    b4: '#3d6f8f',
    b5: '#7a4f7a'
  }
  return byBook[node.bookId || ''] || '#8aa396'
}
