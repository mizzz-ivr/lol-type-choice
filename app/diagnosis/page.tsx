"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { questions } from "@/data/questions";
import { ProgressBar } from "@/components/ProgressBar";
import { QuestionCard } from "@/components/QuestionCard";
import { OfficialDisclaimerFaq } from "@/components/OfficialDisclaimerFaq";
import { encodeAnswers } from "@/lib/share";
import { trackEvent } from "@/lib/analytics";
import { RESULT_HISTORY_PENDING_KEY } from "@/lib/resultHistory";
import { isOptionValue } from "@/lib/validation";

const STORAGE_KEY = "lol-type-choice.answers.v2";

const initialAnswers = Array.from({ length: questions.length }, () => null as number | null);

const parseStoredAnswers = (raw: string | null): (number | null)[] | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== questions.length) {
      return null;
    }

    return parsed.map((value) => (isOptionValue(value) ? value : null));
  } catch {
    return null;
  }
};

export default function DiagnosisPage() {
  const router = useRouter();
  const [answers, setAnswers] = useState<(number | null)[]>(initialAnswers);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const hasCompletedRef = useRef(false);
  const hasTrackedAbandonmentRef = useRef(false);
  const answeredCountRef = useRef(0);

  useEffect(() => {
    const restored = parseStoredAnswers(window.sessionStorage.getItem(STORAGE_KEY));
    if (restored) {
      answeredCountRef.current = restored.filter((value) => value !== null).length;
      setAnswers(restored);
    }
    trackEvent("diagnosis_started", { question_count: questions.length, version: "beta" });
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  }, [answers]);

  useEffect(() => {
    const trackAbandonment = () => {
      if (hasCompletedRef.current || hasTrackedAbandonmentRef.current) {
        return;
      }

      hasTrackedAbandonmentRef.current = true;
      trackEvent("diagnosis_abandoned", {
        answered_count: answeredCountRef.current,
        question_count: questions.length
      });
    };

    window.addEventListener("pagehide", trackAbandonment);
    window.addEventListener("popstate", trackAbandonment);

    return () => {
      window.removeEventListener("pagehide", trackAbandonment);
      window.removeEventListener("popstate", trackAbandonment);
    };
  }, []);

  const question = questions[index];
  const answeredCount = useMemo(() => answers.filter((v) => v !== null).length, [answers]);
  const isCurrentAnswered = answers[index] !== null;
  const isComplete = answeredCount === questions.length;

  const onSelect = (value: -2 | -1 | 0 | 1 | 2) => {
    setError(null);
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      answeredCountRef.current = next.filter((answer) => answer !== null).length;
      return next;
    });
    trackEvent("question_answered", { question_id: question.id, question_index: index + 1, value });
  };

  const onNext = () => {
    if (!isCurrentAnswered) {
      setError("回答を選択してください。");
      return;
    }

    if (index === questions.length - 1) {
      if (!isComplete) {
        setError("未回答の設問があります。前の設問を確認してください。");
        return;
      }
      const finalized = answers.map((value) => value ?? 0);
      const encoded = encodeAnswers(finalized);
      if (!encoded) {
        setError("回答データが不正です。最初からやり直してください。");
        return;
      }
      hasCompletedRef.current = true;
      trackEvent("diagnosis_completed", { question_count: questions.length, answer_version: "v2" });
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
        window.sessionStorage.setItem(RESULT_HISTORY_PENDING_KEY, encoded);
      } catch {
        // 保存領域が利用できなくても結果表示は継続する。
      }
      router.push(`/result?r=${encoded}`);
      return;
    }

    setIndex((prev) => prev + 1);
  };

  return (
    <div className="space-y-4">
      <section className="card space-y-2">
        <h1 className="text-2xl font-bold">プレイスタイル診断（β）</h1>
        <p className="text-sm text-muted">全{questions.length}問 / 目安4〜6分。途中離脱しても同じブラウザなら復元されます。</p>
      </section>

      <ProgressBar current={index + 1} total={questions.length} />
      <QuestionCard question={question} value={answers[index] ?? undefined} onSelect={onSelect} />

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <div className="flex items-center justify-between gap-3">
        <button type="button" className="btn-secondary min-w-20" onClick={() => setIndex((prev) => Math.max(0, prev - 1))} disabled={index === 0}>
          前へ
        </button>
        <p className="text-xs text-muted">回答済み: {answeredCount} / {questions.length}</p>
        <button type="button" className="btn-primary min-w-20" onClick={onNext}>
          {index === questions.length - 1 ? "結果を見る" : "次へ"}
        </button>
      </div>

      <OfficialDisclaimerFaq />
    </div>
  );
}
