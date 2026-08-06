#!/usr/bin/env bash
set -Eeuo pipefail

config_file="config/resultCard.ts"
data_file="lib/resultCard.ts"
image_file="components/ResultCardImage.tsx"
route_file="app/api/result-card/route.ts"
actions_file="components/ResultActions.tsx"
result_page="app/result/page.tsx"
smoke_file="scripts/smoke-test.mjs"
test_file="tests/resultCard.test.ts"

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
  if grep -Eiq -- "${pattern}" "${file}"; then
    fail "${file} に禁止パターンが含まれています: ${pattern}"
  fi
}

for file in \
  "${config_file}" \
  "${data_file}" \
  "${image_file}" \
  "${route_file}" \
  "${actions_file}" \
  "${result_page}" \
  "${smoke_file}" \
  "${test_file}"; do
  [[ -f "${file}" ]] || fail "必須ファイルがありません: ${file}"
done

require_text "${config_file}" 'RESULT_CARD_CONTENT_TYPE = "image/png"'
require_text "${config_file}" 'max-age=3600'
require_text "${config_file}" 'buildResultCardFilename'
require_text "${data_file}" 'buildResultCardDataFromSearchParams'
require_text "${data_file}" 'encodedValues.length !== 1'
require_text "${data_file}" 'keys.some((key) => key !== "r")'
require_text "${data_file}" '.slice(0, 3)'
require_text "${route_file}" 'new ImageResponse'
require_text "${route_file}" 'dynamic = "force-dynamic"'
require_text "${route_file}" 'runtime = "nodejs"'
require_text "${route_file}" '"Content-Disposition"'
require_text "${route_file}" '"Cache-Control": "no-store"'
require_text "${actions_file}" '画像を保存'
require_text "${actions_file}" 'URLをコピー'
require_text "${actions_file}" 'navigator.share'
require_text "${actions_file}" 'navigator.canShare'
require_text "${actions_file}" 'result_card_downloaded'
require_text "${result_page}" 'card: "summary_large_image"'
require_text "${result_page}" 'buildSiteUrl("/api/result-card"'
require_text "${result_page}" 'buildResultCardAlt'
require_text "${smoke_file}" '診断結果カード'
require_text "${test_file}" 'r欠落・複数r・追加クエリを拒否する'

for file in "${image_file}" "${route_file}"; do
  require_absent_pattern "${file}" 'https?://'
  require_absent_pattern "${file}" 'fetch[[:space:]]*\('
  require_absent_pattern "${file}" '<img'
  require_absent_pattern "${file}" 'next/image'
done

for file in "${image_file}" "${route_file}" "${data_file}"; do
  require_absent_pattern "${file}" 'riotgames\.com'
  require_absent_pattern "${file}" 'ddragon'
  require_absent_pattern "${file}" 'champion.*\.(png|jpg|jpeg|webp)'
done

require_absent_pattern "${route_file}" 'Access-Control-Allow-Origin'
require_absent_pattern "${route_file}" 'cookies[[:space:]]*\('
require_absent_pattern "${route_file}" 'headers[[:space:]]*\('

echo "診断結果カード機能の静的安全性検証に成功しました。"
