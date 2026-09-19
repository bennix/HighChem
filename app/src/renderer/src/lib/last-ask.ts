export type LastAsk = { question: string; reply: string }

let last: LastAsk | null = null

export function rememberAsk(question: string, reply: string) {
  if (!reply.trim()) return
  last = { question, reply }
  window.dispatchEvent(new Event('highchem-last-ask'))
}

export function readLastAsk(): LastAsk | null {
  return last
}
