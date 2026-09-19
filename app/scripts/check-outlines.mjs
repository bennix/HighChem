import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '../..')
const files = [
  '化学必修第一册-教材大纲.md',
  '化学必修第二册-教材大纲.md',
  '化学选择性必修1-化学反应原理-教材大纲.md',
  '化学选择性必修2-物质结构与性质-教材大纲.md',
  '化学选择性必修3-有机化学基础-教材大纲.md'
]
for (const f of files) {
  const md = fs.readFileSync(path.join(root, f), 'utf8')
  const chapters = md.match(/^## .+/gm) || []
  console.log(f)
  console.log(' ', chapters.map((s) => s.replace(/^##\s+/, '')).join(' · '))
}
