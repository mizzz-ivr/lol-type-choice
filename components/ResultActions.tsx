"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

type Props = {
  shareUrl: string;
  shareText: string;
  imagePath: string;
  imageFilename: string;
  comparisonInvitePath?: string | null;
};

type ActionStatus = {
  kind: "success" | "error";
  message: string;
} | null;

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

const fetchResultCard = async (imagePath: string): Promise<Blob> => {
  const response = await fetch(imagePath, {
    method: "GET",
    credentials: "same-origin",
    headers: {
      Accept: "image/png"
    }
  });

  if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "image/png") {
    throw new Error("結果カード画像を取得できませんでした。");
  }

  return response.blob();
};

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

export function ResultActions({
  shareUrl,
  shareText,
  imagePath,
  imageFilename,
  comparisonInvitePath
}: Props) {
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<ActionStatus>(null);

  useEffect(() => {
    setCanNativeShare(typeof navigator.share === "function");
  }, []);

  const reportFailure = (action: string, message: string) => {
    setStatus({ kind: "error", message });
    trackEvent("result_share_failed", { action });
  };

  const handleCopy = async () => {
    setIsProcessing(true);
    setStatus(null);

    try {
      await copyText(shareUrl);
      setStatus({ kind: "success", message: "結果URLをコピーしました。" });
      trackEvent("result_link_copied", { source: "result" });
    } catch {
      reportFailure("copy", "結果URLをコピーできませんでした。ブラウザの権限設定を確認してください。");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    setIsProcessing(true);
    setStatus(null);

    try {
      const blob = await fetchResultCard(imagePath);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = imageFilename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);

      setStatus({ kind: "success", message: "結果カード画像を保存しました。" });
      trackEvent("result_card_downloaded", { format: "png" });
    } catch {
      reportFailure("download", "結果カード画像を保存できませんでした。時間をおいて再度お試しください。");
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
      const shareData: ShareData = {
        title: "LoL Playstyle Type Finder β 診断結果",
        text: shareText,
        url: shareUrl
      };

      try {
        const blob = await fetchResultCard(imagePath);
        const file = new File([blob], imageFilename, { type: "image/png" });
        if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
          shareData.files = [file];
        }
      } catch {
        // ファイル共有に対応しない環境ではテキストとURLだけを共有する。
      }

      await navigator.share(shareData);
      setStatus({ kind: "success", message: "共有メニューを開きました。" });
      trackEvent("result_shared", {
        channel: "native",
        with_image: Boolean(shareData.files?.length)
      });
    } catch (error) {
      if (!isAbortError(error)) {
        reportFailure("native_share", "共有メニューを開けませんでした。ほかの共有方法をお試しください。");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-xl font-semibold">結果を共有・保存</h2>
        <p className="mt-1 text-sm text-muted">診断タイプ・上位3軸・おすすめロール入りの画像を利用できます。</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {canNativeShare ? (
          <button type="button" className="btn-primary" onClick={handleNativeShare} disabled={isProcessing}>
            共有する
          </button>
        ) : null}
        <button type="button" className="btn-primary" onClick={handleDownload} disabled={isProcessing}>
          画像を保存
        </button>
        <button type="button" className="btn-secondary" onClick={handleCopy} disabled={isProcessing}>
          URLをコピー
        </button>
        <a
          href={`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
          onClick={() => {
            trackEvent("result_shared", { channel: "x" });
          }}
        >
          Xで共有
        </a>
        {comparisonInvitePath ? (
          <Link
            href={comparisonInvitePath}
            className="btn-secondary"
            onClick={() => trackEvent("comparison_invite_created", { source: "result" })}
          >
            友だちと比較
          </Link>
        ) : null}
        <Link
          href="/diagnosis"
          className="btn-secondary"
          onClick={() => {
            trackEvent("retake_clicked", { source: "result" });
          }}
        >
          再診断する
        </Link>
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
