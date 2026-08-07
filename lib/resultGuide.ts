import { resultGuides, type ResultGuide } from "@/data/resultGuides";
import { resultTypes } from "@/data/resultTypes";
import type { ResultType } from "@/lib/types";

const guideByTypeId = new Map(resultGuides.map((guide) => [guide.resultTypeId, guide]));
const typeById = new Map(resultTypes.map((resultType) => [resultType.id, resultType]));

export type ResultTypeGuide = {
  resultType: ResultType;
  guide: ResultGuide;
};

export const getResultGuide = (resultTypeId: string): ResultGuide | null =>
  guideByTypeId.get(resultTypeId) ?? null;

export const getResultTypeGuide = (resultTypeId: string): ResultTypeGuide | null => {
  const resultType = typeById.get(resultTypeId);
  const guide = guideByTypeId.get(resultTypeId);

  if (!resultType || !guide) {
    return null;
  }

  return { resultType, guide };
};

export const getAllResultTypeGuides = (): ResultTypeGuide[] =>
  resultTypes.flatMap((resultType) => {
    const guide = guideByTypeId.get(resultType.id);
    return guide ? [{ resultType, guide }] : [];
  });

export const getResultGuideCoverage = () => {
  const resultTypeIds = new Set(resultTypes.map((resultType) => resultType.id));
  const guideIds = new Set(resultGuides.map((guide) => guide.resultTypeId));

  return {
    missingGuideIds: [...resultTypeIds].filter((id) => !guideIds.has(id)),
    unknownGuideIds: [...guideIds].filter((id) => !resultTypeIds.has(id)),
    duplicateGuideIds: resultGuides
      .map((guide) => guide.resultTypeId)
      .filter((id, index, ids) => ids.indexOf(id) !== index)
  };
};
