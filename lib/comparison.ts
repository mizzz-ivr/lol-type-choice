import { questions } from "@/data/questions";
import { parseResultQuery, type SearchParamValue } from "@/lib/resultQuery";
import { buildDiagnosisResult } from "@/lib/scoring";
import { AXIS_KEYS, type AxisKey, type DiagnosisResult, type Role } from "@/lib/types";

export type ComparisonSearchParams = Record<string, string | string[] | undefined>;

export type ComparisonParticipant = {
  encoded: string;
  result: DiagnosisResult;
};

export type AxisComparison = {
  axis: AxisKey;
  first: number;
  second: number;
  difference: number;
};

export type DiagnosisComparison = {
  first: ComparisonParticipant;
  second: ComparisonParticipant;
  similarityScore: number;
  similarityLabel: "かなり近い" | "近い" | "一部近い" | "対照的";
  axes: AxisComparison[];
  closestAxes: AxisComparison[];
  differentAxes: AxisComparison[];
  sharedRoles: Role[];
};

export type ComparisonQueryResult =
  | {
      ok: true;
      mode: "invite";
      base: ComparisonParticipant;
    }
  | {
      ok: true;
      mode: "complete";
      comparison: DiagnosisComparison;
    }
  | {
      ok: false;
      reason: string;
    };

const validDefinedKeys = (params: ComparisonSearchParams): string[] =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort();

const parseParticipant = (raw: SearchParamValue): ComparisonParticipant | null => {
  if (typeof raw !== "string") {
    return null;
  }

  const parsed = parseResultQuery(raw);
  if (!parsed.ok) {
    return null;
  }

  try {
    return {
      encoded: parsed.encoded,
      result: buildDiagnosisResult(questions, parsed.answerMap)
    };
  } catch {
    return null;
  }
};

export const getSimilarityLabel = (score: number): DiagnosisComparison["similarityLabel"] => {
  if (score >= 85) return "かなり近い";
  if (score >= 70) return "近い";
  if (score >= 50) return "一部近い";
  return "対照的";
};

export const compareDiagnosisResults = (
  first: ComparisonParticipant,
  second: ComparisonParticipant
): DiagnosisComparison => {
  const axes = AXIS_KEYS.map((axis, index) => ({
    axis,
    first: first.result.axisScore[axis],
    second: second.result.axisScore[axis],
    difference: Math.abs(first.result.axisScore[axis] - second.result.axisScore[axis]),
    index
  }));
  const averageDifference = axes.reduce((sum, item) => sum + item.difference, 0) / AXIS_KEYS.length;
  const similarityScore = Math.max(0, Math.min(100, Math.round(100 - averageDifference)));
  const withoutIndex = ({ index: _index, ...axis }: (typeof axes)[number]): AxisComparison => axis;
  const closestAxes = [...axes]
    .sort((a, b) => a.difference - b.difference || a.index - b.index)
    .slice(0, 3)
    .map(withoutIndex);
  const differentAxes = [...axes]
    .sort((a, b) => b.difference - a.difference || a.index - b.index)
    .slice(0, 3)
    .map(withoutIndex);
  const sharedRoles = first.result.recommendedRoles.filter((role) =>
    second.result.recommendedRoles.includes(role)
  );

  return {
    first,
    second,
    similarityScore,
    similarityLabel: getSimilarityLabel(similarityScore),
    axes: axes.map(withoutIndex),
    closestAxes,
    differentAxes,
    sharedRoles
  };
};

export const parseComparisonQuery = (params: ComparisonSearchParams): ComparisonQueryResult => {
  const keys = validDefinedKeys(params);

  if (keys.length === 1 && keys[0] === "base") {
    const base = parseParticipant(params.base);
    if (!base) {
      return { ok: false, reason: "比較招待URLの診断データが不正です。" };
    }

    return { ok: true, mode: "invite", base };
  }

  if (keys.length === 2 && keys[0] === "a" && keys[1] === "b") {
    const first = parseParticipant(params.a);
    const second = parseParticipant(params.b);
    if (!first || !second) {
      return { ok: false, reason: "比較対象の診断データが不正です。" };
    }

    return {
      ok: true,
      mode: "complete",
      comparison: compareDiagnosisResults(first, second)
    };
  }

  return {
    ok: false,
    reason: "比較URLの形式が不正です。招待URLまたは2件の診断結果が必要です。"
  };
};

const buildPath = (pathname: string, params: Record<string, string>): string => {
  const search = new URLSearchParams(params);
  return `${pathname}?${search.toString()}`;
};

const validEncoded = (encoded: string): boolean => parseResultQuery(encoded).ok;

export const buildComparisonInvitePath = (encoded: string): string | null =>
  validEncoded(encoded) ? buildPath("/compare", { base: encoded }) : null;

export const buildComparisonResultPath = (firstEncoded: string, secondEncoded: string): string | null =>
  validEncoded(firstEncoded) && validEncoded(secondEncoded)
    ? buildPath("/compare", { a: firstEncoded, b: secondEncoded })
    : null;

export const buildComparisonDiagnosisPath = (baseEncoded: string): string | null =>
  validEncoded(baseEncoded) ? buildPath("/diagnosis", { compare: baseEncoded }) : null;

export const buildComparisonContinuationResultPath = (
  currentEncoded: string,
  baseEncoded: string
): string | null =>
  validEncoded(currentEncoded) && validEncoded(baseEncoded)
    ? buildPath("/result", { r: currentEncoded, compare: baseEncoded })
    : null;

export const parseDiagnosisComparisonSearch = (search: string): string | null => {
  try {
    const params = new URLSearchParams(search);
    const keys = [...new Set(params.keys())];
    const values = params.getAll("compare");

    if (keys.length !== 1 || keys[0] !== "compare" || values.length !== 1) {
      return null;
    }

    return validEncoded(values[0]) ? values[0] : null;
  } catch {
    return null;
  }
};

export const parseResultComparisonContinuation = (
  params: ComparisonSearchParams,
  currentEncoded: string
): string | null => {
  const keys = validDefinedKeys(params);
  if (
    keys.length !== 2 ||
    keys[0] !== "compare" ||
    keys[1] !== "r" ||
    typeof params.r !== "string" ||
    params.r !== currentEncoded ||
    typeof params.compare !== "string" ||
    !validEncoded(params.compare)
  ) {
    return null;
  }

  return params.compare;
};
