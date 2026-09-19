import { app, BrowserWindow, ipcMain, protocol, net, dialog, safeStorage } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import fs from 'fs'
import { BOOKS, bookPath } from './paths'
import {
  ChatThread,
  getApiKey,
  loadChats,
  loadGraphOverlay,
  loadQuestions,
  loadSettings,
  publicSettings,
  QuestionItem,
  saveChats,
  saveGraphOverlay,
  saveQuestions,
  saveSettings,
  setApiKey
} from './persist'
import { chatStream, ChatMsg } from './zenmux'
import { makeMolXyz } from './mol'
import { buildIndex, ragStatus, retrieve, formatContext } from './rag'
import { extractGraph, generateQuestion, judgeAnswer, solveQuestion } from './exam'
import { examGuidePublic } from './exam-guide'
import { loadBookPages, searchBook } from './ocr'
import { buildSeedGraph, loadTextbookNav } from './curriculum'
import { loadOutlineMarkdown } from './outlines'

protocol.registerSchemesAsPrivileged([
  { scheme: 'highchem', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }
])

function iconFile(): string {
  return join(__dirname, '../../build/icon.png')
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: '高中化学 AI学伴',
    icon: iconFile(),
    backgroundColor: '#161B1F',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      plugins: true
    }
  })

  win.on('ready-to-show', () => win.show())

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setName('高中化学 AI学伴')
  app.setAppUserModelId('edu.highchem.desktop')
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconFile())
  }

  protocol.handle('highchem', async (request) => {
    const url = new URL(request.url)
    const bookId = decodeURIComponent(url.hostname)
    if (bookId === 'goto') return new Response(null, { status: 204 })
    const book = BOOKS.find((b) => b.id === bookId)
    if (!book) return new Response('not found', { status: 404 })
    const file = bookPath(book.pdf)
    if (!fs.existsSync(file)) return new Response('missing pdf', { status: 404 })
    const res = await net.fetch(pathToFileURL(file).href)
    const headers = new Headers(res.headers)
    headers.set('Content-Type', 'application/pdf')
    headers.set('Content-Disposition', 'inline; filename="book.pdf"')
    return new Response(res.body, { status: res.status, headers })
  })

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => publicSettings())

  ipcMain.handle('settings:save', (_e, patch: { baseUrl?: string; models?: string[]; roles?: Record<string, string>; theme?: 'dark' | 'light' }) => {
    const cur = loadSettings()
    if (patch.baseUrl) cur.baseUrl = patch.baseUrl
    if (patch.models) cur.models = patch.models
    if (patch.roles) cur.roles = { ...cur.roles, ...patch.roles }
    if (patch.theme) cur.theme = patch.theme
    saveSettings(cur)
    return publicSettings()
  })

  ipcMain.handle('settings:setKey', (_e, key: string) => {
    setApiKey(key)
    return publicSettings()
  })

  ipcMain.handle('books:list', () =>
    BOOKS.map((b) => ({
      ...b,
      pdfUrl: `highchem://${b.id}/book.pdf`,
      exists: fs.existsSync(bookPath(b.pdf)),
      ocrExists: fs.existsSync(bookPath(b.ocr))
    }))
  )

  ipcMain.handle('books:nav', () => loadTextbookNav())
  ipcMain.handle('books:outlines', (_e, bookId?: string) => loadOutlineMarkdown(bookId))
  ipcMain.handle('books:page', (_e, bookId: string, page: number) => {
    const pages = loadBookPages(bookId)
    return pages.find((p) => p.page === page) || { bookId, page, text: '' }
  })
  ipcMain.handle('books:search', (_e, bookId: string, query: string) => searchBook(bookId, query))

  ipcMain.handle('rag:status', () => ragStatus())
  ipcMain.handle('rag:build', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    return buildIndex(win)
  })
  ipcMain.handle('rag:search', (_e, query: string, bookId?: string) => retrieve(query, 8, bookId))

  ipcMain.handle('graph:seed', () => {
    const overlay = loadGraphOverlay() as { nodes?: unknown[]; links?: unknown[] }
    return {
      seed: buildSeedGraph(),
      overlay,
      note: '覆盖沪科版高中五册：必修一、必修二、选必1–3。考点与问答以教材正文为主，大纲只负责章节定位。'
    }
  })
  ipcMain.handle('graph:extract', async (_e, bookId?: string) => extractGraph(bookId))
  ipcMain.handle('graph:saveOverlay', (_e, data: unknown) => {
    saveGraphOverlay(data)
    return true
  })

  ipcMain.handle('chat:list', () => loadChats())
  ipcMain.handle('chat:save', (_e, thread: ChatThread) => {
    const all = loadChats()
    const i = all.findIndex((t) => t.id === thread.id)
    if (i >= 0) all[i] = thread
    else all.unshift(thread)
    saveChats(all)
    return thread
  })
  ipcMain.handle('chat:delete', (_e, ids: string[]) => {
    saveChats(loadChats().filter((t) => !ids.includes(t.id)))
    return loadChats()
  })

  ipcMain.handle('chat:ask', async (e, payload: {
    threadId?: string
    title?: string
    history: { role: 'user' | 'assistant' | 'system'; content: string }[]
    text: string
    focus?: string
    bookId?: string
    ephemeral?: boolean
    attachments?: { name: string; mime: string; dataUrl?: string; text?: string }[]
  }) => {
    const settings = loadSettings()
    const threadId = payload.threadId || uid('chat')
    let hits: Array<{ bookId: string; page: number; text: string; score?: number }> = []
    try {
      const ragQuery = [payload.text, payload.focus?.slice(0, 400)].filter(Boolean).join(' ')
      hits = (await retrieve(ragQuery || '化学问题', 8, payload.bookId)).hits
    } catch {
      hits = []
    }
    const ctx = formatContext(hits)
    const fileNotes = (payload.attachments || [])
      .filter((a) => a.text)
      .map((a) => `\n\n【附件 ${a.name}】\n${a.text}`)
      .join('')
    const images = (payload.attachments || []).filter((a) => a.dataUrl && (a.mime?.startsWith('image/') || a.dataUrl.startsWith('data:image/')))
    const textBlock = [
      payload.focus ? `【当前上下文】${payload.focus}\n` : '',
      payload.text,
      fileNotes,
      ctx ? `\n\n以下是教材原文检索结果，请优先依据它们回答，并标注册别与页码：\n${ctx}` : '\n\n（教材向量索引尚未建立或检索失败，请尽量依据当前页原文作答；并提醒用户在设置中建立索引。）'
    ].join('')
    const content: ChatMsg['content'] = []
    if (images.length) {
      content.push({ type: 'text', text: textBlock })
      for (const a of images) {
        content.push({ type: 'image_url', image_url: { url: a.dataUrl } })
      }
    }

    const messages: ChatMsg[] = [
      {
        role: 'system',
        content:
          '你是沪科版高中化学助教。若用户正在阅读某一页或查看某个分子，先结合当前上下文和教材原文作答。若有图片或文件附件，先看附件再对照教材。使用简体中文 Markdown，化学式与方程式用 LaTeX / mhchem（$\\ce{H2SO4}$）。引用页码写成「选必2第48页」「必修第一册 P138」这种带册名和页码的格式。不知道就说教材未覆盖。'
      },
      ...payload.history.map((m) => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content: images.length ? content : textBlock
      }
    ]

    let full = ''
    try {
      await chatStream({ model: settings.roles.chat, messages }, (delta) => {
        full += delta
        e.sender.send('chat:delta', { threadId, delta })
      })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      e.sender.send('chat:done', { threadId, full, error, sources: hits })
      return { threadId, full, error, sources: hits }
    }
    e.sender.send('chat:done', { threadId, full, sources: hits })

    if (payload.ephemeral) return { threadId, full, sources: hits }

    const chats = loadChats()
    let thread = chats.find((t) => t.id === threadId)
    if (!thread) {
      thread = {
        id: threadId,
        title: payload.title || payload.text.slice(0, 24) || '新对话',
        messages: [],
        updatedAt: Date.now()
      }
      chats.unshift(thread)
    }
    thread.messages.push({
      id: uid('u'),
      role: 'user',
      content: payload.text,
      attachments: payload.attachments,
      createdAt: Date.now()
    })
    thread.messages.push({
      id: uid('a'),
      role: 'assistant',
      content: full,
      createdAt: Date.now()
    })
    thread.updatedAt = Date.now()
    saveChats(chats)
    return { threadId, full, sources: hits, thread }
  })

  ipcMain.handle('mol:xyz', (_e, payload: { id: string; name: string; formula: string; force?: boolean }) =>
    makeMolXyz(payload.id, payload.name, payload.formula, payload.force)
  )

  ipcMain.handle('exam:guide', () => examGuidePublic())
  ipcMain.handle('exam:generate', (e, body: { type: 'choice' | 'short' | 'comprehensive' | 'gaokao'; nodes: { id: string; label: string; bookId?: string }[] }) =>
    generateQuestion(body, (p) => e.sender.send('exam:progress', p))
  )
  ipcMain.handle('exam:solve', (e, stem: string) =>
    solveQuestion(stem, (p) => e.sender.send('exam:progress', p))
  )
  ipcMain.handle('exam:judge', (e, stem: string, student: string, official?: { answer?: string; analysis?: string; options?: string[]; blanks?: { id: string; answer: string; kind: string }[]; reason?: string }) =>
    judgeAnswer(stem, student, official, (p) => e.sender.send('exam:progress', p))
  )
  ipcMain.handle('bank:list', () => loadQuestions())
  ipcMain.handle('bank:save', (_e, item: QuestionItem) => {
    const all = loadQuestions()
    const i = all.findIndex((q) => q.id === item.id)
    if (i >= 0) all[i] = item
    else all.unshift({ ...item, id: item.id || uid('q'), createdAt: item.createdAt || Date.now() })
    saveQuestions(all)
    return all
  })
  ipcMain.handle('bank:delete', (_e, ids: string[]) => {
    saveQuestions(loadQuestions().filter((q) => !ids.includes(q.id)))
    return loadQuestions()
  })

  ipcMain.handle('export:write', async (_e, filename: string, content: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const picked = await dialog.showSaveDialog(win ?? undefined, {
      defaultPath: filename,
      filters: [{ name: 'Data', extensions: ['json', 'md'] }]
    })
    if (picked.canceled || !picked.filePath) return { ok: false }
    fs.writeFileSync(picked.filePath, content, 'utf8')
    return { ok: true, path: picked.filePath }
  })

  ipcMain.handle('crypto:available', () => safeStorage.isEncryptionAvailable())
  ipcMain.handle('app:hasKey', () => Boolean(getApiKey()))
}
