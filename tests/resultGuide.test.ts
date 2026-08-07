import { describe, expect, it } from "vitest";
import { resultGuides } from "@/data/resultGuides";
import { resultTypes } from "@/data/resultTypes";
import {
  getAllResultTypeGuides,
  getResultGuide,
  getResultGuideCoverage,
  getResultTypeGuide
} from "@/lib/resultGuide";

const expectThreeNonEmptyStrings = (values: readonly string[]) => {
  expect(values).toHaveLength(3);
  for (const value of values) {
    expect(value.trim().length).toBeGreaterThan(10);
  }
};

describe("タイプ別プレイガイド", () => {
  it("全結果タイプにガイドが1件ずつ存在する", () => {
    const coverage = getResultGuideCoverage();

    expect(resultTypes).toHaveLength(8);
    expect(resultGuides).toHaveLength(resultTypes.length);
    expect(coverage).toEqual({
      missingGuideIds: [],
      unknownGuideIds: [],
      duplicateGuideIds: []
    });
  });

  it("結果タイプ順で全ガイドを取得できる", () => {
    const entries = getAllResultTypeGuides();

    expect(entries.map(({ resultType }) => resultType.id)).toEqual(resultTypes.map((resultType) => resultType.id));
    expect(entries.map(({ guide }) => guide.resultTypeId)).toEqual(resultTypes.map((resultType) => resultType.id));
  });

  it("各ガイドが必要なコンテンツを3件ずつ持つ", () => {
    for (const guide of resultGuides) {
      expect(guide.headline.trim().length).toBeGreaterThan(20);
      expectThreeNonEmptyStrings(guide.goodSituations);
      expectThreeNonEmptyStrings(guide.difficultSituations);
      expectThreeNonEmptyStrings(guide.commonMistakes);
      expectThreeNonEmptyStrings(guide.reviewQuestions);
      expect(guide.practiceSteps).toHaveLength(3);
      expect(guide.practiceSteps.map((step) => step.stage)).toEqual(["まずは", "次に", "慣れたら"]);

      for (const step of guide.practiceSteps) {
        expect(step.title.trim().length).toBeGreaterThan(5);
        expect(step.action.trim().length).toBeGreaterThan(20);
        expect(step.check.trim().length).toBeGreaterThan(15);
      }
    }
  });

  it("有効なtypeIdから結果タイプとガイドを取得できる", () => {
    const target = resultTypes[0];
    const entry = getResultTypeGuide(target.id);

    expect(entry?.resultType).toEqual(target);
    expect(entry?.guide.resultTypeId).toBe(target.id);
    expect(getResultGuide(target.id)?.resultTypeId).toBe(target.id);
  });

  it("未知のtypeIdはnullを返す", () => {
    expect(getResultTypeGuide("unknown-type")).toBeNull();
    expect(getResultGuide("unknown-type")).toBeNull();
  });

  it("ガイドIDはURLで安全に扱える形式だけを使用する", () => {
    for (const guide of resultGuides) {
      expect(guide.resultTypeId).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});
