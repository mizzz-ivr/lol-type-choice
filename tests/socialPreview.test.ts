import { describe, expect, it } from "vitest";
import {
  SOCIAL_PREVIEW_ALT,
  SOCIAL_PREVIEW_COLORS,
  SOCIAL_PREVIEW_CONTENT_TYPE,
  SOCIAL_PREVIEW_COPY,
  SOCIAL_PREVIEW_SIZE
} from "@/config/socialPreview";

describe("SNS共有画像設定", () => {
  it("標準的なOGPサイズとPNG形式を使用する", () => {
    expect(SOCIAL_PREVIEW_SIZE).toEqual({ width: 1200, height: 630 });
    expect(SOCIAL_PREVIEW_CONTENT_TYPE).toBe("image/png");
  });

  it("診断内容と非公式表記を共有画像へ含める", () => {
    expect(SOCIAL_PREVIEW_ALT).toContain("48問");
    expect(SOCIAL_PREVIEW_ALT).toContain("8軸分析");
    expect(SOCIAL_PREVIEW_ALT).toContain("非公式");
    expect(SOCIAL_PREVIEW_COPY.title).toContain("48問");
    expect(SOCIAL_PREVIEW_COPY.badges).toEqual(["48 QUESTIONS", "8 AXES", "8 TYPES"]);
    expect(SOCIAL_PREVIEW_COPY.disclaimer).toContain("UNOFFICIAL");
  });

  it("既存サイトの配色値と一致する", () => {
    expect(SOCIAL_PREVIEW_COLORS).toMatchObject({
      base: "#0a0f1a",
      card: "#111827",
      accent: "#22d3ee",
      text: "#f8fafc",
      muted: "#94a3b8"
    });
  });
});
