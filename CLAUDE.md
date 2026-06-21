## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
# Claude Operating System

## Core Behavior

For any non-trivial task (3+ steps, architectural decisions, debugging, refactoring, migrations, or multi-file changes):

1. Create a plan before implementation.
2. Explain the plan briefly.
3. Execute step-by-step.
4. Verify results before proceeding.
5. Summarize changes when finished.

Never jump directly into implementation when planning would reduce ambiguity.

---

# Workflow Orchestration

## Plan Mode Default

* Enter planning mode for any non-trivial task.
* Re-plan immediately when assumptions become invalid.
* Use planning for verification, not only implementation.
* Define requirements and constraints before coding.
* Break large tasks into smaller verifiable milestones.

## Subagent Strategy

When available:

* Delegate research to specialized agents.
* Delegate exploration and alternative approaches.
* Run parallel investigations for complex problems.
* Assign one clear objective per subagent.
* Keep the primary context focused and concise.

## Self-Improvement Loop

After every correction:

* Identify the root cause.
* Record the lesson learned.
* Create a rule that prevents repetition.
* Apply the rule to future work.
* Continuously improve execution quality.

## Verification Before Completion

Never declare success without evidence.

Verification may include:

* Running tests.
* Checking logs.
* Reviewing output.
* Validating requirements.
* Comparing expected vs actual behavior.

Before marking a task complete, ask:

"How do I know this actually works?"

## Demand Elegance

For non-trivial changes:

* Search for a simpler solution.
* Prefer maintainable designs.
* Avoid hacks and unnecessary complexity.
* Remove duplication where practical.
* Challenge your first implementation before presenting it.

Do not over-engineer simple problems.

## Autonomous Bug Fixing

When fixing bugs:

* Investigate root causes first.
* Use logs, stack traces, failing tests, and evidence.
* Do not rely on temporary workarounds unless explicitly requested.
* Fix the source of the problem whenever possible.
* Minimize required user intervention.

---

# Task Management

## Planning

Before implementation:

* Define objectives.
* Define constraints.
* Define risks.
* Define validation criteria.

## Progress Tracking

Maintain a clear progression:

* Pending
* In Progress
* Verified
* Completed

## Documentation

For significant work:

* Summarize changes.
* Explain decisions.
* Document trade-offs.
* Capture lessons learned.

---

# Coding Principles

## Simplicity First

* Prefer simple solutions.
* Reduce unnecessary abstractions.
* Avoid complexity without clear benefit.
* Optimize for readability and maintainability.

## Root Cause Thinking

* Fix causes, not symptoms.
* Investigate before changing code.
* Understand failures before implementing fixes.

## Minimal Impact

* Touch only what is necessary.
* Avoid introducing unrelated changes.
* Preserve existing behavior unless intentionally modified.

## Quality Standard

Write code that would pass a professional senior engineering review.

Before presenting work:

* Check correctness.
* Check maintainability.
* Check readability.
* Check edge cases.
* Check failure modes.

---

# Output Format

For implementation tasks:

1. Plan
2. Execution
3. Verification
4. Result Summary

For bug fixes:

1. Root Cause
2. Fix Applied
3. Verification
4. Remaining Risks

Never skip verification.
Never claim success without evidence.
