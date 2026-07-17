'use client'
/**
 * 信頼スコアカード（仕様書 §6-1）
 * - 総合スコア(28px) + 前月比トレンド矢印
 * - レーダーチャート5軸（達成率ベース: 配点が不均一なため score/max で描画）
 * - 内訳リスト（点数/満点 + 検証バッジ）
 * - データ充足度バー
 * - 推移グラフ（月次スナップショット・折りたたみ）
 */
import { useState } from 'react'
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import type { TrustScoreResult, SnapshotRow, Badge } from '@/lib/trustScore'
import { BRANCH_META } from '@/lib/trustScore'

const BADGE_STYLE: Record<Badge, { label: string; color: string; bg: string; border: string }> = {
  verified:           { label: '検証済',     color: '#166534', bg: '#dcfce7', border: '#bbf7d0' },
  document_confirmed: { label: '書類確認済', color: '#1e40af', bg: '#dbeafe', border: '#bfdbfe' },
  self_reported:      { label: '申告',       color: '#4b5563', bg: '#f3f4f6', border: '#e5e7eb' },
  subjective:         { label: '主観',       color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
}

const RADAR_LABEL: Record<string, string> = {
  continuity: '継続性',
  evaluation: '評価',
  compliance: 'コンプラ',
  support: '支援参加',
  qualification: '資格',
}

function BadgeChip({ badge, hasData }: { badge: Badge; hasData: boolean }) {
  // 根拠データが無い項目は種別バッジではなく「データ未蓄積」を表示
  const s = hasData
    ? BADGE_STYLE[badge]
    : { label: 'データ未蓄積', color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb' }
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 9999, padding: '1px 8px', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

function ItemBar({ score, max }: { score: number; max: number }) {
  const pct = Math.round((score / max) * 100)
  // スコアの高低は状態色で塗らない(赤=期限超過専用)。バーは中立のブランド青
  const color = '#2563eb'
  return (
    <div style={{ height: 6, borderRadius: 3, background: '#f3f4f6', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
  )
}

export default function TrustScoreCard({ result, snapshots }: {
  result: TrustScoreResult | null
  snapshots: SnapshotRow[]
}) {
  const [showHistory, setShowHistory] = useState(false)

  if (!result) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#111827' }}>信頼スコア内訳</h2>
        <div style={{ fontSize: 13, color: '#9ca3af' }}>読み込み中...</div>
      </div>
    )
  }

  const isVerified = result.branch === 'verified'
  const branchMeta = BRANCH_META[result.branch]
  const total = Math.round(result.total)
  // 総合点は中立色。状態は branch バッジ側で表現する(4色体系)
  const totalColor = '#111827'

  // 前月比トレンド: 当月以外で最新のスナップショットと比較
  const nowMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const prev = [...snapshots].filter(s => s.month < nowMonth).pop()
  const diff = prev ? total - Math.round(prev.total) : null
  const trend = diff === null ? null : diff > 0 ? { mark: '▲', color: '#16a34a', text: `+${diff}` }
    : diff < 0 ? { mark: '▼', color: '#d97706', text: `${diff}` }
    : { mark: '−', color: '#9ca3af', text: '±0' }

  const radarData = result.items.map(i => ({
    axis: RADAR_LABEL[i.key] ?? i.label,
    pct: Math.round((i.score / i.max) * 100),
  }))

  const historyData = snapshots.map(s => ({ month: s.month, total: Math.round(s.total) }))

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      {/* ヘッダー: 総合スコア + トレンド */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>信頼スコア内訳</h2>
        {!isVerified ? (
          <span style={{ fontSize: 12, fontWeight: 600, color: branchMeta.color, background: branchMeta.bg, border: `1px solid ${branchMeta.border}`, borderRadius: 9999, padding: '3px 12px' }}>
            {branchMeta.label}
          </span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: totalColor, lineHeight: 1 }}>
              {total}<span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 400 }}> / 100</span>
            </span>
            {trend && (
              <span style={{ fontSize: 12, fontWeight: 600, color: trend.color }}>
                {trend.mark} {trend.text}
              </span>
            )}
          </div>
        )}
      </div>

      {/* レーダーチャート（達成率ベース） */}
      <div style={{ height: 180, margin: '4px 0' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="72%">
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: '#6b7280' }} />
            <Radar dataKey="pct" stroke="#2563eb" fill="#2563eb" fillOpacity={0.18} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* 内訳リスト */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {result.items.map(item => (
          <div key={item.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{item.label}</span>
                <BadgeChip badge={item.badge} hasData={item.hasData} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                {Math.round(item.score)} / {item.max}
              </span>
            </div>
            <ItemBar score={item.score} max={item.max} />
            {item.detail && (
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                面談時評価 {item.detail.interviewCount > 0 ? `${item.detail.interview}/15` : '未評価'} ・ 行動シグナル {item.detail.behavioral}/15
              </div>
            )}
          </div>
        ))}
      </div>

      {/* データ充足度 */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>データ充足度</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>{Math.round(result.data_sufficiency * 100)}%</span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: '#f3f4f6', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.round(result.data_sufficiency * 100)}%`, background: '#2563eb', borderRadius: 3 }} />
        </div>
        {result.branch === 'attention' && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px' }}>
            在職期間が経過していますが、面談記録・雇用主評価が未登録です。特定技能の面談は3ヶ月に1回以上の実施が必要です。至急ご対応ください。
          </div>
        )}
        {result.branch === 'accumulating' && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }}>
            算出に必要なデータが不足しています。賃金台帳・面談記録・資格情報が蓄積されると総合スコアが表示されます。
          </div>
        )}
      </div>

      {/* 推移グラフ（折りたたみ） */}
      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => setShowHistory(v => !v)}
          style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: '#2563eb', cursor: 'pointer', fontWeight: 500 }}
        >
          {showHistory ? '▾ スコア推移を閉じる' : '▸ スコア推移を表示'}
        </button>
        {showHistory && (
          historyData.length >= 2 ? (
            <div style={{ height: 140, marginTop: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                  <CartesianGrid stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <Tooltip formatter={(v) => [`${v}点`, '総合スコア']} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
              月次スナップショットが2件以上蓄積されると推移グラフが表示されます。
            </div>
          )
        )}
      </div>
    </div>
  )
}
