export const ELEMENT_CN: Record<string, string> = {
  H: '氢',
  C: '碳',
  N: '氮',
  O: '氧',
  F: '氟',
  Na: '钠',
  Mg: '镁',
  Al: '铝',
  Si: '硅',
  P: '磷',
  S: '硫',
  Cl: '氯',
  K: '钾',
  Ca: '钙',
  Fe: '铁',
  Br: '溴',
  I: '碘'
}

export function atomLabel(elem: string): string {
  const cn = ELEMENT_CN[elem] || elem
  return cn === elem ? elem : `${cn} ${elem}`
}
