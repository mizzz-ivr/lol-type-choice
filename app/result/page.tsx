import type { Metadata } from "next";
import { AxisBars } from "@/components/AxisBars";
import { ComparisonContinuation } from "@/components/ComparisonContinuation";
import { OfficialDisclaimerFaq } from "@/components/OfficialDisclaimerFaq";
import { ResultActions } from "@/components/ResultActions";
import { ResultHistoryPanel } from "@/components/ResultHistoryPanel";
import { AXIS_LABELS } from "@/config/axisDisplay";
import { buildResultCardAlt, buildResultCardFilename, RESULT_CARD_SIZE } from "@/config/resultCard";
import { questions } from "@/data/questions";
import {
  buildComparisonInvitePath,
  buildComparisonResultPath,
  parseResultComparisonContinuation
} from "@/lib/comparison";
import { buildResultCardPath } from "@/lib/resultCard";
import { parseResultQuery } from "@/lib/resultQuery";
import { buildDiagnosisResult } from "@/lib/scoring";
import { buildSiteUrl } from "@/lib/site";
import { AXIS_KEYS } from "@/lib/types";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const getResult = async (searchParams: Props["searchParams"]) => {
  const params = await searchParams;
  const parsed = parseResultQuery(params.r);

  if (!parsed.ok) {
    return { ok: false as const, reason: parsed.reason };
  }

  try {
    const result = buildDiagnosisResult(questions, parsed.answerMap);
    const comparisonBase = parseResultComparisonContinuation(params, parsed.encoded);
    return {
      ok: true as const,
      result,
      encoded: parsed.encoded,
      comparisonBase
    };
  } catch {
    return { ok: false as const, reason: "診断ロジックの処理中にエラーが発生しました。" };
  }
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const resolved = await getResult(searchParams);
  const title = resolved.ok ? `${resolved.result.type.name} | LoL診断 β` : "診断結果 | LoL Playstyle Type Finder β";
  const description = resolved.ok ? `${resolved.result.type.oneLiner} 8軸スコアとおすすめロールを表示。` : "LoL向けプレイスタイル診断結果";

  if (!resolved.ok) {
    return {
      title,
      description,
      alternates: {
        canonical: "/result"
      },
      robots: {
        index: false,
        follow: false
      },
      openGraph: {
        title,
        description,
        type: "article"
      },
      twitter: {
        card: "summary",
        title,
        description
      }
    };
  }

  const directUrl = buildSiteUrl("/result", { r: resolved.encoded });
  const imageUrl = buildSiteUrl("/api/result-card", { r: resolved.encoded });
  const imageAlt = buildResultCardAlt(resolved.result.type.name);

  return {
    title,
    description,
    alternates: {
      canonical: "/result"
    },
    robots: {
      index: false,
      follow: false
    },
    openGraph: {
      title,
      description,
      type: "article",
      url: directUrl,
      images: [
        {
          url: imageUrl,
          width: RESULT_CARD_SIZE.width,
          height: RESULT_CARD_SIZE.height,
          alt: imageAlt,
          type: "image/png"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        {
          url: imageUrl,
          alt: imageAlt
        }
      ]
    }
  };
}

export default async function ResultPage({ searchParams }: Props) {
  const resolved = await getResult(searchParams);

  if (!resolved.ok) {
    return (
      <div className="card space-y-4">
        <h1 className="text-2xl font-bold">結果を表示できませんでした</h1>
        <p className="text-muted">{resolved.reason}</p>
        <p className="text-sm text-muted">URLが不正、または古い可能性があります。診断をやり直してください。</p>
        <a href="/diagnosis" className="btn-primary w-fit">
          診断をやり直す
        </a>
      </div>
    );
  }

  const { result, encoded, comparisonBase } = resolved;
  const directUrl = buildSiteUrl("/result", { r: encoded });
  const imagePath = buildResultCardPath(encoded);
  const comparisonInvitePath = buildComparisonInvitePath(encoded);
  const comparisonResultPath = comparisonBase
    ? buildComparisonResultPath(comparisonBase, encoded)
    : null;
  const shareText = `LoL診断βの結果は「${result.type.name}」でした。${result.type.oneLiner}`;

  const sortedAxes = [...AXIS_KEYS]
    .map((axis) => ({ axis, score: result.axisScore[axis] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <p className="text-sm text-accent">診断結果（β）</p>
        <h1 className="text-3xl font-bold">{result.type.name}</h1>
        <p className="text-lg text-cyan-100">{result.type.oneLiner}</p>
        <p className="text-muted">{result.type.description}</p>

        <div className="rounded-lg border border-slate-700 p-3 text-sm">
          <p className="font-semibold text-text">あなたの強み（上位3軸）</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            {sortedAxes.map(({ axis, score }) => (
              <li key={axis}>
                {AXIS_LABELS[axis]}: {score}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-amber-300/40 bg-amber-100/10 p-3 text-sm text-amber-100">
          <p className="font-semibold">プレイ時の注意</p>
          <p>{result.type.caution}</p>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-semibold">8軸スコア</h2>
        <AxisBars scores={result.axisScore} />
      </section>

      <ResultHistoryPanel
        encoded={encoded}
        typeId={result.type.id}
        typeName={result.type.name}
        axisScore={result.axisScore}
        recommendedRoles={result.recommendedRoles}
      />

      {comparisonResultPath ? (
        <ComparisonContinuation comparisonPath={comparisonResultPath} />
      ) : null}

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">おすすめロール（上位2）</h2>
        <div className="flex gap-2">
          {result.recommendedRoles.map((role) => (
            <span key={role} className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-4 py-1 text-sm">
              {role}
            </span>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">おすすめチャンピオン</h2>
        {result.recommendedChampions.length === 0 ? (
          <p className="text-sm text-muted">チャンピオンデータが不足しているため、現在はおすすめを表示できません。</p>
        ) : (
          <ul className="space-y-2">
            {result.recommendedChampions.map(({ champion, score, reason }) => (
              <li key={champion.slug} className="rounded-lg border border-slate-700 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {champion.name} <span className="text-xs text-muted">({champion.primaryRole})</span>
                  </p>
                  <span className="text-sm text-cyan-200">相性 {Math.round(score)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{champion.tags.join(" / ")}</p>
                <p className="mt-2 text-sm text-cyan-100">{reason.title}</p>
                <p className="mt-1 text-sm text-muted">{reason.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {imagePath ? (
        <ResultActions
          shareUrl={directUrl}
          shareText={shareText}
          imagePath={imagePath}
          imageFilename={buildResultCardFilename(result.type.id)}
          comparisonInvitePath={comparisonInvitePath}
        />
      ) : null}
      <OfficialDisclaimerFaq />
    </div>
  );
}
