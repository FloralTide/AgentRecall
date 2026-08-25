---
name: dsh-code-review
description: Review a branch or pull request for correctness, lifecycle, security, compatibility, and missing behavior using the target repository's own instructions and live base/head rather than DeepSeek Harness-specific commands.
---

# Code Review

Produce a findings-first review grounded in the live diff, surrounding implementation, current consumers, and the target repository's rules. Prefer one substantiated blocker over many speculative nits.

## Orient the review

1. Read the applicable `AGENTS.md` files and owning subsystem documentation.
2. Verify the live base and exact head. Refresh them after a retarget, merge, or new commit.
3. Inspect the diff, then read enough unchanged code, tests, call sites, and entrypoints to understand behavior and ownership.
4. Identify which checks ran, but do not treat green automation as semantic proof.

## Review priorities

- **Correctness and contracts:** trace both sides of changed interfaces, including errors, cancellation, ordering, durability, and compatibility.
- **Lifecycle and concurrency:** verify ownership and deterministic cleanup for timers, listeners, subprocesses, watchers, leases, callbacks, and temporary resources.
- **Security and enforcement:** follow permissions and validation to the operation that performs the action; check alternate callers and renderer/main or client/server boundaries.
- **Consumer fit:** challenge new public APIs, options, abstractions, compatibility paths, and duplicated state without current consumers.
- **Untrusted data:** validate files, durable records, IPC, network, subprocess, model/tool JSON, and user input at their real boundaries without duplicating same-process type checks.
- **Bounds:** apply limits to the complete retained or emitted value, including wrappers, metadata, multibyte input, and oversized single items.
- **Tests:** require observable behavior through the shipped entry path and a negative control that would fail for the intended regression.
- **Documentation and prose:** verify current behavior, defaults, configuration, failures, and limitations. Remove review history and implementation narration from durable surfaces.
- **Packaging and platforms:** check generated assets, install/update paths, browser safety, and Windows/macOS differences when the diff crosses those surfaces.

## Reporting

Each finding states the defect, tightest location, impact, trigger, and evidence. Use the repository's priority convention when one exists. Separate blockers from suggestions, omit issues already fully enforced by a required green gate, and say explicitly when no actionable findings remain.

Review-only requests do not authorize fixes, pushes, comments, or merges. When receiving a review comment, verify the claim against code and behavior before accepting or rebutting it.
