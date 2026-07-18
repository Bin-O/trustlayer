/**
 * 叙事層(支援・義務フロー)の共通義務定義 — 全業界共通の時系列義務。
 *
 * 表示専用であり、データ格子(10支援業務の判定・実施率)には一切関与しない。
 * ◆=全員一律 / ◇=条件触発 を文頭に含む表示文言で持つ(周期・トリガー注記込み)。
 * 法的根拠付きの完全リストは docs/product-direction.md の Phase B メモを正本とする。
 * 業界特有の義務は各業界パッケージの obligations 側に持ち、在籍従業員の業界から
 * 純導出で表示する(2026-07-18 裁定)。
 */
import type { LifecycleStage } from '@/lib/supportServices'

export type ObligationLine = {
  key: string
  stage: LifecycleStage
  /** ◆/◇ を文頭に含む表示文言 */
  text: string
  /** false = 灰色破線「— 対応予定」表示(Phase B) */
  implemented: boolean
  /** hover で示す法的根拠等 */
  legalBasis?: string
}

/** 叙事層の段名下に添える期間注記 */
export const STAGE_PERIOD_NOTE: Record<LifecycleStage, string> = {
  pre_hire: '雇用契約後〜入国前',
  onboarding: '入国〜就労開始',
  employed: '就労開始〜契約終了',
  offboarding: '契約終了・離職',
}

export const COMMON_OBLIGATIONS: ObligationLine[] = [
  { key: 'contract_docs',   stage: 'pre_hire', text: '◆ 雇用契約・条件書の交付', implemented: true,
    legalBasis: '労基法15条・特定技能基準省令' },
  { key: 'support_plan',    stage: 'pre_hire', text: '◆ 支援計画書の作成', implemented: true,
    legalBasis: '入管法2条の5・19条の22' },
  { key: 'pre_guidance',    stage: 'pre_hire', text: '◆ ① 事前ガイダンス', implemented: true,
    legalBasis: '入管法(支援業務①)' },

  { key: 'arrival_support', stage: 'onboarding', text: '◇ ② 空港送迎 ◆ ③ 住居確保', implemented: true,
    legalBasis: '入管法(支援②③)。送迎は海外からの入国者が対象' },
  { key: 'orientation',     stage: 'onboarding', text: '◆ ④ 生活オリエンテーション', implemented: true,
    legalBasis: '入管法(支援④)。入国後遅滞なく・8時間以上目安' },
  { key: 'hire_checkup',    stage: 'onboarding', text: '◆ 雇入時健診(1回)', implemented: false,
    legalBasis: '安衛則43条。入社前3ヶ月以内の健診書提出で省略可' },
  { key: 'hire_safety_edu', stage: 'onboarding', text: '◆ 安全衛生教育(1回)', implemented: false,
    legalBasis: '安衛法59条1項・安衛則35条。作業内容変更時も' },
  { key: 'hire_notify',     stage: 'onboarding', text: '◆ 雇用状況届出・社保手続', implemented: false,
    legalBasis: '労働施策総合推進法28条・健保法48条・厚年法27条・雇保法7条' },

  { key: 'interview',        stage: 'employed', text: '◆ ⑩ 定期面談(3ヶ月毎)', implemented: true,
    legalBasis: '入管法(支援⑩)。本人+監督者・3ヶ月に1回以上' },
  { key: 'periodic_notify',  stage: 'employed', text: '◆ 定期届出(年1)・在留更新', implemented: true,
    legalBasis: '入管法19条の18(4/1〜5/31提出)・21条(在留期限毎)' },
  { key: 'support_ongoing',  stage: 'employed', text: '◆⑥⑧ ◇⑤⑦ 支援 ◆ 賃金台帳(毎月)', implemented: true,
    legalBasis: '入管法(支援⑤〜⑧)・労基法108条' },
  { key: 'adhoc_notify',     stage: 'employed', text: '◇ 随時届出(3-1-1号・事由発生14日内)', implemented: true,
    legalBasis: '入管法19条の17・19条の18。契約変更(3-1-1号)・契約終了(3-1-2号)は実装済/支援計画変更・住居地変更等は未実装' },
  { key: 'skill_training',   stage: 'employed', text: '◇ 技能講習・特別教育(作業割当)', implemented: true,
    legalBasis: '安衛法61条(技能講習)・59条3項(特別教育)' },
  { key: 'periodic_checkup', stage: 'employed', text: '◆ 定期健診(年1回)', implemented: false,
    legalBasis: '安衛則44条' },
  { key: 'specific_checkup', stage: 'employed', text: '◇ 特定業務健診(深夜業等・6ヶ月毎)', implemented: false,
    legalBasis: '安衛則45条。うち1回は定期健診に代用可・配置替え時も' },
  { key: 'special_checkup',  stage: 'employed', text: '◇ 特殊健診(有害業務・6ヶ月毎)', implemented: false,
    legalBasis: '有機則29条・特化則39条・じん肺法7〜9条等(じん肺は1〜3年毎)' },
  { key: 'org_reports',      stage: 'employed', text: '◇ 労基署報告・ストレスチェック(事業場・50人以上)', implemented: false,
    legalBasis: '安衛則52条(定期健診の都度)・安衛法66条の10(年1回)。事業場単位の義務' },

  { key: 'job_change',   stage: 'offboarding', text: '◇ ⑨ 転職支援(非自発的離職)', implemented: true,
    legalBasis: '入管法(支援⑨)' },
  { key: 'end_notify',   stage: 'offboarding', text: '◆ 契約終了届出(3-1-2号・14日以内)', implemented: true,
    legalBasis: '入管法19条の17' },
  { key: 'leave_notify', stage: 'offboarding', text: '◆ 雇用状況届出(離職)・社保喪失届', implemented: false,
    legalBasis: '労働施策総合推進法28条・健保法・厚年法・雇保法' },
]
