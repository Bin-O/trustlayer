/**
 * 業界パッケージ: 工業製品製造業
 *
 * 資格マッチング型の罠を表現する:
 *   - 作業別の必要資格（フォークリフト1t以上=技能講習 等）
 *   - 未修了従事 → 労安衛法119条の罰則リスク
 */
import type { IndustryPackage } from '../types'

export const manufacturingPackage: IndustryPackage = {
  code: 'manufacturing',
  label: '工業製品製造業',
  labelShort: '製造',
  jobCategories: ['工業製品製造業務', '機械金属加工業務', '電気電子機器組立て業務', '金属表面処理業務'],
  tasks: [],  // 製造業の定期タスクは段Bで拡充
  // 作業資格ルール（旧 workQualRules）はセッションAで義務マスタ obligations テーブルへ移行済み。
  //   正本: create_obligations_master.sql（code MFG_FORKLIFT_GE1T）／読込: lib/obligationMaster.ts
  //   未投入: 玉掛け / 床上クレーン / 研削といし / 粉じん / フルハーネス
  // 叙事層(支援・義務フロー)の業界層
  obligations: [
    { key: 'council', stage: 'pre_hire', text: '◆ 分野別協議会への加入(組織・受入要件)', implemented: false,
      legalBasis: '特定技能基準省令(受入要件)' },
    { key: 'qual_gap', stage: 'employed', text: '◇ 作業資格ギャップ判定(フォークリフト等)', implemented: true,
      legalBasis: '安衛法61条・59条3項(未修了従事は119条の罰則リスク)' },
  ],
}
