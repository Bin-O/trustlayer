export type DocumentId =
  | 'koyou_joken'
  | 'shien_keikaku'
  | 'todoke_joken_henkou'
  | 'todoke_junyuu_konnan'
  | 'todoke_shien_konnan'
  | 'teiki_todoke'

export type DocumentDef = {
  id: DocumentId
  label: string
  shortLabel: string
  /** false = 準備中（ボタン非表示） */
  available: boolean
  outputFormat: 'docx' | 'excel'
}

const DOC: Record<DocumentId, DocumentDef> = {
  koyou_joken: {
    id: 'koyou_joken',
    label: '雇用条件書（参考様式第1-6号）',
    shortLabel: '雇用条件書',
    available: true,
    outputFormat: 'docx',
  },
  shien_keikaku: {
    id: 'shien_keikaku',
    label: '1号特定技能外国人支援計画書',
    shortLabel: '支援計画書',
    available: false,
    outputFormat: 'docx',
  },
  todoke_joken_henkou: {
    id: 'todoke_joken_henkou',
    label: '随時届出（雇用条件変更）',
    shortLabel: '随時届出-条件変更',
    available: false,
    outputFormat: 'docx',
  },
  todoke_junyuu_konnan: {
    id: 'todoke_junyuu_konnan',
    label: '随時届出（受入困難・退職等）',
    shortLabel: '随時届出-受入困難',
    available: false,
    outputFormat: 'docx',
  },
  todoke_shien_konnan: {
    id: 'todoke_shien_konnan',
    label: '随時届出（支援計画実施困難）',
    shortLabel: '随時届出-支援困難',
    available: false,
    outputFormat: 'docx',
  },
  teiki_todoke: {
    id: 'teiki_todoke',
    label: '定期届出',
    shortLabel: '定期届出',
    available: false,
    outputFormat: 'excel',
  },
}

/**
 * 在留資格 → 適用文書リスト のマッピング。
 * 新しい在留資格や文書タイプを追加するときはここだけ変更する。
 */
export const STATUS_DOCUMENT_MAP: Record<string, DocumentId[]> = {
  '特定技能1号': [
    'koyou_joken',
    'shien_keikaku',
    'todoke_joken_henkou',
    'todoke_junyuu_konnan',
    'todoke_shien_konnan',
    'teiki_todoke',
  ],
  '特定技能2号': [
    'koyou_joken',
    'teiki_todoke',
  ],
  '技術・人文知識・国際業務': [
    'koyou_joken',
  ],
  '高度専門職1号': [
    'koyou_joken',
  ],
  '高度専門職2号': [
    'koyou_joken',
  ],
  '技能実習1号イ': [],
  '技能実習2号イ': [],
  '技能実習3号イ': [],
  '永住者': [],
  '留学': [],
  '特定活動': [],
  'その他': [],
}

/** 指定した在留資格に対応する文書定義の配列を返す（利用可否問わず全件） */
export function getDocumentsForStatus(statusType: string): DocumentDef[] {
  const ids = STATUS_DOCUMENT_MAP[statusType] ?? []
  return ids.map(id => DOC[id])
}

/** 利用可能な文書のみ返す */
export function getAvailableDocuments(statusType: string): DocumentDef[] {
  return getDocumentsForStatus(statusType).filter(d => d.available)
}
