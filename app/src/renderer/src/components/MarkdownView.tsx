import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import 'katex/dist/contrib/mhchem'
import { gotoTextbook, linkTextbookCites, parseGotoHref } from '../lib/cite'

export function MarkdownView({ text, paper = false }: { text: string; paper?: boolean }) {
  return (
    <div className={paper ? 'md paper' : 'md'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children }) => {
            const cite = parseGotoHref(href)
            if (cite) {
              return (
                <button
                  type="button"
                  className="cite"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    gotoTextbook(cite.bookId, cite.page)
                  }}
                >
                  {children}
                </button>
              )
            }
            return <a href={href} onClick={(e) => { if (href?.startsWith('highchem:')) e.preventDefault() }}>{children}</a>
          }
        }}
      >
        {linkTextbookCites(text || '')}
      </ReactMarkdown>
    </div>
  )
}
