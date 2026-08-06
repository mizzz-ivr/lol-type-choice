"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

export function ComparisonContinuation({ comparisonPath }: { comparisonPath: string }) {
  return (
    <section className="card space-y-3 border-cyan-300/40 bg-cyan-400/5">
      <div>
        <p className="text-sm text-accent">友だち比較</p>
        <h2 className="mt-1 text-xl font-semibold">比較結果の準備ができました</h2>
        <p className="mt-2 text-sm text-muted">
          自分の診断結果を確認したあと、招待元の結果と8軸を並べて比較できます。
        </p>
      </div>
      <Link
        href={comparisonPath}
        className="btn-primary w-fit"
        onClick={() => trackEvent("comparison_completed", { source: "result_continuation" })}
      >
        友だちとの比較結果を見る
      </Link>
    </section>
  );
}
