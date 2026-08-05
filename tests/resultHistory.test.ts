import { describe, expect, it } from "vitest";
import { questions } from "@/data/questions";
import {
  RESULT_HISTORY_LIMIT,
  RESULT_HISTORY_SCHEMA_VERSION,
  appendResultHistory,
  compareAxisScores,
  createResultHistoryRecord,
  isResultHistoryRecord,
  parseResultHistory,
  removeResultHistoryRecord,
  shouldSavePendingResult,
  type ResultHistoryRecord
} from "@/lib/resultHistory";
import { encodeAnswers } from "@/lib/share";
import type { AxisScore } from "@/lib/types";

const baseScore: AxisScore = {
  initiative: 60,
  riskTolerance: 55,
  decisionStyle: 50,
  winCondition: 65,
  combatRange: 40,
  processing: 45,
  tempo: 70,
  responsibility: 35
};

const encoded = (value: -2 | -1 | 0 | 1 | 2) => {
  const result = encodeAnswers(Array.from({ length: questions.length }, () => value));
  if (!result) throw new Error("テスト用回答をエンコードできませんでした。");
  return result;
};

const createRecord = (
  index = 1,
  answerValue: -2 | -1 | 0 | 1 | 2 = 0,
  score: AxisScore = baseScore
): ResultHistoryRecord => {
  const record = createResultHistoryRecord({
    id: `record_${String(index).padStart(8, "0")}`,
    completedAt: new Date(Date.UTC(2026, 7, index, 0, 0, 0)).toISOString(),
    encoded: encoded(answerValue),
    typeId: "balanced-adapter",
    typeName: "適応バランス型",
    axisScore: score,
    recommendedRoles: ["MID", "SUP"]
  });

  if (!record) throw new Error("テスト用履歴を作成できませんでした。");
  return record;
};

describe("診断履歴", () => {
  it("有効な下書きからschemaVersion付き履歴を作成する", () => {
    const record = createRecord();

    expect(record.schemaVersion).toBe(RESULT_HISTORY_SCHEMA_VERSION);
    expect(record.resultPath).toMatch(/^\/result\?r=v2_/);
    expect(isResultHistoryRecord(record)).toBe(true);
  });

  it("診断完了マーカーと有効な結果トークンが一致する場合だけ保存対象にする", () => {
    const current = encoded(0);

    expect(shouldSavePendingResult(current, current)).toBe(true);
    expect(shouldSavePendingResult(encoded(1), current)).toBe(false);
    expect(shouldSavePendingResult(null, current)).toBe(false);
    expect(shouldSavePendingResult("v2_invalid_00", "v2_invalid_00")).toBe(false);
  });

  it("不正な回答トークン・ID・日時を拒否する", () => {
    const common = {
      typeId: "balanced-adapter",
      typeName: "適応バランス型",
      axisScore: baseScore,
      recommendedRoles: ["MID", "SUP"] as const
    };

    expect(
      createResultHistoryRecord({
        ...common,
        recommendedRoles: [...common.recommendedRoles],
        id: "short",
        completedAt: new Date().toISOString(),
        encoded: encoded(0)
      })
    ).toBeNull();
    expect(
      createResultHistoryRecord({
        ...common,
        recommendedRoles: [...common.recommendedRoles],
        id: "record_00000001",
        completedAt: "not-a-date",
        encoded: encoded(0)
      })
    ).toBeNull();
    expect(
      createResultHistoryRecord({
        ...common,
        recommendedRoles: [...common.recommendedRoles],
        id: "record_00000001",
        completedAt: new Date().toISOString(),
        encoded: "v2_invalid_00"
      })
    ).toBeNull();
  });

  it("不正JSONと配列以外を空履歴として扱う", () => {
    expect(parseResultHistory("{broken")).toEqual([]);
    expect(parseResultHistory(JSON.stringify({ records: [] }))).toEqual([]);
    expect(parseResultHistory(null)).toEqual([]);
  });

  it("旧schema・範囲外スコア・外部URL・不正ロールを読み飛ばす", () => {
    const valid = createRecord();
    const oldSchema = { ...valid, id: "record_00000002", schemaVersion: 0 };
    const invalidScore = {
      ...valid,
      id: "record_00000003",
      axisScore: { ...valid.axisScore, initiative: 101 }
    };
    const externalUrl = {
      ...valid,
      id: "record_00000004",
      resultPath: "https://example.com/result?r=invalid"
    };
    const invalidRole = {
      ...valid,
      id: "record_00000005",
      recommendedRoles: ["ADMIN"]
    };

    expect(parseResultHistory(JSON.stringify([oldSchema, invalidScore, externalUrl, invalidRole, valid]))).toEqual([valid]);
  });

  it("重複IDを除外し最大10件へ制限する", () => {
    const records = Array.from({ length: RESULT_HISTORY_LIMIT + 2 }, (_, index) =>
      createRecord(index + 1, (index % 5 - 2) as -2 | -1 | 0 | 1 | 2)
    );
    const duplicate = { ...records[0] };

    const parsed = parseResultHistory(JSON.stringify([duplicate, ...records]));

    expect(parsed).toHaveLength(RESULT_HISTORY_LIMIT);
    expect(parsed[0].id).toBe(records[0].id);
    expect(new Set(parsed.map((record) => record.id)).size).toBe(RESULT_HISTORY_LIMIT);
  });

  it("同じ結果URLの連続保存を抑止する", () => {
    const first = createRecord(1, 0);
    const duplicateResult = createRecord(2, 0);

    const result = appendResultHistory([first], duplicateResult);

    expect(result.added).toBe(false);
    expect(result.records).toEqual([first]);
  });

  it("異なる結果を挟んだ同一結果は新しい診断として保存する", () => {
    const olderSameResult = createRecord(1, 0);
    const differentResult = createRecord(2, 1);
    const latestSameResult = createRecord(3, 0);

    const result = appendResultHistory([differentResult, olderSameResult], latestSameResult);

    expect(result.added).toBe(true);
    expect(result.records.map((record) => record.id)).toEqual([
      latestSameResult.id,
      differentResult.id,
      olderSameResult.id
    ]);
  });

  it("11件目追加時は最古の履歴を削除する", () => {
    const current = Array.from({ length: RESULT_HISTORY_LIMIT }, (_, index) =>
      createRecord(index + 1, (index % 5 - 2) as -2 | -1 | 0 | 1 | 2)
    );
    const next = createRecord(99, 2);

    const result = appendResultHistory(current, next);

    expect(result.records).toHaveLength(RESULT_HISTORY_LIMIT);
    expect(result.records[0].id).toBe(next.id);
    expect(result.records).not.toContainEqual(current[current.length - 1]);
  });

  it("指定した履歴だけを削除する", () => {
    const first = createRecord(1, 0);
    const second = createRecord(2, 1);

    expect(removeResultHistoryRecord([second, first], second.id)).toEqual([first]);
    expect(removeResultHistoryRecord([second, first], "unknown_id")).toEqual([second, first]);
  });

  it("8軸の前回差分を計算する", () => {
    const previous: AxisScore = { ...baseScore, initiative: 50, tempo: 80 };
    const comparison = compareAxisScores(baseScore, previous);

    expect(comparison).toHaveLength(8);
    expect(comparison.find((item) => item.axis === "initiative")).toMatchObject({
      previous: 50,
      current: 60,
      delta: 10
    });
    expect(comparison.find((item) => item.axis === "tempo")).toMatchObject({
      previous: 80,
      current: 70,
      delta: -10
    });
  });
});
