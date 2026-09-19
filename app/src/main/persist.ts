import { safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { userDataFile } from './paths'

export type ModelRole = 'chat' | 'genA' | 'genB' | 'arbiter' | 'embed'

export interface Settings {
  apiKeyEnc: string | null
  apiKeyPlainFallback: string | null
  baseUrl: string
  models: string[]
  roles: Record<ModelRole, string>
  theme: 'dark' | 'light'
}

const DEFAULT_MODELS = [
  'anthropic/claude-sonnet-5',
  'openai/gpt-5.6-luna',
  'x-ai/grok-4.6',
  'openai/text-embedding-3-small'
]

export function defaultSettings(): Settings {
  return {
    apiKeyEnc: null,
    apiKeyPlainFallback: null,
    baseUrl: 'https://zenmux.ai/api/v1',
    models: [...DEFAULT_MODELS],
    roles: {
      chat: 'anthropic/claude-sonnet-5',
      genA: 'anthropic/claude-sonnet-5',
      genB: 'openai/gpt-5.6-luna',
      arbiter: 'x-ai/grok-4.6',
      embed: 'openai/text-embedding-3-small'
    },
    theme: 'dark'
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

export function loadSettings(): Settings {
  return { ...defaultSettings(), ...readJson(userDataFile('settings.json'), {}) }
}

export function saveSettings(next: Settings): void {
  writeJson(userDataFile('settings.json'), next)
}

export function setApiKey(raw: string): Settings {
  const settings = loadSettings()
  const trimmed = raw.trim()
  if (!trimmed) {
    settings.apiKeyEnc = null
    settings.apiKeyPlainFallback = null
    saveSettings(settings)
    return settings
  }
  if (safeStorage.isEncryptionAvailable()) {
    settings.apiKeyEnc = safeStorage.encryptString(trimmed).toString('base64')
    settings.apiKeyPlainFallback = null
  } else {
    settings.apiKeyEnc = null
    settings.apiKeyPlainFallback = trimmed
  }
  saveSettings(settings)
  return settings
}

export function getApiKey(): string {
  const settings = loadSettings()
  if (settings.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(settings.apiKeyEnc, 'base64'))
    } catch {
      return ''
    }
  }
  return settings.apiKeyPlainFallback || ''
}

export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '•'.repeat(key.length)
  return `${key.slice(0, 4)}${'•'.repeat(Math.max(8, key.length - 8))}${key.slice(-4)}`
}

export function publicSettings() {
  const s = loadSettings()
  const key = getApiKey()
  return {
    hasKey: Boolean(key),
    maskedKey: maskKey(key),
    baseUrl: s.baseUrl,
    models: s.models,
    roles: s.roles,
    inviteUrl: 'https://zenmux.ai/invite/GBQMC5',
    encryption: safeStorage.isEncryptionAvailable() ? 'os-safeStorage' : 'local-fallback',
    theme: s.theme === 'light' ? 'light' : 'dark'
  }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: { name: string; mime: string; dataUrl?: string; text?: string }[]
  createdAt: number
}

export interface ChatThread {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
}

export interface QuestionItem {
  id: string
  type: string
  stem: string
  options?: string[]
  answer: string
  analysis: string
  methodA?: string
  methodB?: string
  faster?: string
  verdict?: string
  nodes?: string[]
  source?: string
  createdAt: number
}

export interface PaperItem {
  id: string
  title: string
  verdict: string
  accept: boolean
  questions: {
    id: string
    section: string
    stem: string
    answer: string
    analysis: string
    examPoints?: string[]
    max: number
  }[]
  createdAt: number
}

export function loadChats(): ChatThread[] {
  return readJson(userDataFile('chats.json'), [])
}

export function saveChats(chats: ChatThread[]): void {
  writeJson(userDataFile('chats.json'), chats)
}

export function loadQuestions(): QuestionItem[] {
  return readJson(userDataFile('questions.json'), [])
}

export function saveQuestions(items: QuestionItem[]): void {
  writeJson(userDataFile('questions.json'), items)
}

export function loadPapers(): PaperItem[] {
  return readJson(userDataFile('papers.json'), [])
}

export function savePapers(items: PaperItem[]): void {
  writeJson(userDataFile('papers.json'), items)
}

export function loadGraphOverlay() {
  return readJson(userDataFile('graph-overlay.json'), { nodes: [], links: [] })
}

export function saveGraphOverlay(data: unknown): void {
  writeJson(userDataFile('graph-overlay.json'), data)
}

export function loadEmbeddings(): { model: string; chunks: EmbedChunk[] } {
  return readJson(userDataFile('embeddings.json'), { model: '', chunks: [] })
}

export function saveEmbeddings(data: { model: string; chunks: EmbedChunk[] }): void {
  writeJson(userDataFile('embeddings.json'), data)
}

export function loadMolXyz(): Record<string, string> {
  return readJson(userDataFile('mol-xyz.json'), {})
}

export function saveMolXyz(data: Record<string, string>): void {
  writeJson(userDataFile('mol-xyz.json'), data)
}

export interface EmbedChunk {
  id: string
  bookId: string
  page: number
  text: string
  embedding: number[]
}
