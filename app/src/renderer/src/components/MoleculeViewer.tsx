import { useEffect, useRef, useState } from 'react'
import { atomLabel, ELEMENT_CN } from '../lib/elements'
import { LOCAL_XYZ, parseXyz } from '../lib/mol-xyz'

type Atom = { elem: string; x: number; y: number; z: number }
type Model = { selectedAtoms: (sel: object) => Atom[] }
type Viewer = {
  addModel: (data: string, fmt: string) => void
  setStyle: (sel: object, style: object) => void
  zoomTo: () => void
  render: () => void
  clear: () => void
  resize: () => void
  getView: () => number[]
  setView: (view: number[]) => void
  getModel: () => Model
  addLabel: (text: string, opts: object) => void
  removeAllLabels?: () => void
  setBackgroundColor?: (color: string) => void
}

function molBg(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--mol').trim() || '#111814'
}

function labelColors() {
  const light = document.documentElement.dataset.theme === 'light'
  return {
    fontColor: light ? '#243027' : '#f4efe4',
    backgroundColor: light ? '#fffdf7' : '#1a211c'
  }
}

async function fetchAiXyz(id: string, name: string, formula: string): Promise<string> {
  if (typeof window.highchem?.mol?.xyz === 'function') {
    const res = await window.highchem.mol.xyz({ id, name, formula, force: true })
    if (res?.xyz) return res.xyz
  }
  const res = await window.highchem.chat.ask({
    threadId: `molxyz-${id}`,
    title: `${name} · 结构`,
    text: `只输出 XYZ 文件，不要解释、不要 Markdown。分子：${name}（${formula}）。格式：第1行原子数，第2行注释，随后每行「元素符号 x y z」，单位埃，符合高中 VSEPR。`,
    history: [],
    ephemeral: true
  })
  if (res?.error) throw new Error(res.error)
  if (!res?.full) throw new Error('AI 未返回结构，请到设置页确认 API Key')
  return parseXyz(res.full)
}

export function MoleculeViewer({
  id,
  name,
  formula,
  xyz: localXyz,
  onAtoms
}: {
  id: string
  name: string
  formula: string
  xyz?: string
  onAtoms?: (elems: string[]) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const viewer = useRef<Viewer | null>(null)
  const home = useRef<number[] | null>(null)
  const [err, setErr] = useState('')
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const [preferAi, setPreferAi] = useState(false)

  useEffect(() => {
    let dead = false
    let ro: ResizeObserver | null = null

    async function run() {
      if (!el.current) return
      setErr('')
      setBusy(true)
      el.current.innerHTML = ''
      viewer.current = null

      const builtin = localXyz || LOCAL_XYZ[id] || ''
      let xyz = builtin
      let src = builtin ? '本地内置' : ''
      if (preferAi || !xyz) {
        setSource('正在用 AI 生成三维结构…')
        xyz = await fetchAiXyz(id, name, formula)
        src = 'AI 生成'
      }

      const mod = (await import('3dmol/build/3Dmol.js')) as {
        createViewer: (node: HTMLElement, opts: object) => Viewer
      }
      if (dead || !el.current) return

      await new Promise((r) => requestAnimationFrame(() => r(null)))
      if (dead || !el.current) return

      const box = el.current.getBoundingClientRect()
      const viewerInst = mod.createViewer(el.current, {
        backgroundColor: molBg(),
        width: Math.max(320, Math.floor(box.width)),
        height: Math.max(320, Math.floor(box.height))
      })
      viewer.current = viewerInst
      viewer.current.clear()
      viewer.current.addModel(xyz, 'xyz')
      viewer.current.setStyle({}, { stick: { radius: 0.16 }, sphere: { scale: 0.26 } })
      labelAtoms(viewer.current)
      viewer.current.resize()
      viewer.current.zoomTo()
      viewer.current.render()
      home.current = viewer.current.getView().slice()
      setSource(src)

      ro = new ResizeObserver(() => {
        if (!viewer.current || !el.current) return
        viewer.current.resize()
        viewer.current.render()
      })
      ro.observe(el.current)
    }

    run()
      .catch((e: Error) => {
        if (!dead) setErr(e.message || '3D 结构生成失败')
      })
      .finally(() => {
        if (!dead) setBusy(false)
      })

    return () => {
      dead = true
      ro?.disconnect()
      if (el.current) el.current.innerHTML = ''
      viewer.current = null
      home.current = null
    }
  }, [id, name, formula, localXyz, tick, preferAi])

  useEffect(() => {
    const sync = () => {
      if (!viewer.current) return
      viewer.current.setBackgroundColor?.(molBg())
      viewer.current.removeAllLabels?.()
      labelAtoms(viewer.current)
      viewer.current.resize()
      viewer.current.zoomTo()
      viewer.current.render()
    }
    window.addEventListener('highchem-theme', sync)
    return () => window.removeEventListener('highchem-theme', sync)
  }, [])

  function labelAtoms(v: Viewer) {
    const atoms = v.getModel?.()?.selectedAtoms?.({}) || []
    const colors = labelColors()
    const seen: string[] = []
    for (const atom of atoms) {
      if (!seen.includes(atom.elem)) seen.push(atom.elem)
      v.addLabel(atomLabel(atom.elem), {
        position: { x: atom.x, y: atom.y, z: atom.z },
        fontSize: 13,
        fontColor: colors.fontColor,
        backgroundColor: colors.backgroundColor,
        backgroundOpacity: 0.72,
        showBackground: true,
        inFront: true,
        alignment: 'center'
      })
    }
    onAtoms?.(seen)
  }

  function resetView() {
    const v = viewer.current
    if (!v) return
    if (home.current) v.setView(home.current.slice())
    else {
      v.zoomTo()
      v.render()
    }
  }

  function regen() {
    setErr('')
    setPreferAi(true)
    setTick((n) => n + 1)
  }

  return (
    <div>
      <div className="mol-stage">
        <div className="mol-box" ref={el} aria-label={`${name} 三维结构`} />
        <button type="button" className="btn mol-reset" disabled={busy} onClick={resetView}>复位</button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="small muted">{busy ? '正在生成本地三维结构…' : source ? `结构来源：${source}` : ''}</span>
        <button className="btn ghost" disabled={busy} onClick={regen}>用 AI 生成本地结构</button>
      </div>
      {err ? <p className="warn">{err}</p> : null}
    </div>
  )
}

export function AtomLegend({ elems }: { elems: string[] }) {
  if (!elems.length) return null
  return (
    <div className="chips" style={{ marginTop: 8 }}>
      {elems.map((e) => (
        <span className="chip on" key={e}>{ELEMENT_CN[e] || e}　{e}</span>
      ))}
    </div>
  )
}
