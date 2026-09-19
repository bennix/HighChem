import fs from 'fs'
import { BOOKS, bookPath } from './paths'

export function normalizeOcr(text: string): string {
  return text
    .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '$1')
    .replace(/([A-Za-z0-9])\s+(?=[A-Za-z0-9])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface PageText {
  bookId: string
  page: number
  text: string
}

export function loadBookPages(bookId: string): PageText[] {
  const book = BOOKS.find((b) => b.id === bookId)
  if (!book) return []
  const raw = fs.readFileSync(bookPath(book.ocr), 'utf8')
  const parts = raw.split(/---\s*PDF\s*第\s*(\d+)\s*页\s*---/)
  const pages: PageText[] = []
  for (let i = 1; i < parts.length; i += 2) {
    const page = Number(parts[i])
    const text = normalizeOcr(parts[i + 1] || '')
    if (text) pages.push({ bookId, page, text })
  }
  return pages
}

export function searchBook(bookId: string, query: string, limit = 20): PageText[] {
  const q = normalizeOcr(query).toLowerCase()
  if (!q) return []
  return loadBookPages(bookId)
    .map((p) => {
      const hay = p.text.toLowerCase()
      const idx = hay.indexOf(q)
      const score = idx >= 0 ? 1000 - idx : termScore(hay, q)
      return { ...p, score }
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function termScore(hay: string, q: string): number {
  const terms = q.split(/\s+/).filter((t) => t.length > 1)
  if (!terms.length) return 0
  let n = 0
  for (const t of terms) if (hay.includes(t)) n += 1
  return n === 0 ? 0 : n * 10
}

export function outlineMarkdown(): string {
  const book = BOOKS.find((b) => b.id === 'b1')
  if (!book?.outline) return ''
  const p = bookPath(book.outline)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
}
