import { BrowserWindow } from 'electron'
import { loadBookPages } from './ocr'
import { BOOKS } from './paths'
import { embedTexts } from './zenmux'
import { EmbedChunk, loadEmbeddings, loadSettings, saveEmbeddings } from './persist'

const CHUNK = 700
const OVERLAP = 80

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function chunkPage(page: { bookId: string; page: number; text: string }): Omit<EmbedChunk, 'embedding'>[] {
  const text = page.text
  if (text.length <= CHUNK) {
    return [{ id: `${page.bookId}-p${page.page}-0`, bookId: page.bookId, page: page.page, text }]
  }
  const out: Omit<EmbedChunk, 'embedding'>[] = []
  let i = 0
  let k = 0
  while (i < text.length) {
    const slice = text.slice(i, i + CHUNK)
    out.push({
      id: `${page.bookId}-p${page.page}-${k}`,
      bookId: page.bookId,
      page: page.page,
      text: slice
    })
    i += CHUNK - OVERLAP
    k += 1
  }
  return out
}

export function ragStatus() {
  const store = loadEmbeddings()
  return {
    ready: store.chunks.length > 0,
    model: store.model,
    chunks: store.chunks.length,
    books: BOOKS.map((b) => ({
      id: b.id,
      title: b.title,
      chunks: store.chunks.filter((c) => c.bookId === b.id).length
    }))
  }
}

export type RagProgress = {
  phase: 'scan' | 'embed' | 'save' | 'done' | 'error'
  phaseLabel: string
  done: number
  total: number
  percent: number
  bookId?: string
  bookTitle?: string
  bookIndex?: number
  bookCount?: number
  page?: number
  preview?: string
  elapsedMs: number
  etaMs: number
  model?: string
  books: { id: string; title: string; pages: number; chunks: number; embedded: number; status: 'pending' | 'active' | 'done' }[]
  message: string
}

function emit(win: BrowserWindow | null | undefined, payload: RagProgress) {
  win?.webContents.send('rag:progress', payload)
}

function eta(elapsedMs: number, done: number, total: number): number {
  if (!done || done >= total) return 0
  return Math.round((elapsedMs / done) * (total - done))
}

function previewOf(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 48)
}

export async function buildIndex(win?: BrowserWindow | null): Promise<{ chunks: number }> {
  const started = Date.now()
  const settings = loadSettings()
  const bookCount = BOOKS.length
  const bookStat: RagProgress['books'] = BOOKS.map((b) => ({
    id: b.id,
    title: b.title,
    pages: 0,
    chunks: 0,
    embedded: 0,
    status: 'pending'
  }))

  const send = (partial: Omit<RagProgress, 'elapsedMs' | 'etaMs' | 'books'> & { books?: RagProgress['books'] }) => {
    const elapsedMs = Date.now() - started
    emit(win, {
      ...partial,
      books: partial.books || bookStat,
      elapsedMs,
      etaMs: eta(elapsedMs, partial.done, partial.total || 1)
    })
  }

  send({
    phase: 'scan',
    phaseLabel: '读取教材 OCR',
    done: 0,
    total: bookCount,
    percent: 0,
    bookCount,
    model: settings.roles.embed,
    message: '正在打开五册 OCR 文本…'
  })

  const units: Omit<EmbedChunk, 'embedding'>[] = []
  for (let bi = 0; bi < BOOKS.length; bi++) {
    const book = BOOKS[bi]
    bookStat[bi] = { ...bookStat[bi], status: 'active' }
    send({
      phase: 'scan',
      phaseLabel: '读取并切段',
      done: bi,
      total: bookCount,
      percent: Math.round((bi / bookCount) * 20),
      bookId: book.id,
      bookTitle: book.title,
      bookIndex: bi + 1,
      bookCount,
      model: settings.roles.embed,
      message: `正在读取《${book.title}》并按页切成检索片段`
    })
    const pages = loadBookPages(book.id)
    let chunks = 0
    for (const page of pages) {
      if (page.text.length < 40) continue
      const parts = chunkPage(page)
      units.push(...parts)
      chunks += parts.length
      send({
        phase: 'scan',
        phaseLabel: '读取并切段',
        done: bi,
        total: bookCount,
        percent: Math.round((bi / bookCount) * 20),
        bookId: book.id,
        bookTitle: book.title,
        bookIndex: bi + 1,
        bookCount,
        page: page.page,
        preview: previewOf(page.text),
        model: settings.roles.embed,
        message: `《${book.title}》PDF 第 ${page.page} 页 · 本册已切 ${chunks} 段`
      })
    }
    bookStat[bi] = { ...bookStat[bi], pages: pages.length, chunks, status: 'done' }
  }

  const embeddings: EmbedChunk[] = []
  const batch = 24
  const total = units.length || 1
  send({
    phase: 'embed',
    phaseLabel: '调用嵌入模型',
    done: 0,
    total: units.length,
    percent: 20,
    bookCount,
    model: settings.roles.embed,
    message: `切段完成，共 ${units.length} 段，开始用 ${settings.roles.embed} 计算向量`
  })

  try {
    for (let i = 0; i < units.length; i += batch) {
      const slice = units.slice(i, i + batch)
      const vecs = await embedTexts(
        settings.roles.embed,
        slice.map((u) => u.text)
      )
      for (let j = 0; j < slice.length; j++) {
        embeddings.push({ ...slice[j], embedding: vecs[j] })
        const row = bookStat.find((b) => b.id === slice[j].bookId)
        if (row) row.embedded += 1
      }
      const done = Math.min(i + batch, units.length)
      const last = slice[slice.length - 1]
      const book = BOOKS.find((b) => b.id === last.bookId)
      const bi = BOOKS.findIndex((b) => b.id === last.bookId)
      for (const row of bookStat) {
        if (row.embedded >= row.chunks && row.chunks > 0) row.status = 'done'
        else if (row.embedded > 0) row.status = 'active'
      }
      send({
        phase: 'embed',
        phaseLabel: '调用嵌入模型',
        done,
        total: units.length,
        percent: 20 + Math.round((done / total) * 75),
        bookId: last.bookId,
        bookTitle: book?.title,
        bookIndex: bi + 1,
        bookCount,
        page: last.page,
        preview: previewOf(last.text),
        model: settings.roles.embed,
        message: `正在嵌入《${book?.title || last.bookId}》PDF 第 ${last.page} 页（${done}/${units.length} 段）`
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    send({
      phase: 'error',
      phaseLabel: '嵌入失败',
      done: embeddings.length,
      total: units.length,
      percent: 20 + Math.round((embeddings.length / total) * 75),
      bookCount,
      model: settings.roles.embed,
      message
    })
    throw err
  }

  send({
    phase: 'save',
    phaseLabel: '写入本地索引',
    done: units.length,
    total: units.length,
    percent: 97,
    bookCount,
    model: settings.roles.embed,
    message: `正在把 ${embeddings.length} 段向量写入本机`
  })
  saveEmbeddings({ model: settings.roles.embed, chunks: embeddings })
  send({
    phase: 'done',
    phaseLabel: '完成',
    done: embeddings.length,
    total: embeddings.length,
    percent: 100,
    bookCount,
    model: settings.roles.embed,
    message: `五册索引已就绪，共 ${embeddings.length} 段`
  })
  return { chunks: embeddings.length }
}

export async function retrieve(query: string, k = 8, bookId?: string) {
  const store = loadEmbeddings()
  if (!store.chunks.length) {
    return { hits: [] as Array<{ bookId: string; page: number; text: string; score: number }>, note: '尚未建立教材索引' }
  }
  const settings = loadSettings()
  const [qvec] = await embedTexts(settings.roles.embed, [query])
  const pool = bookId ? store.chunks.filter((c) => c.bookId === bookId) : store.chunks
  const ranked = pool
    .map((c) => ({
      bookId: c.bookId,
      page: c.page,
      text: c.text,
      score: cosine(qvec, c.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
  return { hits: ranked, note: '' }
}

export function formatContext(hits: Array<{ bookId: string; page: number; text: string }>): string {
  return hits
    .map((h, i) => {
      const book = BOOKS.find((b) => b.id === h.bookId)
      return `【${i + 1}】${book?.title || h.bookId} 第${h.page}页\n${h.text}`
    })
    .join('\n\n')
}
