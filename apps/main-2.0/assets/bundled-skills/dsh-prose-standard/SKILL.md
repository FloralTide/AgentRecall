---
name: dsh-prose-standard
description: Write, review, or trim technical prose in Markdown, JSDoc, comments, prompts, diagnostics, and visible strings while preserving complete contracts and removing repetition or authoring-session narration.
---

# Technical Prose Standard

Write enough to preserve the behavior a reader relies on, then remove repetition, decoration, and reasoning transcripts. A contract is an obligation, invariant, precondition, postcondition, compatibility promise, ownership rule, timing point, or failure behavior.

Prefer the exact subject over vague technical nouns. Use terms such as contract, boundary, shape, surface, seam, or gate only when they name the actual caller obligation, process/security boundary, field set, component split, or enforced check.

## Scope and authority

Require a concrete file, directory, document, diff, or other bounded scope before a prose-wide audit. Read applicable repository instructions and owning code first. Review requests report findings; rewrite or cleanup requests may edit within the authorized scope.

Honor repository exclusions. Treat vendored code, generated catalogs, snapshots, fixtures, and frozen historical records as derivative or immutable: update their owner or generator instead of casually rewriting them.

## Preserve the complete proposition

Before editing a passage, identify every relevant:

- actor and action;
- condition, timing, and ordering;
- requirement, permission, or prohibition;
- negative guarantee and exception;
- ownership, side effect, failure mode, and consequence.

Remove words only when those facts survive more clearly. Keep non-obvious rationale when omitting it could cause misuse or a tempting but incorrect simplification. Put extended architecture, history, and examples in one owning document and link to it; repeat only the local facts required for safe use.

## Coverage by location

- **Public JSDoc:** returns, errors, side effects, ownership, timing, cancellation, and durability that callers cannot infer from types.
- **Internal comments:** non-local invariants, race ordering, security decisions, ownership, and surprising failures; never obvious control flow.
- **Module documentation:** the module's role, dependencies, responsibilities, and non-obvious placement.
- **Tests:** only why a fixture, platform exception, real entry path, or indirect observation is necessary.
- **Guides and READMEs:** prerequisites, real entry paths, current configuration and defaults, observable verification, failures, limits, and extension points.
- **Design records and postmortems:** durable rationale, alternatives, consequences, evidence, causal sequence, and prevention rather than implementation walkthroughs.
- **Skills and agent instructions:** discriminating trigger conditions, scope limits, decision rules, and necessary workflow without generic capability tutorials.
- **Prompts and visible strings:** wording is behavior; verify generated output, snapshots, and user next actions.
- **Diagnostics:** identify the failing subject, violated rule, and corrective action without exposing internal stacks by default.

## Workflow

1. Confirm scope, task type, current revision, and applicable instructions.
2. Read the owning behavior before judging its prose.
3. Classify candidates as keep, add, trim, restore, restructure, or defer.
4. Update authoritative prose before translations, catalogs, snapshots, or generated copies.
5. Apply clear changes only when authorized; do not manufacture edits to meet a deletion target.
6. Run the narrow documentation, formatting, generation, snapshot, or behavior checks for touched surfaces.
7. Report inspected scope, changes, deliberate keeps, unresolved ambiguities, and checks actually run.
