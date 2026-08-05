import { decodeAnswers } from "@/lib/share";
import { AXIS_KEYS, type AxisKey, type AxisScore, type Role } from "@/lib/types";

export const RESULT_HISTORY_STORAGE_KEY = "lol-type-choice.result-history.v1";
export const RESULT_HISTORY_PENDING_KEY = "lol-type-choice.result-history-pending.v1";
export const RESULT_HISTORY_SCHEMA_VERSION = 1;
export const RESULT_HISTORY_LIMIT = 10;

const ROLE_VALUES: Role[] = ["TOP", "JG", "MID", "ADC", "SUP"];
const RECORD_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const TYPE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface ResultHistoryRecord {
  schemaVersion: typeof RESULT_HISTORY_SCHEMA_VERSION;
  id: string;
  completedAt: string;
  typeId: string;
  typeName: string;
  axisScore: AxisScore;
  recommendedRoles: Role[];
  resultPath: string;
}

export interface ResultHistoryDraft {
  id: string;
  completedAt: string;
  encoded: string;
  typeId: string;
  typeName: string;
  axisScore: AxisScore;
  recommendedRoles: Role[];
}

export interface AxisComparison {
  axis: AxisKey;
  current: number;
  previous: number;
  delta: number;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidCompletedAt = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));

const isValidTypeName = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 80;

const isValidAxisScore = (value: unknown): value is AxisScore => {
  if (!isPlainObject(value) || Object.keys(value).length !== AXIS_KEYS.length) {
    return false;
  }

  return AXIS_KEYS.every((axis) => {
    const score = value[axis];
    return typeof score === "number" && Number.isInteger(score) && score >= 0 && score <= 100;
  });
};

const isValidRoles = (value: unknown): value is Role[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    return false;
  }

  const roles = value.filter((role): role is Role => typeof role === "string" && ROLE_VALUES.includes(role as Role));
  return roles.length === value.length && new Set(roles).size === roles.length;
};

const buildResultPath = (encoded: string): string | null => {
  if (!decodeAnswers(encoded)) {
    return null;
  }

  return `/result?r=${encodeURIComponent(encoded)}`;
};

export const shouldSavePendingResult = (
  pendingEncoded: string | null | undefined,
  encoded: string
): boolean => pendingEncoded === encoded && decodeAnswers(encoded) !== null;

const isValidResultPath = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 256 || !value.startsWith("/result?")) {
    return false;
  }

  try {
    const url = new URL(value, "https://history.invalid");
    const encodedValues = url.searchParams.getAll("r");
    if (
      url.origin !== "https://history.invalid" ||
      url.pathname !== "/result" ||
      url.hash !== "" ||
      [...url.searchParams.keys()].some((key) => key !== "r") ||
      encodedValues.length !== 1
    ) {
      return false;
    }

    const encoded = encodedValues[0];
    return buildResultPath(encoded) === value;
  } catch {
    return false;
  }
};

export const isResultHistoryRecord = (value: unknown): value is ResultHistoryRecord => {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    value.schemaVersion === RESULT_HISTORY_SCHEMA_VERSION &&
    typeof value.id === "string" &&
    RECORD_ID_PATTERN.test(value.id) &&
    isValidCompletedAt(value.completedAt) &&
    typeof value.typeId === "string" &&
    TYPE_ID_PATTERN.test(value.typeId) &&
    isValidTypeName(value.typeName) &&
    isValidAxisScore(value.axisScore) &&
    isValidRoles(value.recommendedRoles) &&
    isValidResultPath(value.resultPath)
  );
};

export const parseResultHistory = (raw: string | null | undefined): ResultHistoryRecord[] => {
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const ids = new Set<string>();
    const records: ResultHistoryRecord[] = [];

    for (const candidate of parsed) {
      if (!isResultHistoryRecord(candidate) || ids.has(candidate.id)) {
        continue;
      }

      ids.add(candidate.id);
      records.push(candidate);
      if (records.length === RESULT_HISTORY_LIMIT) {
        break;
      }
    }

    return records;
  } catch {
    return [];
  }
};

export const createResultHistoryRecord = (draft: ResultHistoryDraft): ResultHistoryRecord | null => {
  const resultPath = buildResultPath(draft.encoded);
  const candidate: ResultHistoryRecord = {
    schemaVersion: RESULT_HISTORY_SCHEMA_VERSION,
    id: draft.id,
    completedAt: draft.completedAt,
    typeId: draft.typeId,
    typeName: draft.typeName.trim(),
    axisScore: { ...draft.axisScore },
    recommendedRoles: [...draft.recommendedRoles],
    resultPath: resultPath ?? ""
  };

  return isResultHistoryRecord(candidate) ? candidate : null;
};

export const appendResultHistory = (
  current: ResultHistoryRecord[],
  record: ResultHistoryRecord
): { records: ResultHistoryRecord[]; added: boolean } => {
  const validCurrent = parseResultHistory(JSON.stringify(current));
  if (!isResultHistoryRecord(record)) {
    return { records: validCurrent, added: false };
  }

  if (validCurrent[0]?.resultPath === record.resultPath) {
    return { records: validCurrent, added: false };
  }

  return {
    records: [record, ...validCurrent.filter((item) => item.id !== record.id)].slice(0, RESULT_HISTORY_LIMIT),
    added: true
  };
};

export const removeResultHistoryRecord = (records: ResultHistoryRecord[], id: string): ResultHistoryRecord[] =>
  parseResultHistory(JSON.stringify(records)).filter((record) => record.id !== id);

export const compareAxisScores = (current: AxisScore, previous: AxisScore): AxisComparison[] =>
  AXIS_KEYS.map((axis) => ({
    axis,
    current: current[axis],
    previous: previous[axis],
    delta: current[axis] - previous[axis]
  }));
