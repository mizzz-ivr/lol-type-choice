import Link from "next/link";
import { getResultGuide } from "@/lib/resultGuide";

export function ResultPlayGuide({ resultTypeId }: { resultTypeId: string }) {
  const guide = getResultGuide(resultTypeId);

  if (!guide) {
    return null;
  }

  const firstStep = guide.practiceSteps[0];

  return (
    <section className="card space-y-4">
      <div>
        <p className="text-sm text-accent">次の試合で試すこと</p>
        <h2 className="mt-1 text-xl font-semibold">あなたのタイプ向け実践ガイド</h2>
        <p className="mt-2 text-sm text-muted">{guide.headline}</p>
      </div>

      <div className="rounded-lg border border-cyan-300/30 bg-cyan-400/5 p-4">
        <p className="text-xs font-semibold text-cyan-200">{firstStep.stage}</p>
        <h3 className="mt-1 font-semibold">{firstStep.title}</h3>
        <p className="mt-2 text-sm text-muted">{firstStep.action}</p>
        <p className="mt-2 text-sm text-cyan-100">確認: {firstStep.check}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-700 p-3">
          <h3 className="font-semibold">得意を出しやすい状況</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {guide.goodSituations.slice(0, 2).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-700 p-3">
          <h3 className="font-semibold">崩れやすい状況</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {guide.difficultSituations.slice(0, 2).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <Link href={`/types/${encodeURIComponent(resultTypeId)}`} className="btn-secondary w-fit">
        このタイプの詳しいプレイガイドを見る
      </Link>
    </section>
  );
}
