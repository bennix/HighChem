type Book = { id: string; title: string; short: string; pages: number; exists: boolean }
type Rag = { ready: boolean; chunks: number; books: { id: string; title: string; chunks: number }[] }

export function Workbench({
  books,
  rag,
  onOpen,
  onIndex
}: {
  books: Book[]
  rag: Rag | null
  onOpen: (id: string, page?: string) => void
  onIndex: () => void
}) {
  return (
    <div className="page">
      <div className="grid books">
        {books.map((b) => (
          <article className="card" key={b.id}>
            <h3>{b.short}</h3>
            <p className="muted">{b.title}</p>
            <p className="small muted">{b.pages} 页 · {b.exists ? '可搜索 PDF 已就绪' : '未找到 PDF'}</p>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={() => onOpen('textbook', b.id)}>打开教材</button>
              <button className="btn" onClick={() => onOpen('graph', b.id)}>看图谱</button>
            </div>
          </article>
        ))}
      </div>
      <div className="grid two" style={{ marginTop: 16 }}>
        <section className="card">
          <h3>教材检索索引</h3>
          <p className="muted">问答、出题、考点提炼都走五册 OCR 正文的向量检索。大纲只负责跳到章节页。</p>
          <p>{rag?.ready ? `已索引 ${rag.chunks} 个片段` : '尚未建立索引'}</p>
          <button className="btn primary" onClick={onIndex}>建立 / 重建索引</button>
        </section>
        <section className="card paper">
          <h3>怎么用</h3>
          <p>1. 设置里填入 ZenMux API Key（没有就走邀请链接）。</p>
          <p>2. 先建索引，再在图谱里点选考点出题。</p>
          <p>3. 出题与解题各跑两个模型，再由仲裁模型判定能否入库。</p>
        </section>
      </div>
    </div>
  )
}
