/**
 * 制度改正のお知らせ（ベンダー管理コンテンツ）。
 * ダッシュボード上部のお知らせバーに表示される。更新はこのファイルの編集＋デプロイで行う。
 * 表示期間外・空配列のときバーは表示されない。
 */
export type Announcement = {
  id: string
  message: string
  /** 表示開始日（YYYY-MM-DD、省略時は常に表示開始済み扱い） */
  startsAt?: string
  /** 表示終了日（YYYY-MM-DD、この日を含む。省略時は無期限） */
  endsAt?: string
  /** 参考リンク（出入国在留管理庁の案内ページ等） */
  link?: string
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'teiki-todoke-annual-2026',
    message: '定期届出は2026年4月より年1回提出に変更されました',
    startsAt: '2026-04-01',
    endsAt: '2026-12-31',
  },
]

/** 今日表示すべきお知らせを返す */
export function getActiveAnnouncements(today: Date = new Date()): Announcement[] {
  const t = today.toISOString().slice(0, 10)
  return ANNOUNCEMENTS.filter(a => (!a.startsAt || a.startsAt <= t) && (!a.endsAt || t <= a.endsAt))
}
