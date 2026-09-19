import { useRef } from 'react'
import type { Att } from '../lib/attachments'

export function AttachBar({
  atts,
  onPick,
  onRemove,
  disabled
}: {
  atts: Att[]
  onPick: (files: File[]) => void
  onRemove: (id: string) => void
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)

  return (
    <>
      {atts.length ? (
        <div className="thumbs">
          {atts.map((a) =>
            a.dataUrl ? (
              <div className="thumb" key={a.id}>
                <img src={a.dataUrl} alt={a.name} />
                <button type="button" className="thumb-x" aria-label={`删除 ${a.name}`} onClick={() => onRemove(a.id)}>
                  ×
                </button>
              </div>
            ) : (
              <span className="thumb file" key={a.id}>
                <span className="file-chip chip">{a.name}</span>
                <button type="button" className="thumb-x" aria-label={`删除 ${a.name}`} onClick={() => onRemove(a.id)}>
                  ×
                </button>
              </span>
            )
          )}
        </div>
      ) : null}
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/*,.txt,.md,.csv,.json,.tex,.pdf"
        onChange={(e) => {
          onPick([...(e.target.files || [])])
          e.target.value = ''
        }}
      />
      <button type="button" className="btn ghost" disabled={disabled} onClick={() => input.current?.click()}>
        上传文件
      </button>
    </>
  )
}
