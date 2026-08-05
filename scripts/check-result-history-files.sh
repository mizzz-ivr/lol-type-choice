#!/usr/bin/env bash
set -Eeuo pipefail

history_lib="lib/resultHistory.ts"
diagnosis_page="app/diagnosis/page.tsx"
result_panel="components/ResultHistoryPanel.tsx"
history_component="components/DiagnosisHistory.tsx"
history_page="app/history/page.tsx"
result_page="app/result/page.tsx"
robots_file="app/robots.ts"
smoke_file="scripts/smoke-test.mjs"
test_file="tests/resultHistory.test.ts"

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
  "${history_lib}" \
  "${diagnosis_page}" \
  "${result_panel}" \
  "${history_component}" \
  "${history_page}" \
  "${result_page}" \
  "${robots_file}" \
  "${smoke_file}" \
  "${test_file}"; do
  [[ -f "${file}" ]] || fail "必須ファイルがありません: ${file}"
done

require_text "${history_lib}" 'RESULT_HISTORY_STORAGE_KEY = "lol-type-choice.result-history.v1"'
require_text "${history_lib}" 'RESULT_HISTORY_PENDING_KEY = "lol-type-choice.result-history-pending.v1"'
require_text "${history_lib}" 'RESULT_HISTORY_SCHEMA_VERSION = 1'
require_text "${history_lib}" 'RESULT_HISTORY_LIMIT = 10'
require_text "${history_lib}" 'decodeAnswers(encoded)'
require_text "${history_lib}" 'pendingEncoded === encoded && decodeAnswers(encoded) !== null'
require_text "${history_lib}" 'url.pathname !== "/result"'
require_text "${history_lib}" 'score >= 0 && score <= 100'
require_text "${history_lib}" 'validCurrent[0]?.resultPath === record.resultPath'
require_text "${diagnosis_page}" 'window.sessionStorage.setItem(RESULT_HISTORY_PENDING_KEY, encoded)'
require_text "${result_panel}" 'window.sessionStorage.getItem(RESULT_HISTORY_PENDING_KEY)'
require_text "${result_panel}" 'shouldSavePendingResult'
require_text "${result_panel}" 'window.localStorage.setItem'
require_text "${result_panel}" 'compareAxisScores'
require_text "${history_component}" 'window.localStorage.removeItem'
require_text "${history_component}" 'この履歴を削除'
require_text "${history_page}" 'index: false'
require_text "${result_page}" '<ResultHistoryPanel'
require_text "${robots_file}" 'disallow: ["/result", "/history"]'
require_text "${smoke_file}" 'path: "/history"'
require_text "${test_file}" '診断完了マーカーと有効な結果トークンが一致する場合だけ保存対象にする'
require_text "${test_file}" '同じ結果URLの連続保存を抑止する'
require_text "${test_file}" '11件目追加時は最古の履歴を削除する'

for file in "${history_lib}" "${result_panel}" "${history_component}"; do
  require_absent_pattern "${file}" 'fetch[[:space:]]*\('
  require_absent_pattern "${file}" 'XMLHttpRequest'
  require_absent_pattern "${file}" 'sendBeacon'
  require_absent_pattern "${file}" 'document\.cookie'
  require_absent_pattern "${file}" 'process\.env'
done

for file in "${result_panel}" "${history_component}"; do
  require_absent_pattern "${file}" 'https?://'
done

echo "診断履歴機能の静的安全性検証に成功しました。"
