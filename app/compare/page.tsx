import type { Metadata } from "next";
import Link from "next/link";
import { ComparisonActions } from "@/components/ComparisonActions";
import { AXIS_LABELS } from "@/config/axisDisplay";
import {
  buildComparisonDiagnosisPath,
  buildComparisonInvitePath,
  parseComparisonQuery,
  type ComparisonSearchParams
} from "@/lib/comparison";
import { buildSiteUrl } from "@/lib/site";
import { AXIS_KEYS } from "@/lib/types";

type Props = {
  searchParams: Promise<ComparisonSearchParams>;
};

export const metadata: Metadata = {
  title: "友だちと診断結果を比較 | LoL Playstyle Type Finder β",
  description: "2件のLoLプレイスタイル診断結果を8軸で比較します。",
  alternates: {
    canonical: "/compare"
  },
  robots: {
    index: false,
    follow: false
  }
};

const topAxes = (scores: Record<(typeof AXIS_KEYS)[number], number>) =>
  AXIS_KEYS.map((axis, index) => ({ axis, score: scores[axis], index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3);

export default async function ComparePage({ searchParams }: Props) {
  const params = await searchParams;
  const parsed = parseComparisonQuery(params);

  if (!parsed.ok) {
    return (
      <div className="space-y-4">
        <section className="card space-y-4">
          <p className="text-sm text-rose-300">比較URLエラー</p>
          <h1 className="text-2xl font-bold">診断結果を比較できませんでした</h1>
          <p className="text-muted">{parsed.reason}</p>
          <p className="text-sm text-muted">
            URLが途中で切れている、複数の値が含まれている、または古い形式の可能性があります。
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/diagnosis" className="btn-primary">
              自分で診断する
            </Link>
            <Link href="/" className="btn-secondary">
              トップへ戻る
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (parsed.mode === "invite") {
    const { base } = parsed;
    const diagnosisPath = buildComparisonDiagnosisPath(base.encoded);
    const inviteUrl = buildSiteUrl("/compare", { base: base.encoded });
    const axes = topAxes(base.result.axisScore);
    const shareText = `LoL診断でプレイ傾向を比べよう。招待元の結果は「${base.result.type.name}」です。`;

    return (
      <div className="space-y-4">
        <section className="card space-y-4">
          <div>
            <p className="text-sm text-accent">友だち比較の招待</p>
            <h1 className="mt-1 text-3xl font-bold">診断結果を8軸で比べよう</h1>
            <p className="mt-2 text-muted">
              招待元の診断結果と、あなたの診断結果を並べて確認できます。比較値は勝率や実力ではなく、回答傾向の近さを表します。
            </p>
          </div>

          <div className="rounded-xl border border-cyan-300/30 bg-cyan-400/5 p-4">
            <p className="text-xs text-muted">招待元の結果</p>
            <h2 className="mt-1 text-2xl font-semibold">{base.result.type.name}</h2>
            <p className="mt-1 text-cyan-100">{base.result.type.oneLiner}</p>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {axes.map(({ axis, score }) => (
                <div key={axis} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm">
                  <p className="text-muted">{AXIS_LABELS[axis]}</p>
                  <p className="mt-1 text-xl font-semibold text-cyan-100">{score}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {base.result.recommendedRoles.map((role) => (
                <span key={role} className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 text-xs">
                  {role}
                </span>
              ))}
            </div>
          </div>

          <ol className="grid gap-2 text-sm text-muted sm:grid-cols-3">
            <li className="rounded-lg border border-slate-700 p-3">1. 48問の診断に回答</li>
            <li className="rounded-lg border border-slate-700 p-3">2. 自分の結果を確認・保存</li>
            <li className="rounded-lg border border-slate-700 p-3">3. 8軸を並べて比較</li>
          </ol>

          {diagnosisPath ? (
            <Link href={diagnosisPath} className="btn-primary w-fit">
              診断して比較する
            </Link>
          ) : null}
        </section>

        <ComparisonActions mode="invite" shareUrl={inviteUrl} shareText={shareText} />

        <section className="card text-sm text-muted">
          <p>
            招待URLには診断回答を短く表したトークンが含まれます。氏名、アカウント、ランク、戦績は含まれず、サーバーへ比較履歴を保存しません。
          </p>
        </section>
      </div>
    );
  }

  const { comparison } = parsed;
  const comparisonUrl = buildSiteUrl("/compare", {
    a: comparison.first.encoded,
    b: comparison.second.encoded
  });
  const restartPath = buildComparisonInvitePath(comparison.first.encoded);
  const shareText = `LoL診断のプレイ傾向の近さは${comparison.similarityScore}（${comparison.similarityLabel}）でした。`;

  return (
    <div className="space-y-4">
      <section className="card space-y-4 text-center">
        <p className="text-sm text-accent">友だち比較結果</p>
        <h1 className="text-3xl font-bold">プレイ傾向の近さ</h1>
        <p className="text-6xl font-extrabold text-cyan-100">{comparison.similarityScore}</p>
        <p className="text-xl font-semibold">{comparison.similarityLabel}</p>
        <p className="mx-auto max-w-xl text-sm text-muted">
          8軸それぞれの絶対差を平均して算出しています。この値はデュオの相性、勝率、実力、関係性を示すものではありません。
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {[
          { label: "結果A", participant: comparison.first, accent: "text-cyan-100" },
          { label: "結果B", participant: comparison.second, accent: "text-amber-100" }
        ].map(({ label, participant, accent }) => (
          <article key={label} className="card space-y-3">
            <p className="text-xs text-muted">{label}</p>
            <h2 className={`text-2xl font-semibold ${accent}`}>{participant.result.type.name}</h2>
            <p className="text-sm text-muted">{participant.result.type.oneLiner}</p>
            <div className="flex flex-wrap gap-2">
              {participant.result.recommendedRoles.map((role) => (
                <span key={role} className="rounded-full border border-slate-600 px-3 py-1 text-xs">
                  {role}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="text-xl font-semibold">8軸の比較</h2>
          <p className="mt-1 text-sm text-muted">数値差が小さいほど、回答上の傾向が近い軸です。</p>
        </div>

        <div className="space-y-4">
          {comparison.axes.map(({ axis, first, second, difference }) => (
            <div key={axis} className="rounded-lg border border-slate-700 p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{AXIS_LABELS[axis]}</span>
                <span className="text-muted">差 {difference}</span>
              </div>
              <div className="mt-3 grid gap-2 text-xs">
                <div className="grid grid-cols-[54px_1fr_36px] items-center gap-2">
                  <span className="text-cyan-100">結果A</span>
                  <div className="h-2 overflow-hidden rounded bg-slate-700">
                    <div className="h-full bg-cyan-300" style={{ width: `${first}%` }} />
                  </div>
                  <span className="text-right">{first}</span>
                </div>
                <div className="grid grid-cols-[54px_1fr_36px] items-center gap-2">
                  <span className="text-amber-100">結果B</span>
                  <div className="h-2 overflow-hidden rounded bg-slate-700">
                    <div className="h-full bg-amber-200" style={{ width: `${second}%` }} />
                  </div>
                  <span className="text-right">{second}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="text-xl font-semibold">近い軸</h2>
          <ul className="space-y-2 text-sm">
            {comparison.closestAxes.map(({ axis, difference }) => (
              <li key={axis} className="flex justify-between gap-3 rounded-lg border border-slate-700 p-3">
                <span>{AXIS_LABELS[axis]}</span>
                <span className="text-cyan-100">差 {difference}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card space-y-3">
          <h2 className="text-xl font-semibold">違いが大きい軸</h2>
          <ul className="space-y-2 text-sm">
            {comparison.differentAxes.map(({ axis, difference }) => (
              <li key={axis} className="flex justify-between gap-3 rounded-lg border border-slate-700 p-3">
                <span>{AXIS_LABELS[axis]}</span>
                <span className="text-amber-100">差 {difference}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">おすすめロールの共通点</h2>
        {comparison.sharedRoles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {comparison.sharedRoles.map((role) => (
              <span key={role} className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-4 py-1 text-sm">
                {role}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            上位2ロールは一致しませんでした。診断上は異なる役割を選びやすい傾向として、役割分担を考える材料にできます。
          </p>
        )}
      </section>

      <ComparisonActions
        mode="result"
        shareUrl={comparisonUrl}
        shareText={shareText}
        restartPath={restartPath}
      />

      <section className="card text-sm text-muted">
        <p>
          この比較は48問への回答だけを利用した参考情報です。ゲーム内の判断、得意チャンピオン、ランク、パッチ環境によって実際のプレイは変化します。
        </p>
      </section>
    </div>
  );
}
