/**
 * Supabase Management API 経由でSQLを直接実行するスクリプト
 * 使い方: node run_sql.mjs <personal-access-token>
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PAT      = process.argv[2]
const SQL_ARG  = process.argv[3]
if (!PAT) {
  console.error('使い方: node run_sql.mjs <Supabase_Personal_Access_Token> [sqlファイル]')
  console.error('トークン取得: https://supabase.com/dashboard/account/tokens')
  process.exit(1)
}

const PROJECT_REF = 'oarcilwovvemiwwmhvrl'
const SQL_FILE   = SQL_ARG ? join(__dirname, SQL_ARG) : join(__dirname, 'supabase_documents_setup.sql')
const sql        = readFileSync(SQL_FILE, 'utf8')

// セミコロンで分割し、コメント行を除去してから空文チェック
const statements = sql
  .split(';')
  .map(s => {
    // コメント行を除いた実質的なSQL部分を取得
    const withoutComments = s
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .trim()
    return { original: s.trim(), sql: withoutComments }
  })
  .filter(({ sql }) => sql.length > 0)
  .map(({ original }) => original)

console.log(`実行するSQL文: ${statements.length}件`)

let successCount = 0
let errorCount = 0

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i]
  const preview = stmt.replace(/\s+/g, ' ').slice(0, 60)
  process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `)

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: stmt }),
  })

  if (res.ok) {
    console.log('✓')
    successCount++
  } else {
    const body = await res.text()
    // 既存ポリシー・テーブルの重複エラーは無視
    if (body.includes('already exists') || body.includes('duplicate')) {
      console.log('(既存のためスキップ)')
      successCount++
    } else {
      console.log(`✗ HTTP ${res.status}`)
      console.error('  エラー:', body.slice(0, 200))
      errorCount++
    }
  }
}

console.log(`\n完了: 成功 ${successCount} / エラー ${errorCount}`)
if (errorCount === 0) {
  console.log('全ステートメント実行成功')
} else {
  console.log('一部エラーがあります。上記のエラーメッセージを確認してください。')
}
