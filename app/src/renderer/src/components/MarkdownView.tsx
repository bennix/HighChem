import { Component, type ErrorInfo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import 'katex/dist/contrib/mhchem'
import { gotoTextbook, linkTextbookCites, parseGotoHref } from '../lib/cite'
import { sanitizeExamMarkdown } from '../lib/examDisplay'

export function MarkdownView({ text, paper = false }: { text: string; paper?: boolean }) {
  return <MarkdownSafe text={text} paper={paper} />
}

class MarkdownSafe extends Component<{ text: string; paper?: boolean }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(_err: Error, _info: ErrorInfo) {
    // KaTeX / remark 遇到残缺公式时整段不渲染，改为原文
  }

  componentDidUpdate(prev: { text: string }) {
    if (prev.text !== this.props.text && this.state.failed) this.setState({ failed: false })
  }

  render(): ReactNode {
    const { text, paper } = this.props
    if (this.state.failed) return <pre className="ocr">{text || ''}</pre>
    return <MarkdownInner text={text} paper={paper} />
  }
}

function MarkdownInner({ text, paper = false }: { text: string; paper?: boolean }) {
  const safe = linkTextbookCites(sanitizeExamMarkdown(text || ''))
  return (
    <div className={paper ? 'md paper' : 'md'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#8a3d1b', strict: 'ignore' }]]}
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
        {safe}
      </ReactMarkdown>
    </div>
  )
}
