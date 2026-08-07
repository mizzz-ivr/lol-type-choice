import type { Metadata } from "next";
import Link from "next/link";
import { OfficialDisclaimerFaq } from "@/components/OfficialDisclaimerFaq";
import { getAllResultTypeGuides } from "@/lib/resultGuide";

export const metadata: Metadata = {
  title: "8つのプレイスタイルタイプ | LoL診断 β",
  description: "LoL Playstyle Type Finder βの8タイプを一覧で紹介。強み、注意点、実践プレイガイドを確認できます。",
  alternates: {
    canonical: "/types"
  },
  openGraph: {
    title: "8つのプレイスタイルタイプ | LoL診断 β",
    description: "8タイプの特徴と実践プレイガイドを一覧で確認できます。",
    type: "website"
  }
};

export default function TypesPage() {
  const entries = getAllResultTypeGuides();

  return (
    <div className="space-y-5">
      <section className="card space-y-3">
        <p className="text-sm text-accent">プレイスタイル図鑑</p>
        <h1 className="text-3xl font-bold">8つのプレイスタイルタイプ</h1>
        <p className="text-muted">
          各タイプの得意な状況、崩れやすい状況、やりがちな失敗、3段階の練習メニューをまとめています。
          タイプに優劣はなく、自分の判断傾向を振り返るための分類です。
        </p>
        <Link href="/diagnosis" className="btn-primary w-fit">
          自分のタイプを診断する
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {entries.map(({ resultType, guide }) => (
          <article key={resultType.id} className="card space-y-3">
            <div>
              <p className="text-xs text-accent">PLAYSTYLE TYPE</p>
              <h2 className="mt-1 text-xl font-semibold">{resultType.name}</h2>
              <p className="mt-1 text-sm text-cyan-100">{resultType.oneLiner}</p>
            </div>

            <p className="text-sm text-muted">{guide.headline}</p>

            <div>
              <p className="text-sm font-semibold">主な強み</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {resultType.strengths.map((strength) => (
                  <li key={strength} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-muted">
                    {strength}
                  </li>
                ))}
              </ul>
            </div>

            <Link href={`/types/${resultType.id}`} className="btn-secondary w-fit">
              詳細ガイドを見る
            </Link>
          </article>
        ))}
      </section>

      <OfficialDisclaimerFaq />
    </div>
  );
}
