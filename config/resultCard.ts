import { SOCIAL_PREVIEW_COLORS, SOCIAL_PREVIEW_SIZE } from "@/config/socialPreview";

export const RESULT_CARD_SIZE = SOCIAL_PREVIEW_SIZE;
export const RESULT_CARD_CONTENT_TYPE = "image/png";
export const RESULT_CARD_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
export const RESULT_CARD_COLORS = SOCIAL_PREVIEW_COLORS;

export const buildResultCardAlt = (typeName: string): string =>
  `LoL Playstyle Type Finder βの診断結果「${typeName}」。上位3軸とおすすめロールを表示した非公式ファン診断カード。`;

export const buildResultCardFilename = (typeId: string): string => {
  const safeTypeId = typeId.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48);
  return `lol-playstyle-${safeTypeId || "result"}.png`;
};
