# Changelog

## 0.4.0 — 16 September 2026

- Added automatic current-draft persistence, up to 50 named browser-local programs, and `.pseudocode`/`.txt` import and export.
- Added accessible line breakpoints, run-to-breakpoint Debug, Step over, Step out, and live breakpoint updates without duplicating interpreter execution.
- Added a browsable call stack with globals and every active routine frame; the current routine is selected automatically.
- Replaced the fixed array preview with 50-element paging across complete 1D/2D bounds.
- Added individual array-element trace choices for small literal-bounded arrays while retaining bounded whole-array traces and CSV/TSV export.
- Added virtual-file import/export and one-state recovery persisted in browser storage.
- Added ten new automated tests for debugger control, call stacks, array paging/tracing and program storage helpers. All 252 version 0.3 tests remain passing.
- Improved keyboard and screen-reader semantics for breakpoint toggles, call-stack navigation, hidden file inputs and debug controls. No dependencies added.

## 0.3.0 — 13 September 2026

- Added persistent browser virtual text files and all four file statements with mode, EOF and handle validation.
- Added interpreter checkpoints, Step/Continue/Stop/Reset and scalar/local/array inspection.
- Added selected-variable trace tables, bounded recording and CSV/TSV export.
- Added block indentation, keyword/declaration completion, syntax references and explicit numbered exam-code paste.
- Accepted unambiguous newlines within parentheses/brackets while preserving error positions.
- Added collapsible panels and F10, Shift+F10 and Ctrl/Cmd+K shortcuts.
- Added six examples (18 total) and 77 tests (252 total), preserving all 175 v0.2 tests.
- Hardened cancellation for unresolved input and cleared stale trace exports when changing runs. No dependencies added.

## 0.2.0 — 12 September 2026

- Extended the existing lexer/parser/AST/interpreter with 1D/2D arrays, custom bounds, indexed expressions and INPUT, element type checks and explicit range errors.
- Added sequential first-match CASE with optional final OTHERWISE.
- Added typed procedures/functions, scalar value parameters, fresh local scopes, RETURN, missing-return errors, forward routine calls and bounded recursion.
- Added LENGTH, LCASE, UCASE, one-based SUBSTRING, ROUND and inclusive-range RANDOM; retained DIV/MOD and prior control-flow semantics.
- Added syntax highlighting without replacing the accessible native editor or adding dependencies.
- Added a Problems panel with source excerpts, carets, source navigation and suggested corrections. Lowercase identifiers now produce non-blocking warnings; ASCII assignment arrows still warn.
- Added six examples (twelve total) and comprehensive extension tests. Updated test execution to use Node's TSX import hook, avoiding a CLI IPC dependency in restricted environments.
- Retained React/TypeScript/Vite, the existing layout, keyboard Run, Stop/Clear and all earlier supported constructs.

Intentional regression-test updates: lowercase declaration names now warn instead of erroring, and incomplete ARRAY syntax now reports the missing bracket rather than saying arrays are unsupported.

Remaining specification work: virtual file handling. See README for explicit runtime limits and presentation limitations.
