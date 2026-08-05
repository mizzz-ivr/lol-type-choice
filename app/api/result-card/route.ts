import { ImageResponse } from "next/og";
import { ResultCardImage } from "@/components/ResultCardImage";
import {
  RESULT_CARD_CACHE_CONTROL,
  RESULT_CARD_CONTENT_TYPE,
  RESULT_CARD_SIZE,
  buildResultCardFilename
} from "@/config/resultCard";
import { buildResultCardDataFromSearchParams } from "@/lib/resultCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errorResponse = (message: string, status: 400 | 500) =>
  Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );

export function GET(request: Request): Response {
  try {
    const url = new URL(request.url);
    const parsed = buildResultCardDataFromSearchParams(url.searchParams);

    if (!parsed.ok) {
      return errorResponse(parsed.reason, 400);
    }

    const filename = buildResultCardFilename(parsed.data.typeId);

    return new ImageResponse(ResultCardImage({ data: parsed.data }), {
      ...RESULT_CARD_SIZE,
      headers: {
        "Cache-Control": RESULT_CARD_CACHE_CONTROL,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Type": RESULT_CARD_CONTENT_TYPE,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return errorResponse("診断結果カード画像の生成に失敗しました。", 500);
  }
}
