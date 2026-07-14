/**
 * 業界パッケージ: 自動車運送業
 *
 * 時限型の罠を表現する:
 *   - 初任運転者講習 / 初任診断（one_time・乗務開始前）
 *   - 特定活動55号の在留期限カウントダウン（countdown・更新不可）
 */
import type { IndustryPackage } from '../types'

/** 特定活動55号の細分値（residence_statuses.status_subtype に格納する正規値） */
export const SUBTYPE_TOKUTEI_KATSUDO_55 = '特定活動55号'

export const transportPackage: IndustryPackage = {
  code: 'transport',
  label: '自動車運送業',
  tasks: [
    {
      key: 'transport_shonin_kyoshu',
      label: '初任運転者講習（座学＋実車35時間以上）',
      cadence: 'one_time',
      // 乗務開始前が原則。やむを得ない場合1ヶ月以内 → +30日をシステム最終期限とする
      dueRule: { from: 'contract_start', offsetDays: 30 },
      alertDays: [14, 30],
      guide: {
        what: '乗務開始前に受講が必要な初任運転者講習。座学＋実車で35時間以上。',
        how: '受講機関を予約し、修了証を証拠として保管。やむを得ない場合も乗務開始後1ヶ月以内。',
        legalBasis: '貨物自動車運送事業輸送安全規則 等',
      },
    },
    {
      key: 'transport_shonin_shindan',
      label: '初任診断（適性診断・3年有効）',
      cadence: 'one_time',
      dueRule: { from: 'contract_start', offsetDays: 30 },
      alertDays: [14, 30],
      validMonths: 36,  // 段Bで有効期限判定に使用
      guide: {
        what: '乗務開始前の初任運転者に対する適性診断。3年間有効。',
        how: '認定機関で受診し結果を保管。乗務開始後1ヶ月以内まで猶予。',
      },
    },
    {
      // countdown = support_tasks 行を作らず、residence_expiry から残日数を表示するのみ
      key: 'transport_55_countdown',
      label: '特定活動55号 在留期限（更新不可）',
      cadence: 'countdown',
      dueRule: { from: 'residence_expiry' },
      alertDays: [30, 60, 90],
      guide: {
        what: '特定活動55号は更新不可の時限資格（トラック6ヶ月／バス・タクシー1年）。',
        how: '期限内に運転免許を取得し、特定技能1号への在留資格変更申請を行う。',
      },
    },
  ],
  workQualRules: [],  // 運送業の作業資格は段Bで拡充
}
