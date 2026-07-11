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
import { SUFFICIENCY_DISPLAY_THRESHOLD } from '@/lib/trustScore'

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

function BadgeChip({ badge }: { badge: Badge }) {
  const s = BADGE_STYLE[badge]
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 9999, padding: '1px 8px', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

function ItemBar({ score, max }: { score: number; max: number }) {
  const pct = Math.round((score / max) * 100)
  const color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'
  return (
    <div style={{ height: 6, borderRadius: 3, background: '#f0f0f0', overflow: 'hidden' }}>
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
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#000' }}>信頼スコア内訳</h2>
        <div style={{ fontSize: 13, color: '#999' }}>読み込み中...</div>
      </div>
    )
  }

  const accumulating = result.data_sufficiency < SUFFICIENCY_DISPLAY_THRESHOLD
  const total = Math.round(result.total)
  const totalColor = total >= 80 ? '#16a34a' : total >= 50 ? '#d97706' : '#dc2626'

  // 前月比トレンド: 当月以外で最新のスナップショットと比較
  const nowMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const prev = [...snapshots].filter(s => s.month < nowMonth).pop()
  const diff = prev ? total - Math.round(prev.total) : null
  const trend = diff === null ? null : diff > 0 ? { mark: '▲', color: '#16a34a', text: `+${diff}` }
    : diff < 0 ? { mark: '▼', color: '#dc2626', text: `${diff}` }
    : { mark: '−', color: '#9ca3af', text: '±0' }

  const radarData = result.items.map(i => ({
    axis: RADAR_LABEL[i.key] ?? i.label,
    pct: Math.round((i.score / i.max) * 100),
  }))

  const historyData = snapshots.map(s => ({ month: s.month, total: Math.round(s.total) }))

  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      {/* ヘッダー: 総合スコア + トレンド */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#000' }}>信頼スコア内訳</h2>
        {accumulating ? (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9999, padding: '3px 12px' }}>
            実績蓄積中
          </span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: totalColor, lineHeight: 1 }}>
              {total}<span style={{ fontSize: 13, color: '#999', fontWeight: 400 }}> / 100</span>
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
            <Radar dataKey="pct" stroke="#0066cc" fill="#0066cc" fillOpacity={0.18} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* 内訳リスト */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {result.items.map(item => (
          <div key={item.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: '#555' }}>{item.label}</span>
                <BadgeChip badge={item.badge} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                {Math.round(item.score)} / {item.max}
              </span>
            </div>
            <ItemBar score={item.score} max={item.max} />
            {item.detail && (
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                面談時評価 {item.detail.interview}/15 ・ 行動シグナル {item.detail.behavioral}/15
              </div>
            )}
          </div>
        ))}
      </div>

      {/* データ充足度 */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#888' }}>データ充足度</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>{Math.round(result.data_sufficiency * 100)}%</span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: '#f0f0f0', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.round(result.data_sufficiency * 100)}%`, background: '#0066cc', borderRadius: 3 }} />
        </div>
        {accumulating && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px' }}>
            算出に必要なデータが不足しています。賃金台帳・面談記録・資格情報が蓄積されると総合スコアが表示されます。
          </div>
        )}
      </div>

      {/* 推移グラフ（折りたたみ） */}
      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => setShowHistory(v => !v)}
          style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: '#0066cc', cursor: 'pointer', fontWeight: 500 }}
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
                  <Line type="monotone" dataKey="total" stroke="#0066cc" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>
              月次スナップショットが2件以上蓄積されると推移グラフが表示されます。
            </div>
          )
        )}
      </div>
    </div>
  )
}
