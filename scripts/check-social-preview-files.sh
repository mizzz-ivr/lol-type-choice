#!/usr/bin/env bash
set -Eeuo pipefail

config_file="config/socialPreview.ts"
component_file="components/SocialPreviewImage.tsx"
open_graph_file="app/opengraph-image.tsx"
twitter_file="app/twitter-image.tsx"
layout_file="app/layout.tsx"
smoke_file="scripts/smoke-test.mjs"
test_file="tests/socialPreview.test.ts"

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

require_text() {
  local file=$1
  local text=$2
  grep -Fq -- "${text}" "${file}" \
    || fail "${file} に必須設定がありません: ${text}"
}

require_absent_pattern() {
  local file=$1
  local pattern=$2
  if grep -Eq -- "${pattern}" "${file}"; then
    fail "${file} に禁止パターンが含まれています: ${pattern}"
  fi
}

for file in \
  "${config_file}" \
  "${component_file}" \
  "${open_graph_file}" \
  "${twitter_file}" \
  "${layout_file}" \
  "${smoke_file}" \
  "${test_file}"; do
  [[ -f "${file}" ]] || fail "必須ファイルがありません: ${file}"
done

require_text "${config_file}" 'width: 1200'
require_text "${config_file}" 'height: 630'
require_text "${config_file}" 'SOCIAL_PREVIEW_CONTENT_TYPE = "image/png"'
require_text "${config_file}" '48問'
require_text "${config_file}" '8軸分析'
require_text "${config_file}" '非公式'
require_text "${open_graph_file}" 'new ImageResponse(<SocialPreviewImage />, SOCIAL_PREVIEW_SIZE)'
require_text "${twitter_file}" 'new ImageResponse(<SocialPreviewImage />, SOCIAL_PREVIEW_SIZE)'
require_text "${layout_file}" 'card: "summary_large_image"'
require_text "${smoke_file}" '["og:image", null]'
require_text "${smoke_file}" '["twitter:image", null]'
require_text "${smoke_file}" 'SOCIAL_IMAGE_WIDTH = 1200'
require_text "${smoke_file}" 'SOCIAL_IMAGE_HEIGHT = 630'

for file in "${component_file}" "${open_graph_file}" "${twitter_file}"; do
  require_absent_pattern "${file}" 'https?://'
  require_absent_pattern "${file}" 'fetch[[:space:]]*\('
  require_absent_pattern "${file}" '<img'
  require_absent_pattern "${file}" 'next/image'
done

require_absent_pattern "${component_file}" 'riotgames\.com'
require_absent_pattern "${component_file}" 'ddragon'
require_absent_pattern "${component_file}" 'champion.*\.(png|jpg|jpeg|webp)'

echo "SNS共有画像の静的安全性検証に成功しました。"
