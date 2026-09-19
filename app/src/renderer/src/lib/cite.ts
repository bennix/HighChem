export function gotoTextbook(bookId: string, page: number) {
  window.dispatchEvent(new CustomEvent('highchem-goto', { detail: { bookId, page } }))
}

export function parseGotoHref(href?: string): { bookId: string; page: number } | null {
  const m = href?.match(/(?:#goto\/|highchem:\/\/goto\/)(b[1-5])\/(\d+)/)
  if (!m) return null
  return { bookId: m[1], page: Number(m[2]) }
}

function bookIdOf(raw: string): string | null {
  if (/选必\s*1|选择性必修\s*1|化学反应原理/.test(raw)) return 'b3'
  if (/选必\s*2|选择性必修\s*2|物质结构/.test(raw)) return 'b4'
  if (/选必\s*3|选择性必修\s*3|有机化学/.test(raw)) return 'b5'
  if (/必修\s*(第二册|二)/.test(raw)) return 'b2'
  if (/必修/.test(raw)) return 'b1'
  return null
}

const BOOK = '(选择性必修\\s*[1-3]|选必\\s*[1-3]|必修\\s*(?:第一册|第二册|[一二12])册?|化学反应原理|物质结构与性质|有机化学基础)'
const PAGE = '(?:第|P|p)\\s*\\d{1,3}\\s*页?'
const CITE_RE = new RegExp(`${BOOK}([^\\n]{0,16}?)((?:${PAGE})(?:\\s*[、,，和及/]\\s*${PAGE})*)`, 'g')

export function linkTextbookCites(text: string): string {
  return text.replace(CITE_RE, (all, bookRaw: string, mid: string, pagesRaw: string) => {
    const bookId = bookIdOf(bookRaw)
    if (!bookId) return all
    const shift = /书内/.test(all) ? 5 : 0
    const linked = pagesRaw.replace(/(第|P|p)\s*(\d{1,3})(\s*页)?/g, (_m, prefix: string, n: string, suffix = '') => {
      const page = Number(n) + shift
      if (!page) return `${prefix}${n}${suffix}`
      return `[${prefix}${n}${suffix}](#goto/${bookId}/${page})`
    })
    return `${bookRaw}${mid}${linked}`
  })
}
