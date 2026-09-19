import { chatComplete } from './zenmux'
import { loadSettings, loadMolXyz, saveMolXyz } from './persist'

export function parseXyz(raw: string): string {
  const text = raw.replace(/```(?:xyz)?/gi, '').trim()
  const lines = text.split(/\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l !== 'xyz')
  const start = lines.findIndex((l) => /^\d+$/.test(l))
  if (start < 0) throw new Error('模型未返回有效 XYZ')
  const n = Number(lines[start])
  if (!n || n < 1 || n > 80) throw new Error('原子数目不合理')
  const atoms = lines.slice(start + 2, start + 2 + n)
  if (atoms.length < n) throw new Error('XYZ 原子行不足')
  if (!atoms.every((l) => /^[A-Z][a-z]?\s+-?\d/.test(l))) throw new Error('XYZ 坐标格式无效')
  return `${n}\nAI\n${atoms.join('\n')}\n`
}

export async function makeMolXyz(id: string, name: string, formula: string, force = false) {
  const cache = loadMolXyz()
  if (!force && cache[id]) return { xyz: cache[id], source: 'ai' as const }
  const settings = loadSettings()
  const raw = await chatComplete({
    model: settings.roles.chat,
    messages: [
      {
        role: 'system',
        content:
          '你是结构化学助手。只输出 XYZ 文件：第1行原子数，第2行注释，其后每行「元素 x y z」，单位 Å。几何符合高中 VSEPR / 常见结构。不要 Markdown，不要解释。'
      },
      {
        role: 'user',
        content: `给出${name}（${formula}）的三维结构 XYZ。`
      }
    ]
  })
  const xyz = parseXyz(raw)
  cache[id] = xyz
  saveMolXyz(cache)
  return { xyz, source: 'ai' as const }
}
