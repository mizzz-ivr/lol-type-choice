import { AXIS_LABELS } from "@/config/axisDisplay";
import { questions } from "@/data/questions";
import { parseResultQuery, type SearchParamValue } from "@/lib/resultQuery";
import { buildDiagnosisResult } from "@/lib/scoring";
import { AXIS_KEYS, type AxisKey, type Role } from "@/lib/types";

export interface ResultCardAxis {
  axis: AxisKey;
  label: string;
  score: number;
}

export interface ResultCardData {
  encoded: string;
  typeId: string;
  typeName: string;
  oneLiner: string;
  topAxes: ResultCardAxis[];
  recommendedRoles: Role[];
}

export type ResultCardParseResult =
  | { ok: true; data: ResultCardData }
  | { ok: false; reason: string };

export const buildResultCardPath = (encoded: string): string | null => {
  const parsed = parseResultQuery(encoded);
  if (!parsed.ok) {
    return null;
  }

  return `/api/result-card?r=${encodeURIComponent(parsed.encoded)}`;
};

export const buildResultCardData = (raw: SearchParamValue): ResultCardParseResult => {
  const parsed = parseResultQuery(raw);
  if (!parsed.ok) {
    return parsed;
  }

  try {
    const result = buildDiagnosisResult(questions, parsed.answerMap);
    const topAxes = [...AXIS_KEYS]
      .map((axis) => ({
        axis,
        label: AXIS_LABELS[axis],
        score: result.axisScore[axis]
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return {
      ok: true,
      data: {
        encoded: parsed.encoded,
        typeId: result.type.id,
        typeName: result.type.name,
        oneLiner: result.type.oneLiner,
        topAxes,
        recommendedRoles: result.recommendedRoles
      }
    };
  } catch {
    return { ok: false, reason: "診断結果カードの生成データを作成できませんでした。" };
  }
};

export const buildResultCardDataFromSearchParams = (searchParams: URLSearchParams): ResultCardParseResult => {
  const keys = [...searchParams.keys()];
  const encodedValues = searchParams.getAll("r");

  if (keys.some((key) => key !== "r") || encodedValues.length !== 1) {
    return { ok: false, reason: "結果カードURLのクエリ形式が不正です。" };
  }

  return buildResultCardData(encodedValues[0]);
};
