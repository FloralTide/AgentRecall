---
name: dsh-trim-cot-leakage
description: Audit or rewrite repository prose that exposes authoring-session reasoning, review history, dead draft references, change narration, or unsupported planning residue while preserving every durable technical fact.
---

# Trim Chain-of-Thought Leakage

Rewrite prose from the repository's present-tense perspective. Preserve facts that maintainers need; remove the transcript of how those facts were discovered, debated, or reviewed.

## Decision test

For every suspect passage, ask whether a reader at the current revision can resolve every reference and verify every claim without access to a chat transcript, review thread, or uncommitted draft.

- If not, restate the durable facts using committed code, documentation, issues, or stable external references.
- If the passage contains no durable fact, remove it.
- If the task is review-only, report the passage and proposed rewrite without editing.

Shorter text is not automatically better. Preserve the actor, behavior, conditions, timing, ownership, failure mode, exceptions, modality, and consequences that remain true.

## Common leakage

- Draft-only citations such as `decision 7`, `audit C2`, phase labels, or sections of an uncommitted plan.
- PR or stack narration such as “this PR adds,” “a later change will,” or “the previous commit.”
- Change narration such as “used to,” “no longer,” “the old implementation,” or “this cut.”
- Review choreography such as “rejected in review” or “the reviewer confirmed.”
- Comments that argue correctness instead of naming the invariant that makes the code safe.
- Control-flow walkthroughs, obvious derivations, and test narration that repeat the implementation.
- Hedges such as “probably fine for now” or unowned deferrals without a tracked issue or TODO.
- Working-language fragments that do not match the surrounding document.

## Keep these

- Issue references and owned TODO/FIXME markers that resolve from the repository.
- Required suppression, coverage-ignore, and best-effort error-handling justifications.
- Present-tense counterfactuals that pin regressions, such as “without this guard, cancellation publishes stale state.”
- Measured bounds whose provenance explains a chosen limit.
- Runtime lifecycle wording such as an old connection draining before a replacement accepts work.
- External standards and committed documents with stable section identifiers.
- Incident timelines and design history in the repository surface that explicitly owns that history.

## Workflow

1. Confirm the requested scope and read the applicable repository instructions.
2. Exclude generated output, vendored code, snapshots, fixtures, and frozen historical records unless the user explicitly includes them. Fix their owning source instead.
3. Search for likely patterns, then read the densest prose semantically; pattern matches are probes, not findings.
4. Enumerate every factual proposition before rewriting. Keep the proposition and remove only its session-specific framing.
5. Update paired translations and generated derivatives through their owning workflow when applicable.
6. Run the narrow documentation, formatting, or behavior checks for the touched surfaces and verify that remaining citations resolve.
