import { describe, expect, it } from "vitest";
import { buildResultCardFilename } from "@/config/resultCard";
import { questions } from "@/data/questions";
import {
  buildResultCardData,
  buildResultCardDataFromSearchParams,
  buildResultCardPath
} from "@/lib/resultCard";
import { encodeAnswers } from "@/lib/share";

const createEncoded = (value: -2 | -1 | 0 | 1 | 2 = 0): string => {
  const encoded = encodeAnswers(Array.from({ length: questions.length }, () => value));
  if (!encoded) throw new Error("テスト用回答をエンコードできませんでした。");
  return encoded;
};

describe("診断結果カード", () => {
  it("有効な回答トークンからカード表示データを生成する", () => {
    const parsed = buildResultCardData(createEncoded());

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.data.typeId).toMatch(/^[a-z0-9_-]+$/);
    expect(parsed.data.typeName.length).toBeGreaterThan(0);
    expect(parsed.data.oneLiner.length).toBeGreaterThan(0);
    expect(parsed.data.topAxes).toHaveLength(3);
    expect(parsed.data.recommendedRoles).toHaveLength(2);
    expect(parsed.data.topAxes[0].score).toBeGreaterThanOrEqual(parsed.data.topAxes[1].score);
    expect(parsed.data.topAxes[1].score).toBeGreaterThanOrEqual(parsed.data.topAxes[2].score);
    expect(parsed.data.topAxes.every((entry) => entry.score >= 0 && entry.score <= 100)).toBe(true);
  });

  it("有効な回答トークンから結果カードの相対URLを生成する", () => {
    const encoded = createEncoded(1);

    expect(buildResultCardPath(encoded)).toBe(`/api/result-card?r=${encodeURIComponent(encoded)}`);
  });

  it("不正な回答トークンではカードデータとURLを生成しない", () => {
    expect(buildResultCardData("v2_invalid_00").ok).toBe(false);
    expect(buildResultCardPath("v2_invalid_00")).toBeNull();
  });

  it("rが1件だけのクエリを許可する", () => {
    const encoded = createEncoded(-1);
    const parsed = buildResultCardDataFromSearchParams(new URLSearchParams({ r: encoded }));

    expect(parsed.ok).toBe(true);
  });

  it("r欠落・複数r・追加クエリを拒否する", () => {
    const encoded = createEncoded();

    expect(buildResultCardDataFromSearchParams(new URLSearchParams()).ok).toBe(false);
    expect(buildResultCardDataFromSearchParams(new URLSearchParams(`r=${encoded}&r=${encoded}`)).ok).toBe(false);
    expect(buildResultCardDataFromSearchParams(new URLSearchParams(`r=${encoded}&theme=dark`)).ok).toBe(false);
  });

  it("結果タイプIDから安全なPNGファイル名を生成する", () => {
    expect(buildResultCardFilename("balanced-adapter")).toBe("lol-playstyle-balanced-adapter.png");
    expect(buildResultCardFilename("../危険 TYPE!!")).toBe("lol-playstyle-type.png");
    expect(buildResultCardFilename("!!!")).toBe("lol-playstyle-result.png");
  });
});
