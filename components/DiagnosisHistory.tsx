"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AXIS_LABELS } from "@/config/axisDisplay";
import { trackEvent } from "@/lib/analytics";
import {
  RESULT_HISTORY_STORAGE_KEY,
  parseResultHistory,
  removeResultHistoryRecord,
  type ResultHistoryRecord
} from "@/lib/resultHistory";
import { AXIS_KEYS } from "@/lib/types";

const formatCompletedAt = (value: string): string =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));

const topAxes = (record: ResultHistoryRecord) =>
  [...AXIS_KEYS]
    .map((axis) => ({ axis, score: record.axisScore[axis] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

export function DiagnosisHistory() {
  const [records, setRecords] = useState<ResultHistoryRecord[] | null>(null);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    try {
      setRecords(parseResultHistory(window.localStorage.getItem(RESULT_HISTORY_STORAGE_KEY)));
      trackEvent("result_history_viewed");
    } catch {
      setStorageError(true);
      setRecords([]);
    }
  }, []);

  const typeCount = useMemo(() => new Set(records?.map((record) => record.typeId) ?? []).size, [records]);

  const persist = (next: ResultHistoryRecord[]) => {
    try {
      if (next.length === 0) {
        window.localStorage.removeItem(RESULT_HISTORY_STORAGE_KEY);
      } else {
        window.localStorage.setItem(RESULT_HISTORY_STORAGE_KEY, JSON.stringify(next));
      }
      setRecords(next);
      return true;
    } catch {
      setStorageError(true);
      return false;
    }
  };

  const deleteRecord = (record: ResultHistoryRecord) => {
    if (!records) return;

    const next = removeResultHistoryRecord(records, record.id);
    if (persist(next)) {
      trackEvent("result_history_deleted", {
        result_type: record.typeId,
        history_count: next.length
      });
    }
  };

  const clearAll = () => {
    if (!records || records.length === 0) return;
    if (!window.confirm("この端末に保存した診断履歴をすべて削除しますか？")) return;

    if (persist([])) {
      trackEvent("result_history_cleared", { deleted_count: records.length });
    }
  };

  if (records === null) {
    return (
      <section className="card" aria-busy="true">
        <p className="text-sm text-muted">端末内の履歴を読み込んでいます。</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-accent">診断結果の振り返り</p>
            <h1 className="mt-1 text-2xl font-bold">診断履歴</h1>
            <p className="mt-2 text-sm text-muted">
              このブラウザに保存された最大10件の結果です。サーバーやほかの端末には同期されません。
            </p>
          </div>
          {records.length > 0 ? (
            <button type="button" className="btn-secondary" onClick={clearAll}>
              すべて削除
            </button>
          ) : null}
        </div>

        {storageError ? (
          <p className="rounded-lg border border-amber-300/40 bg-amber-100/10 p-3 text-sm text-amber-100" role="alert">
            ブラウザの保存領域を利用できません。表示中の履歴操作が保持されない可能性があります。
          </p>
        ) : null}

        {records.length > 0 ? (
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <p className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">保存件数: {records.length}</p>
            <p className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">経験タイプ: {typeCount}</p>
            <p className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">最新: {formatCompletedAt(records[0].completedAt)}</p>
          </div>
        ) : null}
      </section>

      {records.length === 0 ? (
        <section className="card space-y-3 text-center">
          <h2 className="text-xl font-semibold">まだ履歴がありません</h2>
          <p className="text-sm text-muted">診断を完了すると、この端末へ結果が自動保存されます。</p>
          <Link href="/diagnosis" className="btn-primary mx-auto w-fit">
            診断をはじめる
          </Link>
        </section>
      ) : (
        <div className="space-y-3">
          {records.map((record, index) => (
            <article key={record.id} className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">{index === 0 ? "最新の結果" : `${index + 1}件前`}</p>
                  <h2 className="mt-1 text-xl font-semibold">{record.typeName}</h2>
                  <p className="mt-1 text-sm text-muted">{formatCompletedAt(record.completedAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {record.recommendedRoles.map((role) => (
                    <span key={role} className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 text-xs">
                      {role}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {topAxes(record).map(({ axis, score }) => (
                  <div key={axis} className="rounded-lg border border-slate-700 p-3 text-sm">
                    <p className="text-muted">{AXIS_LABELS[axis]}</p>
                    <p className="mt-1 text-lg font-semibold text-cyan-100">{score}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={record.resultPath}
                  className="btn-primary"
                  onClick={() =>
                    trackEvent("result_history_reopened", {
                      source: "history",
                      position: index + 1,
                      result_type: record.typeId
                    })
                  }
                >
                  この結果を開く
                </Link>
                <button type="button" className="btn-secondary" onClick={() => deleteRecord(record)}>
                  この履歴を削除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
