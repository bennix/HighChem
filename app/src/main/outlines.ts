import fs from 'fs'
import { BOOKS, bookPath } from './paths'

export interface NavNode {
  id: string
  bookId: string
  title: string
  bookPage?: number
  page?: number
  kind?: 'chapter' | 'section' | 'topic' | 'review' | 'project' | 'appendix'
  children?: NavNode[]
}

function slug(s: string): string {
  return s.replace(/\s+/g, '').replace(/[：:].*$/, '').slice(0, 24)
}

function parseBook1(md: string, bookId: string): NavNode[] {
  const chapters: NavNode[] = []
  let current: NavNode | null = null
  let section: NavNode | null = null
  let chap = 0
  let sec = 0

  const lines = md.split(/\n/)
  for (const raw of lines) {
    const line = raw.trim()
    const chapHit = line.match(/^##\s+(第.+章\s+.+)$/)
    if (chapHit) {
      chap += 1
      sec = 0
      current = {
        id: `${bookId}-c${chap}`,
        bookId,
        title: chapHit[1].trim(),
        kind: 'chapter',
        children: []
      }
      chapters.push(current)
      section = null
      continue
    }
    if (line.startsWith('## 附录')) {
      current = {
        id: `${bookId}-app`,
        bookId,
        title: '附录',
        kind: 'appendix',
        page: 148,
        bookPage: 143,
        children: []
      }
      chapters.push(current)
      section = null
      continue
    }
    const start = line.match(/阅读器\s*P(\d+)/)
    if (current && !current.page && /起始位置/.test(line) && start) {
      current.page = Number(start[1])
    }
    const secHit = line.match(/^###\s+(.+)$/)
    if (secHit && current) {
      sec += 1
      section = {
        id: `${bookId}-c${chap}s${sec}`,
        bookId,
        title: secHit[1].trim(),
        kind: 'section',
        children: []
      }
      current.children!.push(section)
      continue
    }
    const pageLine = line.match(/书内第\s*(\d+)\s*页；阅读器\s*P(\d+)/)
    if (pageLine && section && !section.page) {
      section.bookPage = Number(pageLine[1])
      section.page = Number(pageLine[2])
    }
    const topic = line.match(/^[-*]\s+(.+?)(?:（阅读器\s*P(\d+)）)?$/)
    if (topic && section) {
      section.children!.push({
        id: `${section.id}-t${section.children!.length + 1}`,
        bookId,
        title: topic[1].replace(/（阅读器.+$/, '').trim(),
        kind: 'topic',
        page: topic[2] ? Number(topic[2]) : section.page
      })
    }
    const review = line.match(/本章复习：书内第\s*(\d+)\s*页；阅读器\s*P(\d+)/)
    if (review && current) {
      current.children!.push({
        id: `${current.id}-rev`,
        bookId,
        title: '本章复习',
        kind: 'review',
        bookPage: Number(review[1]),
        page: Number(review[2])
      })
    }
    const project = line.match(/项目学习活动[—\-]+(.+?)：书内第\s*(\d+)\s*页；阅读器\s*P(\d+)/)
    if (project && current) {
      current.children!.push({
        id: `${current.id}-proj`,
        bookId,
        title: `项目学习活动：${project[1].trim()}`,
        kind: 'project',
        bookPage: Number(project[2]),
        page: Number(project[3])
      })
    }
    const appItem = line.match(/^\d+\.\s+(.+?)：第\s*(\d+)\s*页/)
    if (appItem && current?.kind === 'appendix') {
      current.children!.push({
        id: `${current.id}-${slug(appItem[1])}`,
        bookId,
        title: appItem[1].trim(),
        kind: 'appendix',
        bookPage: Number(appItem[2]),
        page: Number(appItem[2]) + 5
      })
    }
  }
  return chapters
}

function parseTableBook(md: string, bookId: string): NavNode[] {
  const chapters: NavNode[] = []
  let current: NavNode | null = null
  let chap = 0

  for (const raw of md.split(/\n/)) {
    const line = raw.trim()
    const chapHit = line.match(/^##\s+(.+)$/)
    if (chapHit) {
      const title = chapHit[1].trim()
      if (!/^第/.test(title) && title !== '附录') continue
      chap += 1
      current = {
        id: title.startsWith('附录') ? `${bookId}-app` : `${bookId}-c${chap}`,
        bookId,
        title,
        kind: title.startsWith('附录') ? 'appendix' : 'chapter',
        children: []
      }
      chapters.push(current)
      continue
    }
    const start = line.match(/书内第\s*(\d+)\s*页；PDF\s*第\s*(\d+)\s*页/)
    if (current && start && !current.page) {
      current.bookPage = Number(start[1])
      current.page = Number(start[2])
    }
    const row = line.match(/^\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/)
    if (row && current && !/小节/.test(row[1]) && !/^-+/.test(row[1])) {
      const title = row[1].trim()
      const kind = /复习/.test(title)
        ? 'review'
        : /项目/.test(title)
          ? 'project'
          : current.kind === 'appendix'
            ? 'appendix'
            : 'section'
      current.children!.push({
        id: `${current.id}-${slug(title)}-${row[3]}`,
        bookId,
        title,
        kind,
        bookPage: Number(row[2]),
        page: Number(row[3])
      })
    }
  }
  return chapters
}

export function loadBookOutline(bookId: string): NavNode[] {
  const book = BOOKS.find((b) => b.id === bookId)
  if (!book?.outline) return []
  const file = bookPath(book.outline)
  if (!fs.existsSync(file)) return []
  const md = fs.readFileSync(file, 'utf8')
  return bookId === 'b1' ? parseBook1(md, bookId) : parseTableBook(md, bookId)
}

export function loadAllNav(): NavNode[] {
  return BOOKS.map((b) => ({
    id: b.id,
    bookId: b.id,
    title: b.title,
    kind: 'chapter',
    children: loadBookOutline(b.id)
  }))
}

export function loadOutlineMarkdown(bookId?: string): { bookId: string; title: string; markdown: string }[] {
  return BOOKS.filter((b) => !bookId || b.id === bookId)
    .filter((b) => b.outline && fs.existsSync(bookPath(b.outline)))
    .map((b) => ({
      bookId: b.id,
      title: b.title,
      markdown: fs.readFileSync(bookPath(b.outline), 'utf8')
    }))
}
