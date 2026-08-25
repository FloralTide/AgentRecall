export const SKILL_CATEGORY_IDS = ["coding", "writing", "productivity", "explore", "life"] as const;

export type SkillCategoryId = (typeof SKILL_CATEGORY_IDS)[number];

export function isSkillCategoryId(value: unknown): value is SkillCategoryId {
  return typeof value === "string" && SKILL_CATEGORY_IDS.some((categoryId) => categoryId === value);
}
