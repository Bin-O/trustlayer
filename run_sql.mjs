/**
 * Supabase Management API 経由でSQLを直接実行するスクリプト
 * 使い方: node run_sql.mjs [sqlファイル]
 *   PAT は .env.local の SUPABASE_PAT から読み込む
 *   （旧形式 node run_sql.mjs <PAT> [sqlファイル] も引き続き使用可）
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// .env.local から SUPABASE_PAT を読み込む
let envPat = null
try {
  const env = Object.fromEntries(
    readFileSync(join(__dirname, '.env.local'), 'utf8')
      .split('\n').filter(l => l.includes('='))
      .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  )
  envPat = env.SUPABASE_PAT || null
} catch {}

// 引数が .sql ならファイル指定、それ以外は旧形式の PAT 指定とみなす
const args    = process.argv.slice(2)
const argPat  = args.find(a => !a.endsWith('.sql'))
const SQL_ARG = args.find(a => a.endsWith('.sql'))
const PAT     = argPat || envPat
if (!PAT) {
  console.error('使い方: node run_sql.mjs [sqlファイル]')
  console.error('.env.local に SUPABASE_PAT を設定するか、引数でトークンを渡してください')
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
    // SELECT 文は結果の行を表示する
    if (/^select/i.test(stmt.replace(/^\s*(--.*\n)*/g, '').trim())) {
      try {
        const rows = await res.json()
        if (Array.isArray(rows) && rows.length > 0) console.table(rows)
        else console.log('  (0行)')
      } catch {}
    }
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
