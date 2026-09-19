export type Att = {
  id: string
  name: string
  mime: string
  dataUrl?: string
  text?: string
}

const IMAGE = /^image\//
const TEXT = /^(text\/|application\/(json|xml|csv))/
const TEXT_EXT = /\.(txt|md|csv|json|tex|html|xml|log)$/i
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i

function uid(name: string): string {
  return `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function readAsAtt(file: File): Promise<Att> {
  const id = uid(file.name || 'file')
  if (IMAGE.test(file.type) || IMAGE_EXT.test(file.name)) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () =>
        resolve({
          id,
          name: file.name || 'paste.png',
          mime: file.type || 'image/png',
          dataUrl: String(reader.result)
        })
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }
  if (TEXT.test(file.type) || TEXT_EXT.test(file.name)) {
    if (file.size > 200_000) {
      return Promise.resolve({
        id,
        name: file.name,
        mime: file.type || 'text/plain',
        text: `（${file.name} 超过 200KB，仅附文件名）`
      })
    }
    return file.text().then((text) => ({
      id,
      name: file.name,
      mime: file.type || 'text/plain',
      text
    }))
  }
  return Promise.resolve({
    id,
    name: file.name,
    mime: file.type || 'application/octet-stream',
    text: `（已附文件 ${file.name}，二进制内容未读入。题目或图示请粘贴截图。）`
  })
}

export function filesFromClipboard(e: { clipboardData: DataTransfer }): File[] {
  const images: File[] = []
  const others: File[] = []
  for (const item of e.clipboardData.items) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (!file) continue
    if (item.type.startsWith('image/') || file.type.startsWith('image/')) images.push(file)
    else others.push(file)
  }
  const prefer = (file: File) => {
    const type = file.type
    if (type === 'image/png' || type === 'image/jpeg' || type === 'image/webp') return 0
    if (type === 'image/gif') return 1
    return 2
  }
  images.sort((a, b) => prefer(a) - prefer(b))
  return images.length ? [images[0], ...others] : others
}

export function errMsg(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' && err.message) {
    return err.message
  }
  return String(err || '提问失败')
}
