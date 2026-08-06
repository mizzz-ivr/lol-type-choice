#!/usr/bin/env bash
set -Eeuo pipefail

comparison_lib="lib/comparison.ts"
comparison_page="app/compare/page.tsx"
comparison_actions="components/ComparisonActions.tsx"
comparison_continuation="components/ComparisonContinuation.tsx"
diagnosis_page="app/diagnosis/page.tsx"
result_page="app/result/page.tsx"
result_actions="components/ResultActions.tsx"
robots_file="app/robots.ts"
smoke_file="scripts/smoke-test.mjs"
test_file="tests/comparison.test.ts"
docs_file="docs/friend-comparison.md"

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

require_text() {
  local file=$1
  local text=$2
  grep -Fq -- "${text}" "${file}" || fail "${file} に必須設定がありません: ${text}"
}

require_absent_pattern() {
  local file=$1
  local pattern=$2
  if grep -Eq -- "${pattern}" "${file}"; then
    fail "${file} に禁止パターンが含まれています: ${pattern}"
  fi
}

for file in \
  "${comparison_lib}" \
  "${comparison_page}" \
  "${comparison_actions}" \
  "${comparison_continuation}" \
  "${diagnosis_page}" \
  "${result_page}" \
  "${result_actions}" \
  "${robots_file}" \
  "${smoke_file}" \
  "${test_file}" \
  "${docs_file}"; do
  [[ -f "${file}" ]] || fail "必須ファイルがありません: ${file}"
done

require_text "${comparison_lib}" 'buildDiagnosisResult(questions, parsed.answerMap)'
require_text "${comparison_lib}" 'Math.round(100 - averageDifference)'
require_text "${comparison_lib}" 'if (score >= 85) return "かなり近い"'
require_text "${comparison_lib}" 'if (score >= 70) return "近い"'
require_text "${comparison_lib}" 'if (score >= 50) return "一部近い"'
require_text "${comparison_lib}" 'keys.length === 1 && keys[0] === "base"'
require_text "${comparison_lib}" 'keys.length === 2 && keys[0] === "a" && keys[1] === "b"'
require_text "${comparison_lib}" 'values.length !== 1'
require_text "${comparison_lib}" 'keys.length !== 2'
require_text "${comparison_page}" 'index: false'
require_text "${comparison_page}" 'follow: false'
require_text "${comparison_page}" 'プレイ傾向の近さ'
require_text "${comparison_page}" 'この値はデュオの相性、勝率、実力、関係性を示すものではありません。'
require_text "${comparison_page}" '診断して比較する'
require_text "${comparison_actions}" 'navigator.share'
require_text "${comparison_actions}" 'navigator.clipboard?.writeText'
require_text "${comparison_actions}" 'comparison_shared'
require_text "${comparison_continuation}" '友だちとの比較結果を見る'
require_text "${diagnosis_page}" 'parseDiagnosisComparisonSearch(window.location.search)'
require_text "${diagnosis_page}" 'buildComparisonContinuationResultPath(encoded, comparisonBase)'
require_text "${result_page}" 'parseResultComparisonContinuation(params, parsed.encoded)'
require_text "${result_page}" '<ComparisonContinuation'
require_text "${result_actions}" '友だちと比較'
require_text "${robots_file}" 'disallow: ["/result", "/history", "/compare"]'
require_text "${smoke_file}" '友だち比較招待ページ'
require_text "${smoke_file}" '友だち比較結果ページ'
require_text "${test_file}" '同一の8軸は100、全軸0対100は0になる'
require_text "${test_file}" '不足・複数値・追加クエリ・不正トークンを拒否する'
require_text "${docs_file}" 'プレイ傾向の近さ = 100 - 8軸の絶対差平均'

for file in "${comparison_lib}" "${comparison_page}" "${comparison_actions}"; do
  require_absent_pattern "${file}" 'document\.cookie'
  require_absent_pattern "${file}" 'localStorage'
  require_absent_pattern "${file}" 'sessionStorage'
  require_absent_pattern "${file}" 'process\.env'
done

for file in "${comparison_lib}" "${comparison_page}"; do
  require_absent_pattern "${file}" 'fetch[[:space:]]*\('
  require_absent_pattern "${file}" 'XMLHttpRequest'
  require_absent_pattern "${file}" 'sendBeacon'
  require_absent_pattern "${file}" 'https?://'
done

require_absent_pattern "${comparison_page}" '相性スコア'
require_absent_pattern "${comparison_page}" '勝率予測'
require_absent_pattern "${comparison_page}" 'Riot API'
require_absent_pattern "${comparison_actions}" 'trackEvent\([^\n]*(shareUrl|shareText)'

echo "友だち比較機能の静的安全性検証に成功しました。"
