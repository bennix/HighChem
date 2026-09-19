import { loadAllNav, NavNode } from './outlines'

export type { NavNode }

export interface GraphNode {
  id: string
  label: string
  kind: 'book' | 'chapter' | 'concept' | 'exam'
  bookId?: string
  page?: number
}

export interface GraphLink {
  source: string
  target: string
  rel: string
}

function flattenNav(nodes: NavNode[], acc: GraphNode[] = []): GraphNode[] {
  for (const n of nodes) {
    acc.push({
      id: n.id,
      label: n.title,
      kind: n.children?.length ? 'chapter' : 'concept',
      bookId: n.bookId,
      page: n.page
    })
    if (n.children) flattenNav(n.children, acc)
  }
  return acc
}

function navLinks(nodes: NavNode[], links: GraphLink[] = []): GraphLink[] {
  for (const n of nodes) {
    for (const c of n.children || []) {
      links.push({ source: n.id, target: c.id, rel: '包含' })
      navLinks([c], links)
    }
  }
  return links
}

const examPoints: GraphNode[] = [
  { id: 'ex-class', label: '物质分类与丁达尔效应', kind: 'exam', bookId: 'b1', page: 12 },
  { id: 'ex-n', label: '物质的量关系式', kind: 'exam', bookId: 'b1', page: 20 },
  { id: 'ex-vm', label: '气体摩尔体积(标况)', kind: 'exam', bookId: 'b1', page: 21 },
  { id: 'ex-c', label: '容量瓶定容与误差', kind: 'exam', bookId: 'b1', page: 34 },
  { id: 'ex-sep', label: '粗盐提纯试剂顺序', kind: 'exam', bookId: 'b1', page: 48 },
  { id: 'ex-cl', label: '氯气性质', kind: 'exam', bookId: 'b1', page: 51 },
  { id: 'ex-redox', label: '氧化还原反应', kind: 'exam', bookId: 'b1', page: 58 },
  { id: 'ex-ion', label: '离子方程式', kind: 'exam', bookId: 'b1', page: 64 },
  { id: 'ex-s', label: '硫的氧化物与硫酸', kind: 'exam', bookId: 'b1', page: 81 },
  { id: 'ex-n2', label: '氨与硝酸', kind: 'exam', bookId: 'b1', page: 90 },
  { id: 'ex-pt', label: '元素周期律', kind: 'exam', bookId: 'b1', page: 115 },
  { id: 'ex-bond', label: '离子键与共价键', kind: 'exam', bookId: 'b1', page: 138 },
  { id: 'ex-na', label: 'Na/Al/Fe转化与两性', kind: 'exam', bookId: 'b2', page: 8 },
  { id: 'ex-fe', label: 'Fe2+/Fe3+与菠菜中铁', kind: 'exam', bookId: 'b2', page: 40 },
  { id: 'ex-energy', label: '放热吸热与热化学方程式', kind: 'exam', bookId: 'b2', page: 29 },
  { id: 'ex-rate', label: '浓度温度催化剂与速率', kind: 'exam', bookId: 'b2', page: 46 },
  { id: 'ex-eq', label: '勒夏特列与转化率', kind: 'exam', bookId: 'b2', page: 55 },
  { id: 'ex-org', label: '乙醇乙酸与酯化', kind: 'exam', bookId: 'b2', page: 96 },
  { id: 'ex-h', label: '盖斯定律与ΔH', kind: 'exam', bookId: 'b3', page: 10 },
  { id: 'ex-k', label: 'ΔG与K、合成氨条件', kind: 'exam', bookId: 'b3', page: 39 },
  { id: 'ex-ph', label: 'pH与Ka/Kb', kind: 'exam', bookId: 'b3', page: 66 },
  { id: 'ex-hydro', label: '水解与滴定曲线', kind: 'exam', bookId: 'b3', page: 75 },
  { id: 'ex-ksp', label: 'Ksp与沉淀转化', kind: 'exam', bookId: 'b3', page: 82 },
  { id: 'ex-cell', label: '原电池电解与腐蚀', kind: 'exam', bookId: 'b3', page: 96 },
  { id: 'ex-atom', label: '核外电子排布', kind: 'exam', bookId: 'b4', page: 17 },
  { id: 'ex-vsepr', label: '共价分子空间结构', kind: 'exam', bookId: 'b4', page: 36 },
  { id: 'ex-crystal', label: '四类晶体', kind: 'exam', bookId: 'b4', page: 76 },
  { id: 'ex-name', label: '有机物命名', kind: 'exam', bookId: 'b5', page: 21 },
  { id: 'ex-halo', label: '卤代烃', kind: 'exam', bookId: 'b5', page: 42 },
  { id: 'ex-func', label: '醇醛羧酸', kind: 'exam', bookId: 'b5', page: 52 },
  { id: 'ex-poly', label: '高分子', kind: 'exam', bookId: 'b5', page: 92 }
]

function attachExam(nav: NavNode[]): GraphLink[] {
  const byTitle = new Map<string, string>()
  const walk = (nodes: NavNode[]) => {
    for (const n of nodes) {
      byTitle.set(n.title, n.id)
      if (n.children) walk(n.children)
    }
  }
  walk(nav)

  const pairs: [string, string][] = [
    ['物质的分类', 'ex-class'],
    ['分散系', 'ex-class'],
    ['第2节 物质的量', 'ex-n'],
    ['气体摩尔体积', 'ex-vm'],
    ['物质的量浓度', 'ex-c'],
    ['配制一定物质的量浓度的溶液', 'ex-c'],
    ['粗盐提纯', 'ex-sep'],
    ['氯气的性质', 'ex-cl'],
    ['第2节 氧化还原反应和离子反应', 'ex-redox'],
    ['离子反应和离子方程式', 'ex-ion'],
    ['硫的氧化物', 'ex-s'],
    ['氨和铵盐', 'ex-n2'],
    ['元素周期律', 'ex-pt'],
    ['第4节 化学键', 'ex-bond'],
    ['5.1 金属的性质', 'ex-na'],
    ['5.2 重要的金属化合物', 'ex-fe'],
    ['5.3 化学变化中的能量变化', 'ex-energy'],
    ['6.1 化学反应速率', 'ex-rate'],
    ['6.2 化学平衡', 'ex-eq'],
    ['7.3 乙醇和乙酸', 'ex-org'],
    ['1.1 化学反应与能量变化', 'ex-h'],
    ['2.2 化学反应的限度', 'ex-k'],
    ['3.1 水的电离和溶液的酸碱性', 'ex-ph'],
    ['3.3 酸碱中和与盐类水解', 'ex-hydro'],
    ['3.4 难溶电解质的沉淀溶解平衡', 'ex-ksp'],
    ['4.2 原电池和化学电源', 'ex-cell'],
    ['1.2 多电子原子核外电子的排布', 'ex-atom'],
    ['2.1 共价分子的空间结构', 'ex-vsepr'],
    ['3.1 金属晶体', 'ex-crystal'],
    ['1.3 有机化合物的命名', 'ex-name'],
    ['2.3 卤代烃', 'ex-halo'],
    ['3.1 醇和酚', 'ex-func'],
    ['4.2 合成高分子', 'ex-poly']
  ]

  const links: GraphLink[] = []
  for (const [title, examId] of pairs) {
    const src = byTitle.get(title)
    if (src) links.push({ source: src, target: examId, rel: '考点' })
  }
  links.push(
    { source: 'ex-n', target: 'ex-c', rel: '应用' },
    { source: 'ex-n', target: 'ex-vm', rel: '应用' },
    { source: 'ex-sep', target: 'ex-ion', rel: '综合' },
    { source: 'ex-cl', target: 'ex-n', rel: '计量' },
    { source: 'ex-redox', target: 'ex-cell', rel: '延伸' },
    { source: 'ex-eq', target: 'ex-k', rel: '延伸' },
    { source: 'ex-pt', target: 'ex-atom', rel: '延伸' },
    { source: 'ex-org', target: 'ex-func', rel: '延伸' },
    { source: 'ex-energy', target: 'ex-h', rel: '延伸' },
    { source: 'ex-bond', target: 'ex-vsepr', rel: '延伸' }
  )
  return links
}

export function loadTextbookNav(): NavNode[] {
  return loadAllNav()
}

export function buildSeedGraph() {
  const nav = loadAllNav()
  const hub: GraphNode = { id: 'hs', label: '高中化学（沪科版五册）', kind: 'book' }
  const bookLinks: GraphLink[] = nav.map((b) => ({ source: 'hs', target: b.id, rel: '包含' }))
  return {
    nodes: [hub, ...flattenNav(nav), ...examPoints],
    links: [...bookLinks, ...navLinks(nav), ...attachExam(nav)]
  }
}

export const TEXTBOOK_NAV = loadTextbookNav
export const SEED_GRAPH = buildSeedGraph
