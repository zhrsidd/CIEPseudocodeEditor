# Version 0.4.0 validation

Validated locally on 16 September 2026 with Node 26.8.1, React 19, TypeScript 5.9 and Vite 7.3.6.

| Check | Result |
| --- | --- |
| `npm test` | **262 passed, 0 failed, 0 cancelled, 0 skipped** |
| `npm run typecheck` | Passed; no TypeScript errors |
| `npm run build` | Passed; 43 modules, production assets emitted to `dist/` |
| Browser smoke tests | Passed in the Codex in-app browser |

All 252 version 0.3 tests remain passing. Ten version 0.4 tests cover run-to-breakpoint and live breakpoint replacement, step-over, step-out, nested caller frames, arbitrary array pages, individual array-element traces, generated element choices, saved-program validation and import normalization.

## Browser smoke checks

- Saved a named program and reloaded the page; both the named item and current draft remained available.
- Added a breakpoint inside `SumSquare`, used Debug to pause there, and confirmed both parameters and the Global/SumSquare call-stack frames were exposed.
- Used Step out to return to the caller at line 6, then Step over to finish the second function call without pausing inside it. Output remained 500 and 26.
- Debugged a 120-element array, paged 1–50, 51–100 and 101–120, and confirmed `A[110]` displayed 9 on the final page.
- Selected only `A[2]` for tracing; its two rows changed from uninitialized to 7 while the program printed 7.
- Edited FileA.txt and restored the previous complete virtual-file state successfully.
- Inspected the desktop UI, accessible breakpoint labels, frame selector/list, file controls and native editor/input controls.

Import controls and download generation have unit coverage for validation/normalization and were inspected in the browser. Automated browser upload was intentionally omitted from the smoke run because it would require selecting a host file. This is not a formal screen-reader certification or a multi-browser end-to-end suite.
