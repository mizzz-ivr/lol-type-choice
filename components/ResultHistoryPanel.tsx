"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AXIS_LABELS } from "@/config/axisDisplay";
import { trackEvent } from "@/lib/analytics";
import {
  RESULT_HISTORY_PENDING_KEY,
  RESULT_HISTORY_STORAGE_KEY,
  appendResultHistory,
  compareAxisScores,
  createResultHistoryRecord,
  parseResultHistory,
  type ResultHistoryRecord
} from "@/lib/resultHistory";
import type { AxisScore, Role } from "@/lib/types";

type Props = {
  encoded: string;
  typeId: string;
  typeName: string;
  axisScore: AxisScore;
  recommendedRoles: Role[];
};

type HistoryState = "loading" | "saved" | "unchanged" | "view-only" | "error";

const createRecordId = (): string => {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `history_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

const formatCompletedAt = (value: string): string =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));

const deltaText = (delta: number): string => {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return String(delta);
  return "±0";
};

const deltaClassName = (delta: number): string => {
  if (delta > 0) return "text-cyan-200";
  if (delta < 0) return "text-amber-200";
  return "text-muted";
};

export function ResultHistoryPanel({ encoded, typeId, typeName, axisScore, recommendedRoles }: Props) {
  const [previous, setPrevious] = useState<ResultHistoryRecord | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [historyState, setHistoryState] = useState<HistoryState>("loading");

  useEffect(() => {
    try {
      const currentRecords = parseResultHistory(window.localStorage.getItem(RESULT_HISTORY_STORAGE_KEY));
      const currentPath = `/result?r=${encodeURIComponent(encoded)}`;
      const previousRecord = currentRecords.find((record) => record.resultPath !== currentPath) ?? null;
      let shouldSave = false;

      try {
        const pendingEncoded = window.sessionStorage.getItem(RESULT_HISTORY_PENDING_KEY);
        shouldSave = pendingEncoded === encoded;
        if (pendingEncoded !== null) {
          window.sessionStorage.removeItem(RESULT_HISTORY_PENDING_KEY);
        }
      } catch {
        // 一時マーカーを確認できない場合は、結果閲覧として扱い自動保存しない。
      }

      setPrevious(previousRecord);

      if (!shouldSave) {
        setSavedCount(currentRecords.length);
        setHistoryState(currentRecords.some((record) => record.resultPath === currentPath) ? "unchanged" : "view-only");
        return;
      }

      const record = createResultHistoryRecord({
        id: createRecordId(),
        completedAt: new Date().toISOString(),
        encoded,
        typeId,
        typeName,
        axisScore,
        recommendedRoles
      });

      if (!record) {
        setHistoryState("error");
        return;
      }

      const next = appendResultHistory(currentRecords, record);
      if (next.added) {
        window.localStorage.setItem(RESULT_HISTORY_STORAGE_KEY, JSON.stringify(next.records));
        trackEvent("result_history_saved", {
          result_type: typeId,
          history_count: next.records.length
        });
      }

      setSavedCount(next.records.length);
      setHistoryState(next.added ? "saved" : "unchanged");
    } catch {
      setHistoryState("error");
    }
  }, [axisScore, encoded, recommendedRoles, typeId, typeName]);

  if (historyState === "error") {
    return (
      <section className="card space-y-2">
        <h2 className="text-xl font-semibold">診断履歴</h2>
        <p className="text-sm text-amber-100">
          このブラウザでは履歴を保存できませんでした。結果URLの共有機能は引き続き利用できます。
        </p>
      </section>
    );
  }

  if (historyState === "loading") {
    return (
      <section className="card space-y-2" aria-busy="true">
        <h2 className="text-xl font-semibold">診断履歴</h2>
        <p className="text-sm text-muted">端末内の履歴を確認しています。</p>
      </section>
    );
  }

  const comparison = previous ? compareAxisScores(axisScore, previous.axisScore) : [];
  const isViewOnly = historyState === "view-only";

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{isViewOnly ? "保存済み結果との比較" : "前回との変化"}</h2>
          <p className="mt-1 text-sm text-muted">結果はこのブラウザ内だけに最大10件保存されます。</p>
        </div>
        <Link
          href="/history"
          className="btn-secondary"
          onClick={() => trackEvent("result_history_opened", { source: "result" })}
        >
          履歴を見る（{savedCount}件）
        </Link>
      </div>

      {previous ? (
        <>
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm">
            <p className="font-semibold text-text">比較対象: {previous.typeName}</p>
            <p className="mt-1 text-muted">{formatCompletedAt(previous.completedAt)}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {comparison.map(({ axis, current, previous: previousScore, delta }) => (
              <div key={axis} className="rounded-lg border border-slate-700 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>{AXIS_LABELS[axis]}</span>
                  <span className={`font-semibold ${deltaClassName(delta)}`}>{deltaText(delta)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {previousScore} → {current}
                </p>
              </div>
            ))}
          </div>

          <Link
            href={previous.resultPath}
            className="inline-flex text-sm font-semibold text-cyan-200 underline underline-offset-4"
            onClick={() => trackEvent("result_history_reopened", { source: "comparison" })}
          >
            比較対象の結果を開く
          </Link>
        </>
      ) : historyState === "saved" ? (
        <div className="rounded-lg border border-cyan-300/30 bg-cyan-400/5 p-3 text-sm text-cyan-100">
          この結果を最初の履歴として保存しました。次回の診断後に8軸の変化を比較できます。
        </div>
      ) : historyState === "unchanged" ? (
        <div className="rounded-lg border border-slate-700 p-3 text-sm text-muted">
          この結果はすでに履歴へ保存されています。結果の再読込では履歴件数は増えません。
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700 p-3 text-sm text-muted">
          共有URLや履歴から開いた結果は自動保存しません。自分で診断を完了した結果だけが履歴へ追加されます。
        </div>
      )}
    </section>
  );
}
