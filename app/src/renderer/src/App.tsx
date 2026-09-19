import { useEffect, useState } from 'react'
import { gotoTextbook } from './lib/cite'
import { Workbench } from './pages/Workbench'
import { Textbook } from './pages/Textbook'
import { GraphPage } from './pages/GraphPage'
import { Lab } from './pages/Lab'
import { Chat } from './pages/Chat'
import { Exam } from './pages/Exam'
import { Bank } from './pages/Bank'
import { History } from './pages/History'
import { Settings } from './pages/Settings'

type Page = 'home' | 'textbook' | 'graph' | 'lab' | 'chat' | 'exam' | 'bank' | 'history' | 'settings'
type Node = { id: string; label: string; bookId?: string; page?: number }

const TITLES: Record<Page, string> = {
  home: '实验台',
  textbook: '教材',
  graph: '知识图谱',
  lab: '分子',
  chat: '问答',
  exam: '出题',
  bank: '题库',
  history: '对话',
  settings: '设置'
}

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [books, setBooks] = useState<Array<{ id: string; title: string; short: string; pdfUrl: string; pages: number; exists: boolean }>>([])
  const [nav, setNav] = useState([])
  const [rag, setRag] = useState<{ ready: boolean; chunks: number; books: { id: string; title: string; chunks: number }[] } | null>(null)
  const [bookFocus, setBookFocus] = useState<string>('b1')
  const [bookPage, setBookPage] = useState<number>(1)
  const [examNodes, setExamNodes] = useState<Node[]>([])
  const [examType, setExamType] = useState<'choice' | 'short' | 'comprehensive' | 'gaokao'>('gaokao')
  const [chatId, setChatId] = useState<string | undefined>()
  const [hasKey, setHasKey] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  function applyTheme(next: 'dark' | 'light') {
    setTheme(next)
    document.documentElement.dataset.theme = next
    window.dispatchEvent(new Event('highchem-theme'))
  }

  async function boot() {
    setBooks(await window.highchem.books.list())
    setNav(await window.highchem.books.nav())
    setRag(await window.highchem.rag.status())
    const s = await window.highchem.settings.get()
    setHasKey(s.hasKey)
    applyTheme(s.theme === 'light' ? 'light' : 'dark')
  }
  useEffect(() => { boot() }, [])
  useEffect(() => {
    const go = (e: Event) => {
      const { bookId, page } = (e as CustomEvent<{ bookId: string; page: number }>).detail || {}
      if (!bookId || !page) return
      setBookFocus(bookId)
      setBookPage(page)
      setPage('textbook')
    }
    window.addEventListener('highchem-goto', go)
    return () => window.removeEventListener('highchem-goto', go)
  }, [])

  async function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    await window.highchem.settings.save({ theme: next })
  }

  return (
    <div className="app" data-theme={theme}>
      <aside className="rail">
        <div className="brand">
          <h1>高中化学 AI学伴</h1>
          <p>沪科版五册教材 · 大纲定位 · 正文检索</p>
        </div>
        <nav className="nav">
          {(Object.keys(TITLES) as Page[]).map((id) => (
            <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>{TITLES[id]}</button>
          ))}
        </nav>
        <button className="btn theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? '切换亮色' : '切换暗色'}
        </button>
        <p className="small muted">{hasKey ? 'API Key 已保存' : '尚未设置 API Key'}</p>
      </aside>
      <main className="stage">
        <header className="topbar">
          <h2>{TITLES[page]}</h2>
          <div className="meta row">
            <span>{rag?.ready ? `索引 ${rag.chunks}` : '索引未建'} · 上海科学技术出版社</span>
            <button className="btn ghost" onClick={toggleTheme}>{theme === 'dark' ? '亮色' : '暗色'}</button>
          </div>
        </header>
        {page === 'home' && (
          <Workbench
            books={books}
            rag={rag}
            onOpen={(target, bookId) => {
              if (bookId) setBookFocus(bookId)
              setPage(target as Page)
            }}
            onIndex={() => setPage('settings')}
          />
        )}
        <div className={page === 'textbook' ? 'view-on' : 'view-off'}>
          <Textbook books={books} nav={nav} initialBook={bookFocus} initialPage={bookPage} />
        </div>
        {page === 'graph' && (
          <GraphPage
            onGoto={(bookId, pdfPage) => gotoTextbook(bookId, pdfPage)}
            onExam={(nodes, type) => {
              setExamNodes(nodes)
              setExamType(type)
              setPage('exam')
            }}
          />
        )}
        <div className={page === 'lab' ? 'view-on' : 'view-off'}>
          <Lab />
        </div>
        <div className={page === 'chat' ? 'view-on' : 'view-off'}>
          <Chat initialThread={chatId} />
        </div>
        {page === 'exam' && <Exam presetNodes={examNodes} presetType={examType} />}
        {page === 'bank' && <Bank />}
        {page === 'history' && (
          <History onContinue={(id) => { setChatId(id); setPage('chat') }} />
        )}
        {page === 'settings' && <Settings onIndexed={boot} theme={theme} onTheme={toggleTheme} />}
      </main>
    </div>
  )
}
