---
name: dsh-find-simplifications
description: Find evidence-backed opportunities to remove dead, duplicated, speculative, over-built, or hand-rolled code without treating complexity, tests, or unused-looking symbols as proof by themselves.
---

# Find Simplifications

Turn a broad cleanup request into a small set of well-supported changes or proposals that reduce owned code, APIs, states, and maintenance obligations while preserving current product behavior.

## Establish context

Read the applicable repository instructions, architecture documentation, tests, and durable design records before judging a subsystem. Identify intentional seams, supported variants, compatibility promises, generated surfaces, and user-visible behavior that must remain.

Tests and design records are evidence, not unquestionable truth. A test that only protects unused behavior may be removed with that behavior; a recorded compatibility or data-format obligation requires stronger evidence before changing it.

## Strong candidates

- A public method, event, option, helper, package, or durable field has no production consumer.
- Tests or documentation are the only consumers and do not protect a current obligation.
- Multiple representations or state flags mirror the same authoritative fact.
- An abstraction exists for one caller without isolating a meaningful lifecycle, safety, transaction, or ownership decision.
- Compatibility, retry, rollback, or defensive machinery protects a scenario the product does not support.
- A maintained dependency or platform builtin would remove substantial implementation and dedicated tests with little glue remaining.
- A feature implements speculative generality without a current product owner or execution path.

Complex code, a large file, one unused-looking symbol, or a tool report alone is not sufficient evidence.

## Prove or reject a candidate

1. Search exact symbols, strings, configuration keys, dynamic registrations, loaders, subprocess entries, and package exports.
2. Classify consumers as production, test/documentation, generated, or ambiguous; inspect ambiguous examples and scripts before deciding.
3. Trace both sides of changed interfaces and identify the user-visible behavior, durable data, lifecycle owner, and failure semantics.
4. For asynchronous code, map timers, listeners, processes, leases, abort signals, readiness promises, and cleanup paths to distinct owners and transitions.
5. For validators and defensive copies, identify where data becomes untrusted or crosses a real process, persistence, network, model, or user-input boundary.
6. Reject the candidate when a current production caller exists and removal would be a feature decision rather than cleanup.
7. Compare net deletion against replacement glue, migrations, documentation churn, and new failure modes.

Use static-analysis tools as discovery aids, never as substitutes for call-site and entrypoint tracing.

## Output and implementation

For each accepted candidate, state:

- the exact surface and owner;
- production-consumer evidence;
- what will be deleted, folded, or made private;
- behavior and compatibility that remain;
- risks and the smallest checks that prove the result.

Review requests report candidates without editing. Change requests implement only well-proven candidates in the lowest owning area, update obsolete tests and documentation, and avoid unrelated formatting or cleanup. Prefer a few meaningful simplifications over a long list of speculative suggestions.
