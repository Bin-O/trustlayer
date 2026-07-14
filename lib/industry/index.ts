/**
 * 業界パッケージ・レジストリ（柱4の入口）
 *
 * 業界コード → パッケージ定義データ。消費側（段2のエンジン・描画）は
 * このレジストリ経由でのみパッケージを解決し、業界名の分岐コードを書かない。
 */
import type { IndustryCode } from './codes'
import type { IndustryPackage } from './types'
import { transportPackage } from './packages/transport'
import { manufacturingPackage } from './packages/manufacturing'

const PACKAGES: Record<IndustryCode, IndustryPackage> = {
  transport: transportPackage,
  manufacturing: manufacturingPackage,
}

/** 業界コードからパッケージを解決する。未設定・未対応は null */
export function industryPackageOf(code: IndustryCode | null): IndustryPackage | null {
  return code ? PACKAGES[code] : null
}

export * from './codes'
export * from './types'
