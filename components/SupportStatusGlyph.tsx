/**
 * 支援業務ステータスの記号(マトリクスのセルと従業員詳細のピルで共用)。
 * 未実施は○ではなく破線の空きボックス(○は日常認知で「完了・正解」を意味し誤読されるため)。
 * 未実施=空き枠(これから埋める場所)/該当なし=背景なしのより薄い—(対象外)と描き分ける。
 */
import { Check, AlertTriangle, Minus } from 'lucide-react'
import { STATUS_STYLE, type ServiceStatus } from '@/lib/supportServices'

type Props = {
  status: ServiceStatus
  /** cell=マトリクスの正方セル(背景枠込み) / inline=ピル等の文中用(記号のみ) */
  variant?: 'cell' | 'inline'
  /** cell: 外枠の一辺 / inline: 記号の一辺 */
  size?: number
}

/** 破線の空きボックス(未実施)。inline では単体で、cell では背景枠の中に置く */
function EmptySlot({ size }: { size: number }) {
  return (
    <span aria-hidden style={{
      display: 'inline-block', width: size, height: size, flexShrink: 0,
      border: `1.5px dashed ${STATUS_STYLE.not_yet.color}`, borderRadius: Math.max(3, Math.round(size / 4)),
    }} />
  )
}

export default function SupportStatusGlyph({ status, variant = 'cell', size }: Props) {
  const st = STATUS_STYLE[status]

  if (variant === 'inline') {
    const s = size ?? 12
    if (status === 'not_yet') return <EmptySlot size={s - 2} />
    const Icon = status === 'done' ? Check : status === 'due' ? AlertTriangle : Minus
    return <Icon size={s} strokeWidth={2.4} style={{ flexShrink: 0 }} />
  }

  const box = size ?? 26
  const inner = Math.round(box * 0.54)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: box, height: box, borderRadius: 6, background: st.bg, color: st.color,
    }}>
      {status === 'not_yet' ? <EmptySlot size={inner} /> : (() => {
        const Icon = status === 'done' ? Check : status === 'due' ? AlertTriangle : Minus
        return <Icon size={inner} strokeWidth={2.4} />
      })()}
    </span>
  )
}
