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
  tasks: [],  // 製造業の定期タスクは段Bで拡充
  workQualRules: [
    {
      work: 'forklift_1t',
      label: 'フォークリフト運転（最大荷重1t以上）',
      requiredQualType: 'skill_training',   // 技能講習
      requiredLevel: 'forklift',
      legalBasis: '労働安全衛生法61条・同施行令20条',
      penalty: '労安衛法119条（6月以下の懲役 or 50万円以下の罰金）',
    },
    // 段Bで追加: 玉掛け / 床上クレーン / 研削といし / 粉じん / フルハーネス
  ],
}
