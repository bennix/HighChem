import { contextBridge, ipcRenderer } from 'electron'

type Unsub = () => void

const api = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (patch: unknown) => ipcRenderer.invoke('settings:save', patch),
    setKey: (key: string) => ipcRenderer.invoke('settings:setKey', key)
  },
  books: {
    list: () => ipcRenderer.invoke('books:list'),
    nav: () => ipcRenderer.invoke('books:nav'),
    outlines: (bookId?: string) => ipcRenderer.invoke('books:outlines', bookId),
    page: (bookId: string, page: number) => ipcRenderer.invoke('books:page', bookId, page),
    search: (bookId: string, query: string) => ipcRenderer.invoke('books:search', bookId, query)
  },
  rag: {
    status: () => ipcRenderer.invoke('rag:status'),
    build: () => ipcRenderer.invoke('rag:build'),
    search: (query: string, bookId?: string) => ipcRenderer.invoke('rag:search', query, bookId),
    onProgress: (cb: (p: Record<string, unknown>) => void): Unsub => {
      const fn = (_e: unknown, p: Record<string, unknown>) => cb(p)
      ipcRenderer.on('rag:progress', fn)
      return () => ipcRenderer.removeListener('rag:progress', fn)
    }
  },
  graph: {
    seed: () => ipcRenderer.invoke('graph:seed'),
    extract: (bookId?: string) => ipcRenderer.invoke('graph:extract', bookId),
    saveOverlay: (data: unknown) => ipcRenderer.invoke('graph:saveOverlay', data)
  },
  chat: {
    list: () => ipcRenderer.invoke('chat:list'),
    save: (thread: unknown) => ipcRenderer.invoke('chat:save', thread),
    delete: (ids: string[]) => ipcRenderer.invoke('chat:delete', ids),
    ask: (payload: unknown) => ipcRenderer.invoke('chat:ask', payload),
    onDelta: (cb: (p: { threadId: string; delta: string }) => void): Unsub => {
      const fn = (_e: unknown, p: { threadId: string; delta: string }) => cb(p)
      ipcRenderer.on('chat:delta', fn)
      return () => ipcRenderer.removeListener('chat:delta', fn)
    },
    onDone: (cb: (p: { threadId: string; full: string; sources: unknown[] }) => void): Unsub => {
      const fn = (_e: unknown, p: { threadId: string; full: string; sources: unknown[] }) => cb(p)
      ipcRenderer.on('chat:done', fn)
      return () => ipcRenderer.removeListener('chat:done', fn)
    }
  },
  exam: {
    guide: () => ipcRenderer.invoke('exam:guide'),
    generate: (body: unknown) => ipcRenderer.invoke('exam:generate', body),
    onProgress: (cb: (p: { step: number; total: number; label: string; lane?: string; delta?: string; reset?: boolean }) => void): Unsub => {
      const fn = (_e: unknown, p: { step: number; total: number; label: string; lane?: string; delta?: string; reset?: boolean }) => cb(p)
      ipcRenderer.on('exam:progress', fn)
      return () => ipcRenderer.removeListener('exam:progress', fn)
    },
    solve: (stem: string) => ipcRenderer.invoke('exam:solve', stem),
    judge: (stem: string, student: string, official?: unknown) => ipcRenderer.invoke('exam:judge', stem, student, official)
  },
  bank: {
    list: () => ipcRenderer.invoke('bank:list'),
    save: (item: unknown) => ipcRenderer.invoke('bank:save', item),
    delete: (ids: string[]) => ipcRenderer.invoke('bank:delete', ids)
  },
  mol: {
    xyz: (payload: { id: string; name: string; formula: string; force?: boolean }) =>
      ipcRenderer.invoke('mol:xyz', payload)
  },
  exportWrite: (filename: string, content: string) => ipcRenderer.invoke('export:write', filename, content)
}

contextBridge.exposeInMainWorld('highchem', api)

export type HighchemAPI = typeof api
