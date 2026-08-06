import { describe, expect, it } from "vitest";
import { questions } from "@/data/questions";
import {
  buildComparisonContinuationResultPath,
  buildComparisonDiagnosisPath,
  buildComparisonInvitePath,
  buildComparisonResultPath,
  compareDiagnosisResults,
  getSimilarityLabel,
  parseComparisonQuery,
  parseDiagnosisComparisonSearch,
  parseResultComparisonContinuation,
  type ComparisonParticipant
} from "@/lib/comparison";
import { encodeAnswers } from "@/lib/share";
import { AXIS_KEYS, type AxisScore, type Role } from "@/lib/types";

const encoded = (value: -2 | -1 | 0 | 1 | 2): string => {
  const result = encodeAnswers(Array.from({ length: questions.length }, () => value));
  if (!result) throw new Error("テスト用回答をエンコードできませんでした。");
  return result;
};

const axisScore = (value: number): AxisScore =>
  Object.fromEntries(AXIS_KEYS.map((axis) => [axis, value])) as AxisScore;

const participant = (score: AxisScore, roles: Role[] = ["MID", "SUP"]): ComparisonParticipant => ({
  encoded: encoded(0),
  result: {
    type: {
      id: "test-type",
      name: "テスト型",
      oneLiner: "テスト用の結果です",
      description: "比較テスト用",
      strengths: [],
      caution: "テスト",
      conditions: {}
    },
    axisScore: score,
    recommendedRoles: roles,
    recommendedChampions: []
  }
});

describe("友だち比較", () => {
  it("有効なbaseだけを比較招待として解析する", () => {
    const base = encoded(0);
    const parsed = parseComparisonQuery({ base });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.mode !== "invite") return;
    expect(parsed.base.encoded).toBe(base);
    expect(parsed.base.result.axisScore).toBeDefined();
  });

  it("有効なaとbだけを完成済み比較として解析する", () => {
    const first = encoded(-1);
    const second = encoded(1);
    const parsed = parseComparisonQuery({ a: first, b: second });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.mode !== "complete") return;
    expect(parsed.comparison.first.encoded).toBe(first);
    expect(parsed.comparison.second.encoded).toBe(second);
    expect(parsed.comparison.axes).toHaveLength(8);
  });

  it("不足・複数値・追加クエリ・不正トークンを拒否する", () => {
    const valid = encoded(0);

    expect(parseComparisonQuery({}).ok).toBe(false);
    expect(parseComparisonQuery({ base: [valid, valid] }).ok).toBe(false);
    expect(parseComparisonQuery({ base: valid, extra: "1" }).ok).toBe(false);
    expect(parseComparisonQuery({ a: valid }).ok).toBe(false);
    expect(parseComparisonQuery({ a: valid, b: [valid, valid] }).ok).toBe(false);
    expect(parseComparisonQuery({ a: valid, b: valid, extra: "1" }).ok).toBe(false);
    expect(parseComparisonQuery({ base: "v2_invalid_00" }).ok).toBe(false);
  });

  it("同一の8軸は100、全軸0対100は0になる", () => {
    const same = compareDiagnosisResults(participant(axisScore(50)), participant(axisScore(50)));
    const opposite = compareDiagnosisResults(participant(axisScore(0)), participant(axisScore(100)));

    expect(same.similarityScore).toBe(100);
    expect(same.similarityLabel).toBe("かなり近い");
    expect(opposite.similarityScore).toBe(0);
    expect(opposite.similarityLabel).toBe("対照的");
  });

  it("8軸の絶対差平均を四捨五入して0〜100へ収める", () => {
    const first = axisScore(50);
    const second = axisScore(50);
    second.initiative = 61;
    second.riskTolerance = 60;

    const comparison = compareDiagnosisResults(participant(first), participant(second));

    expect(comparison.similarityScore).toBe(97);
  });

  it("近さラベルの境界値を判定する", () => {
    expect(getSimilarityLabel(100)).toBe("かなり近い");
    expect(getSimilarityLabel(85)).toBe("かなり近い");
    expect(getSimilarityLabel(84)).toBe("近い");
    expect(getSimilarityLabel(70)).toBe("近い");
    expect(getSimilarityLabel(69)).toBe("一部近い");
    expect(getSimilarityLabel(50)).toBe("一部近い");
    expect(getSimilarityLabel(49)).toBe("対照的");
    expect(getSimilarityLabel(0)).toBe("対照的");
  });

  it("近い軸・差が大きい軸を差分順で安定して並べる", () => {
    const first = axisScore(50);
    const second: AxisScore = {
      initiative: 50,
      riskTolerance: 51,
      decisionStyle: 52,
      winCondition: 90,
      combatRange: 80,
      processing: 70,
      tempo: 50,
      responsibility: 50
    };

    const comparison = compareDiagnosisResults(participant(first), participant(second));

    expect(comparison.closestAxes.map((item) => item.axis)).toEqual([
      "initiative",
      "tempo",
      "responsibility"
    ]);
    expect(comparison.differentAxes.map((item) => item.axis)).toEqual([
      "winCondition",
      "combatRange",
      "processing"
    ]);
  });

  it("おすすめロールの共通部分だけを返す", () => {
    const comparison = compareDiagnosisResults(
      participant(axisScore(50), ["MID", "SUP"]),
      participant(axisScore(60), ["JG", "SUP"])
    );

    expect(comparison.sharedRoles).toEqual(["SUP"]);
  });

  it("比較フローの相対URLを有効なトークンだけで生成する", () => {
    const first = encoded(-1);
    const second = encoded(1);

    expect(buildComparisonInvitePath(first)).toBe(`/compare?base=${first}`);
    expect(buildComparisonDiagnosisPath(first)).toBe(`/diagnosis?compare=${first}`);
    expect(buildComparisonResultPath(first, second)).toBe(`/compare?a=${first}&b=${second}`);
    expect(buildComparisonContinuationResultPath(second, first)).toBe(
      `/result?r=${second}&compare=${first}`
    );
    expect(buildComparisonInvitePath("invalid")).toBeNull();
    expect(buildComparisonResultPath(first, "invalid")).toBeNull();
  });

  it("診断ページではcompareが1件だけのURLを受け付ける", () => {
    const base = encoded(0);

    expect(parseDiagnosisComparisonSearch(`?compare=${base}`)).toBe(base);
    expect(parseDiagnosisComparisonSearch(`?compare=${base}&compare=${base}`)).toBeNull();
    expect(parseDiagnosisComparisonSearch(`?compare=${base}&extra=1`)).toBeNull();
    expect(parseDiagnosisComparisonSearch("?compare=invalid")).toBeNull();
    expect(parseDiagnosisComparisonSearch("")).toBeNull();
  });

  it("結果ページではrとcompareが各1件で一致する場合だけ継続する", () => {
    const current = encoded(1);
    const base = encoded(-1);

    expect(parseResultComparisonContinuation({ r: current, compare: base }, current)).toBe(base);
    expect(parseResultComparisonContinuation({ r: [current, current], compare: base }, current)).toBeNull();
    expect(parseResultComparisonContinuation({ r: current, compare: [base, base] }, current)).toBeNull();
    expect(parseResultComparisonContinuation({ r: current, compare: base, extra: "1" }, current)).toBeNull();
    expect(parseResultComparisonContinuation({ r: encoded(0), compare: base }, current)).toBeNull();
    expect(parseResultComparisonContinuation({ r: current, compare: "invalid" }, current)).toBeNull();
  });
});
