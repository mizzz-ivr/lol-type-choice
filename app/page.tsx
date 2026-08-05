import Link from "next/link";
import { OfficialDisclaimerFaq } from "@/components/OfficialDisclaimerFaq";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <p className="text-sm text-accent">LoL Playstyle Type Finder β</p>
        <h1 className="text-3xl font-bold">League of Legends向け MBTI風プレイスタイル診断</h1>
        <p className="text-muted">
          48問で「あなたが勝ちやすい戦い方」を8軸で可視化。おすすめロールとチャンプ、理由までまとめて確認できます。
        </p>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <p className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">所要時間: 約4〜6分</p>
          <p className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">結果タイプ: 8種類</p>
          <p className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">チャンプ推薦: 20体+</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/diagnosis" className="btn-primary w-full sm:w-auto">
            診断をはじめる
          </Link>
          <Link href="/history" className="btn-secondary w-full sm:w-auto">
            過去の結果を見る
          </Link>
        </div>
      </section>

      <section className="card space-y-3 text-sm">
        <h2 className="text-lg font-semibold text-text">結果サンプル（例）</h2>
        <div className="rounded-lg border border-cyan-300/30 bg-cyan-400/5 p-3">
          <p className="font-medium text-cyan-100">先導キャリー型</p>
          <p className="text-muted">「自ら開戦を作り、主導権で勝ち切るタイプ」</p>
        </div>
      </section>

      <OfficialDisclaimerFaq />
    </div>
  );
}
