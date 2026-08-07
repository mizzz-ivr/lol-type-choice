"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

type Props = {
  mode: "invite" | "result";
  shareUrl: string;
  shareText: string;
  restartPath?: string | null;
};

type ActionStatus = {
  kind: "success" | "error";
  message: string;
} | null;

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

const copyText = async (value: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("URLをコピーできませんでした。");
  }
};

export function ComparisonActions({ mode, shareUrl, shareText, restartPath }: Props) {
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<ActionStatus>(null);

  useEffect(() => {
    setCanNativeShare(typeof navigator.share === "function");
  }, []);

  const handleCopy = async () => {
    setIsProcessing(true);
    setStatus(null);

    try {
      await copyText(shareUrl);
      setStatus({
        kind: "success",
        message: mode === "invite" ? "比較招待URLをコピーしました。" : "比較結果URLをコピーしました。"
      });
      trackEvent("comparison_link_copied", { mode });
    } catch {
      setStatus({ kind: "error", message: "URLをコピーできませんでした。ブラウザの権限設定を確認してください。" });
      trackEvent("comparison_share_failed", { mode, action: "copy" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator.share !== "function") {
      return;
    }

    setIsProcessing(true);
    setStatus(null);

    try {
      await navigator.share({
        title: mode === "invite" ? "LoL診断でプレイ傾向を比較" : "LoL診断の比較結果",
        text: shareText,
        url: shareUrl
      });
      setStatus({ kind: "success", message: "共有メニューを開きました。" });
      trackEvent("comparison_shared", { mode, channel: "native" });
    } catch (error) {
      if (!isAbortError(error)) {
        setStatus({ kind: "error", message: "共有メニューを開けませんでした。ほかの共有方法をお試しください。" });
        trackEvent("comparison_share_failed", { mode, action: "native_share" });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-xl font-semibold">{mode === "invite" ? "友だちを招待" : "比較結果を共有"}</h2>
        <p className="mt-1 text-sm text-muted">
          {mode === "invite"
            ? "招待URLを受け取った人が診断を完了すると、8軸を並べて比較できます。"
            : "比較URLには2件の診断回答トークンが含まれます。個人情報や戦績は含まれません。"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {canNativeShare ? (
          <button type="button" className="btn-primary" onClick={handleNativeShare} disabled={isProcessing}>
            共有する
          </button>
        ) : null}
        <button type="button" className="btn-primary" onClick={handleCopy} disabled={isProcessing}>
          {mode === "invite" ? "招待URLをコピー" : "比較URLをコピー"}
        </button>
        <a
          href={`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
          onClick={() => trackEvent("comparison_shared", { mode, channel: "x" })}
        >
          Xで共有
        </a>
        {restartPath ? (
          <Link
            href={restartPath}
            className="btn-secondary"
            onClick={() => trackEvent("comparison_invite_restarted", { source: "comparison_result" })}
          >
            別の友だちと比較
          </Link>
        ) : null}
      </div>

      {status ? (
        <p
          className={`text-sm ${status.kind === "success" ? "text-cyan-200" : "text-rose-300"}`}
          role="status"
          aria-live="polite"
        >
          {status.message}
        </p>
      ) : null}
    </section>
  );
}
