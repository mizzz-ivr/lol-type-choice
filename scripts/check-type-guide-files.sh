#!/usr/bin/env bash
set -Eeuo pipefail

guide_data="data/resultGuides.ts"
guide_lib="lib/resultGuide.ts"
guide_component="components/ResultPlayGuide.tsx"
types_page="app/types/page.tsx"
type_detail_page="app/types/[typeId]/page.tsx"
result_page="app/result/page.tsx"
home_page="app/page.tsx"
sitemap_file="app/sitemap.ts"
test_file="tests/resultGuide.test.ts"

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
  "${guide_data}" \
  "${guide_lib}" \
  "${guide_component}" \
  "${types_page}" \
  "${type_detail_page}" \
  "${result_page}" \
  "${home_page}" \
  "${sitemap_file}" \
  "${test_file}"; do
  [[ -f "${file}" ]] || fail "必須ファイルがありません: ${file}"
done

require_text "${guide_data}" 'export const resultGuides: ResultGuide[]'
require_text "${guide_data}" 'stage: "まずは" | "次に" | "慣れたら"'
require_text "${guide_lib}" 'getResultGuideCoverage'
require_text "${guide_lib}" 'getAllResultTypeGuides'
require_text "${types_page}" '8つのプレイスタイルタイプ'
require_text "${type_detail_page}" 'generateStaticParams'
require_text "${type_detail_page}" 'notFound()'
require_text "${type_detail_page}" '3段階の練習メニュー'
require_text "${result_page}" '<ResultPlayGuide resultTypeId={result.type.id} />'
require_text "${home_page}" 'href="/types"'
require_text "${sitemap_file}" 'url: buildSiteUrl("/types")'
require_text "${sitemap_file}" 'buildSiteUrl(`/types/${resultType.id}`)'
require_text "${test_file}" '全結果タイプにガイドが1件ずつ存在する'

for file in "${guide_data}" "${guide_lib}" "${guide_component}" "${types_page}" "${type_detail_page}"; do
  require_absent_pattern "${file}" 'fetch[[:space:]]*\('
  require_absent_pattern "${file}" 'XMLHttpRequest'
  require_absent_pattern "${file}" 'sendBeacon'
  require_absent_pattern "${file}" 'document\.cookie'
  require_absent_pattern "${file}" 'process\.env'
done

for file in "${guide_data}" "${guide_component}" "${types_page}" "${type_detail_page}"; do
  require_absent_pattern "${file}" 'https?://'
  require_absent_pattern "${file}" 'Data Dragon|ddragon|Riot API'
done

if [[ $(grep -Ec '^    resultTypeId:' "${guide_data}") -ne 8 ]]; then
  fail "${guide_data} のガイド件数が8件ではありません。"
fi

echo "タイプ別プレイガイドの静的安全性検証に成功しました。"
