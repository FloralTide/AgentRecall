import { describe, expect, it } from "vitest";
import type { ManagedSkill } from "../../../../core/managed-skill-library";
import {
  categoryGroupOrder,
  categoryLabel,
  filterManagedSkills,
  type ManagedSkillCategoryGroup,
} from "./skill-library-list";

describe("managed Skill categories", () => {
  const skills = [
    managedSkill("review", "Code review", "coding"),
    managedSkill("prose", "Prose standard", "writing"),
    managedSkill("imported", "Imported Skill", null, "local"),
  ];

  it("filters by category independently from origin", () => {
    expect(filterManagedSkills(skills, "", "coding", "all", "name").map((skill) => skill.managedId))
      .toEqual(["review"]);
    expect(filterManagedSkills(skills, "", "uncategorized", "local", "name").map((skill) => skill.managedId))
      .toEqual(["imported"]);
    expect(filterManagedSkills(skills, "", "writing", "local", "name")).toEqual([]);
  });

  it("orders the five system categories before uncategorized and localizes their labels", () => {
    const categories: ManagedSkillCategoryGroup[] = ["life", "uncategorized", "writing", "coding", "explore", "productivity"];
    expect(categories.sort((left, right) => categoryGroupOrder(left) - categoryGroupOrder(right))).toEqual([
      "coding",
      "writing",
      "productivity",
      "explore",
      "life",
      "uncategorized",
    ]);
    expect(categoryLabel("coding", "zh")).toBe("编程");
    expect(categoryLabel("uncategorized", "zh")).toBe("未分类");
  });
});

function managedSkill(
  managedId: string,
  name: string,
  categoryId: ManagedSkill["categoryId"],
  originKind: ManagedSkill["origin"]["kind"] = "builtin",
): ManagedSkill {
  return {
    id: `agent-recall-v2:${managedId}`,
    managedId,
    name,
    description: "fixture",
    agent: "codex",
    source: "agent-recall-v2",
    path: `/managed/${managedId}/SKILL.md`,
    directoryPath: `/managed/${managedId}`,
    rootPath: "/managed",
    markdown: `# ${name}`,
    mtimeMs: 1,
    origin: { kind: originKind, label: originKind },
    categoryId,
    installations: [],
  };
}
