import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export function textbooksRoot(): string {
  if (process.env.HIGHCHEM_ROOT) return process.env.HIGHCHEM_ROOT
  const marker = '化学必修第一册-教材大纲.md'
  const candidates = [
    path.join(process.resourcesPath, 'textbooks'),
    path.resolve(__dirname, '../../..'),
    path.resolve(process.cwd(), '..'),
    path.resolve(app.getAppPath(), '..'),
    '/Users/nellertcai/HighChem'
  ]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, marker))) return dir
  }
  return candidates[0]
}

export function userDataFile(name: string): string {
  return path.join(app.getPath('userData'), name)
}

export const BOOKS = [
  {
    id: 'b1',
    title: '化学必修 第一册',
    short: '必修一',
    pdf: '化学必修第一册-上海科学技术出版社-可搜索文字版.pdf',
    ocr: '化学必修第一册-OCR文字.txt',
    outline: '化学必修第一册-教材大纲.md',
    pages: 154
  },
  {
    id: 'b2',
    title: '化学必修 第二册',
    short: '必修二',
    pdf: '化学必修第二册-上海科学技术出版社-可搜索文字版.pdf',
    ocr: '化学必修第二册-OCR文字.txt',
    outline: '化学必修第二册-教材大纲.md',
    pages: 124
  },
  {
    id: 'b3',
    title: '选择性必修1 化学反应原理',
    short: '选必1',
    pdf: '化学选择性必修1-化学反应原理-上海科学技术出版社-可搜索文字版.pdf',
    ocr: '化学选择性必修1-化学反应原理-OCR文字.txt',
    outline: '化学选择性必修1-化学反应原理-教材大纲.md',
    pages: 130
  },
  {
    id: 'b4',
    title: '选择性必修2 物质结构与性质',
    short: '选必2',
    pdf: '化学选择性必修2-物质结构与性质-上海科学技术出版社-可搜索文字版.pdf',
    ocr: '化学选择性必修2-物质结构与性质-OCR文字.txt',
    outline: '化学选择性必修2-物质结构与性质-教材大纲.md',
    pages: 106
  },
  {
    id: 'b5',
    title: '选择性必修3 有机化学基础',
    short: '选必3',
    pdf: '化学选择性必修3-有机化学基础-上海科学技术出版社-可搜索文字版.pdf',
    ocr: '化学选择性必修3-有机化学基础-OCR文字.txt',
    outline: '化学选择性必修3-有机化学基础-教材大纲.md',
    pages: 134
  }
] as const

export function bookPath(rel: string): string {
  return path.join(textbooksRoot(), rel)
}
