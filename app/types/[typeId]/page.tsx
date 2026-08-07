import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OfficialDisclaimerFaq } from "@/components/OfficialDisclaimerFaq";
import { getAllResultTypeGuides, getResultTypeGuide } from "@/lib/resultGuide";

type Props = {
  params: Promise<{ typeId: string }>;
};

export const generateStaticParams = () =>
  getAllResultTypeGuides().map(({ resultType }) => ({ typeId: resultType.id }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { typeId } = await params;
  const entry = getResultTypeGuide(typeId);

  if (!entry) {
    return {
      title: "タイプが見つかりません | LoL診断 β",
      robots: {
        index: false,
        follow: false
      }
    };
  }

  const { resultType, guide } = entry;
  const title = `${resultType.name}の特徴・練習ガイド | LoL診断 β`;
  const description = `${resultType.oneLiner} 得意な状況、崩れやすい状況、やりがちな失敗、3段階の練習メニューを紹介します。`;

  return {
    title,
    description,
    alternates: {
      canonical: `/types/${resultType.id}`
    },
    openGraph: {
      title,
      description: `${guide.headline} ${description}`,
      type: "article"
    }
  };
}

export default async function TypeDetailPage({ params }: Props) {
  const { typeId } = await params;
  const entry = getResultTypeGuide(typeId);

  if (!entry) {
    notFound();
  }

  const { resultType, guide } = entry;

  return (
    <div className="space-y-5">
      <nav className="text-sm text-muted" aria-label="パンくず">
        <Link href="/types" className="underline underline-offset-4">
          8タイプ一覧
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{resultType.name}</span>
      </nav>

      <section className="card space-y-4">
        <p className="text-sm text-accent">PLAYSTYLE GUIDE</p>
        <h1 className="text-3xl font-bold">{resultType.name}</h1>
        <p className="text-lg text-cyan-100">{resultType.oneLiner}</p>
        <p className="text-muted">{resultType.description}</p>
        <p className="rounded-lg border border-cyan-300/30 bg-cyan-400/5 p-3 text-sm text-cyan-100">
          {guide.headline}
        </p>

        <div>
          <h2 className="text-lg font-semibold">このタイプの強み</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {resultType.strengths.map((strength) => (
              <li key={strength} className="rounded-lg border border-slate-700 p-3 text-sm">
                {strength}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-amber-300/40 bg-amber-100/10 p-3 text-sm text-amber-100">
          <p className="font-semibold">意識したいこと</p>
          <p className="mt-1">{resultType.caution}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="text-xl font-semibold">得意を出しやすい状況</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
            {guide.goodSituations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="card space-y-3">
          <h2 className="text-xl font-semibold">崩れやすい状況</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
            {guide.difficultSituations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">やりがちな失敗</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {guide.commonMistakes.map((mistake, index) => (
            <div key={mistake} className="rounded-lg border border-slate-700 p-3">
              <p className="text-xs font-semibold text-amber-200">CHECK {index + 1}</p>
              <p className="mt-2 text-sm text-muted">{mistake}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-4">
        <div>
          <p className="text-sm text-accent">3 MATCH PRACTICE</p>
          <h2 className="mt-1 text-xl font-semibold">3段階の練習メニュー</h2>
          <p className="mt-1 text-sm text-muted">一度に全部変えず、1テーマずつ試す想定です。</p>
        </div>

        <ol className="grid gap-3 lg:grid-cols-3">
          {guide.practiceSteps.map((step, index) => (
            <li key={step.title} className="rounded-lg border border-slate-700 p-4">
              <p className="text-xs font-semibold text-cyan-200">
                {index + 1}. {step.stage}
              </p>
              <h3 className="mt-1 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted">{step.action}</p>
              <p className="mt-3 border-t border-slate-700 pt-3 text-sm text-cyan-100">確認: {step.check}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">試合後の振り返り質問</h2>
        <ol className="space-y-2 text-sm text-muted">
          {guide.reviewQuestions.map((question, index) => (
            <li key={question} className="rounded-lg border border-slate-700 p-3">
              <span className="mr-2 font-semibold text-cyan-200">{index + 1}.</span>
              {question}
            </li>
          ))}
        </ol>
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">自分の診断結果で確認する</h2>
          <p className="mt-1 text-sm text-muted">48問の診断では、8軸スコア・ロール・チャンピオン推薦も確認できます。</p>
        </div>
        <Link href="/diagnosis" className="btn-primary w-fit">
          診断をはじめる
        </Link>
      </section>

      <OfficialDisclaimerFaq />
    </div>
  );
}
