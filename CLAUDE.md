@AGENTS.md

# TrustLayer プロジェクトルール

## プロジェクト概要
特定技能外国人の雇用コンプライアンス管理SaaS。自社支援企業向け。
Next.js 16 + TypeScript + Supabase (Tokyo, 無料枠) + Vercel。
投資家デモに向けて開発中。品質基準はStripe/Linear水準のUI。

## 絶対ルール(違反禁止)
- CREATE/ALTER/DROP TABLE 等のDBスキーマ変更は、SQL案を提示して
  承認を得てから実行する
- DELETE/UPDATE は実行前に対象行をSELECTで提示し、承認を得る
- git push は毎回確認を取る(まとめてのpushも都度確認)
- .env / 認証情報 / トークンの操作は毎回確認を取る
- テストデータは明確なTEST名義・架空カード番号(ZZ/ZX/ZY等の
  プレースホルダ形式)で作成し、タスク完了時にSELECT提示→承認→
  クリーンアップする。実在従業員データはテストに使わない

## 既知の落とし穴(必ず対策)
- **RLSサイレント失敗**: Supabase RLSでポリシー欠如のUPDATE/DELETEは
  error: null + data: [] で無音失敗する。新テーブルには SELECT/INSERT/
  UPDATE ポリシーをセットで作成し、UPDATE後は更新行数(.select()で検証)
  が期待値であることをテストで確認する
- worker_contracts には anon の DELETE ポリシーがない(直接DELETEは
  0行になる)。削除は親 foreign_workers のFK CASCADEに任せる
- residence_statuses の FK は CASCADE なし。親(foreign_workers)削除前に
  子(residence_statuses)を先に削除する必要あり(409エラー)。
  worker_contracts とは挙動が異なる
- Reactサブコンポーネントは必ずモジュールスコープで定義(関数内定義は
  入力フォーカス喪失バグを起こす)
- moj.go.jp は非日本IPをブロックするため、公式様式のダウンロードは
  WBに依頼する(curlやPlaywrightでは取得不可)
- 数値表示は必ず丸め処理(整数)を通す

## ドメイン知識
- 3-1-2号(契約終了届出)・3-6号(定期届出)は特定技能専属。他の在留
  資格には案内しない
- 定期届出は2026年4月から年1回(4/1〜5/31提出)に制度変更済み
- 在留資格の判定は residence_statuses の is_active=true の行を使う
  (1人複数行の履歴保持設計)
- 従業員の削除は物理削除せず status='retired' の退職処理
- 面談は3ヶ月に1回以上、支援担当者は中立立場。オンライン面談は
  本人同意+録画を契約終了後1年以上保管

## 作業スタイル
- 実装前に現状調査を行い、方針(特にDB変更の有無)を報告してから着手
- 不確実な点は独自判断で進めず、選択肢を提示して確認する。ただし
  スタイル・命名等の軽微な判断は一般的なSaaS慣例に従い自走してよい
- 検証はPlaywrightで行い、tsc --noEmit を通す
- コミットは日本語の簡潔なメッセージ
