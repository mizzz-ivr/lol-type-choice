import type { Metadata } from "next";
import { DiagnosisHistory } from "@/components/DiagnosisHistory";

export const metadata: Metadata = {
  title: "診断履歴 | LoL Playstyle Type Finder β",
  description: "このブラウザに保存されたLoLプレイスタイル診断結果を振り返ります。",
  alternates: {
    canonical: "/history"
  },
  robots: {
    index: false,
    follow: false
  }
};

export default function HistoryPage() {
  return <DiagnosisHistory />;
}
