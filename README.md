# Pseudocode Lab

Version 0.4.0: an independent browser IDE for Cambridge IGCSE Computer Science 0478 (2026–2028). Built with React, TypeScript and Vite. It uses a real lexer → parser → typed AST interpreter; it never executes pseudocode as JavaScript, uses `eval`, or translates lines into executable JS.

## Run locally

Install Node.js 22.12+ (or a newer supported LTS release) and npm. In this project folder:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`. Keep the terminal running. To check or preview a production build:

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

Open the preview URL printed by Vite. The zip also includes the tested `dist/` build; serve that directory with a local static HTTP server. Double-clicking `index.html` is not supported. The development and preview servers bind only to the local computer. The app requires no backend, account, API keys or database.

Browser requirements: a modern browser with JavaScript, ES2022 support and localStorage for file persistence. Clipboard copy works on localhost/secure contexts; a selectable text fallback is included. Tested in the Codex in-app browser; other browsers have not received a full compatibility audit.

## Using the IDE

- Choose one of eighteen examples, or replace the editor with your program. Switching examples replaces the editor contents.
- **Run** (or Ctrl/Command+Enter in the editor) clears the console and starts with fresh variables.
- **Debug** runs to the first breakpoint. Click an accessible line-number button to add or remove a breakpoint.
- **Step into**, **Step over** and **Step out** follow routine calls through the interpreter. Continue runs until a breakpoint, completion or INPUT.
- **Stop** cancels execution, including a pending INPUT request.
- Enter data in the console without enclosing quotes. Invalid input displays a helpful message and allows a retry.
- **Clear console** removes output without changing the editor or program state.
- **Insert ←** inserts the assignment arrow at the editor cursor.
- The Problems panel separates fatal errors from style warnings. Each entry includes its line/column, source excerpt, caret and a suggested correction when practical. Click an entry to select its source location. Warnings do not prevent execution.

The editor has line numbers, accessible breakpoint toggles, an error-line marker, a run shortcut and Cambridge syntax highlighting for keywords, types, booleans, strings, characters, numbers, comments, operators and built-ins. It retains a native accessible textarea with an inert colour layer; incomplete code remains editable. Prefix completion offers keywords and declared names; use arrows and Enter to accept, or Escape to dismiss. Enter indents blocks and aligns closing keywords. Selecting a keyword shows a concise syntax reference. Tab moves keyboard focus instead of trapping it in the editor. Panels stack on narrow screens.

The active draft is saved automatically in local browser storage. The Programs panel can save up to 50 named programs, reopen or delete them, import `.pseudocode`/`.txt`, and export the current source. Imports normalize CRLF to LF and are limited to 100,000 characters. Browser storage clearing removes local drafts and saved programs, so export important work.

## Syntax basis

The authoritative basis is the user's uploaded **Pasted text.txt**, the pseudocode guidance from syllabus pages 35–48, recovered from the referenced conversation's attachment. Its local attachment was available under a temporary macOS path; the original `/mnt/data/Pasted text.txt` path was not mounted here. Implementation follows the supplied guidance rather than the earlier conversational summary. This is a milestone implementation, not a claim of full Cambridge compliance or endorsement.

### Implemented

| Area | Supported syntax |
| --- | --- |
| Comments | `//` to end of line, including inline comments |
| Variables | `DECLARE Name : INTEGER` and REAL / STRING / CHAR / BOOLEAN |
| Literals | Integers, decimal reals, single-quoted characters, double-quoted strings, TRUE / FALSE |
| Constants | `CONSTANT Rate ← 6.50`; signed numeric literals accepted; expressions rejected |
| Assignment | `Name ← expression`; `<-` accepted with a Cambridge-style warning |
| Arithmetic | `+ - * / ^`, parentheses, unary `+` and `-` |
| Integer operations | `DIV(a, b)` and `MOD(a, b)`; both require INTEGER arguments |
| Comparison | `= <> < <= > >=` |
| Logic | `AND OR NOT`, with BOOLEAN operands |
| Input/output | `INPUT Name`; comma-separated `OUTPUT` expressions |
| Selection | IF / THEN / ELSE / ENDIF; optional ELSE; nested blocks |
| Counted loops | FOR / TO / STEP / NEXT; inclusive bounds; negative steps |
| Precondition loops | WHILE / DO / ENDWHILE |
| Postcondition loops | REPEAT / UNTIL |
| Arrays | `DECLARE A : ARRAY[-2:5] OF INTEGER`; 1D/2D bounds, index expressions, reads, writes and INPUT |
| CASE | `CASE OF Move`, literal labels, sequential first match, optional final OTHERWISE |
| Procedures | PROCEDURE / ENDPROCEDURE, typed value parameters, `CALL Name(...)` |
| Functions | FUNCTION / RETURNS / RETURN / ENDFUNCTION; calls in any expression |
| Library routines | LENGTH, LCASE, UCASE, SUBSTRING, ROUND, RANDOM |
| Text files | OPENFILE with READ/WRITE, READFILE, WRITEFILE, CLOSEFILE |

`THEN` can appear on the next line, as in the guidance, or at the end of the IF line. DO can also appear on the next line. Indentation is cosmetic. Put each executable statement on its own line; use Paste exam code to remove clear sequential printed line numbers. Newlines inside parentheses and square brackets are accepted; arbitrary bare continuation lines are rejected. CRLF and LF files work. Typographic quote delimiters and minus signs found in the supplied text are accepted, along with normal keyboard quotes and hyphens. Quoted text has no backslash escape language.

### Type and naming rules

Keywords must be upper case and cannot be used as identifiers. Names may contain only ASCII letters and digits. Lowercase initial letters now generate non-blocking PascalCase warnings; conventional single-letter index names are accepted without warnings. All name lookup is case insensitive. `CountDown` and `Countdown` therefore cannot be separate declarations. There is no attempt to infer word boundaries within a PascalCase name.

Variables must be declared and assigned before being read. Duplicate declarations, assigning/inputting into constants, wrong data types, non-Boolean conditions, division by zero and out-of-range numbers produce errors.

Assignments match types exactly, as stated in the guidance: use `Hours ← 4.0` for a REAL variable. INTEGER is not silently promoted during assignment; STRING and CHAR remain distinct. Arithmetic mixes INTEGER and REAL operands and returns REAL when either operand is REAL; `/` always returns REAL. Numeric comparisons can mix INTEGER and REAL. String/character comparisons require matching types; BOOLEAN supports only equality/inequality.

## Explicit implementation choices

The guidance is an exam notation rather than a complete programming-language standard. The following policies make unspecified behavior predictable and testable:

- Precedence, highest first: exponentiation; unary numeric sign; multiplication/division; addition/subtraction; comparisons; NOT; AND; OR. Exponentiation associates right, so `2 ^ 3 ^ 2 = 512` and `-2 ^ 2 = -4`. Use parentheses when in doubt.
- AND/OR evaluate both operands. No short-circuit assumption should be made.
- DIV truncates towards zero. MOD uses the corresponding signed remainder, so `DIV(-10, 3) = -3` and `MOD(-10, 3) = -1`.
- REAL uses JavaScript IEEE-754 floating point; rounding artifacts are possible. INTEGER is limited to safe integers (±9,007,199,254,740,991). Non-finite results and unsafe integer results fail explicitly. Negative integer powers produce REAL.
- FOR start/end/step expressions are evaluated once at entry. STEP must be a nonzero INTEGER. The counter is assigned each inclusive iteration value, and retains the last value after the loop. A zero-iteration loop leaves it unchanged. Changing the counter in the body does not change the iteration schedule.
- Declarations execute when reached in the current scope. The main program has a global environment; every routine call gets a fresh local environment. Re-executing a declaration inside a loop in the same call is a duplicate declaration error; put declarations before loops.
- CHAR means one Unicode code point. Text ordering uses JavaScript's UTF-16 ordering, not locale-specific collation. Visually combined emoji may consist of multiple code points.
- INPUT converts by the declared type. Numeric input accepts an optional sign and surrounding whitespace; REAL input also accepts whole-number text. BOOLEAN input requires TRUE/FALSE. STRING input preserves whitespace. Numeric exponent notation is not accepted.
- A run is limited to 64 nested routine calls, 100,000 cumulatively declared array elements, 100,000 execution steps and output to 100,000 characters or 2,000 lines. The runtime yields to the browser every 200 steps so Stop stays responsive, even in empty loops. Source length and nesting are bounded to avoid pathological parser input.
- Errors in expressions/statements are checked when reached; this is not a whole-program static type checker. Syntax errors are detected before execution. The first error stops the run while retaining earlier output.

## Architecture

- `src/language/lexer.ts`: source scanning, typed literal tokens, positions and convenience warnings.
- `src/language/parser.ts`: recursive-descent statements plus precedence-climbing expressions; emits typed AST nodes.
- `src/language/model.ts`: value types, AST structures and source-aware errors.
- `src/language/interpreter.ts`: global/local environments, array storage, routine frames, explicit type checks, asynchronous AST execution, I/O, cancellation and limits. Independent of React and the DOM.
- `src/language/builtins.ts`: typed library routines and injectable randomness.
- `src/language/highlight.ts`: tolerant presentation-only token scanner (not the execution parser).
- `src/language/diagnostics.ts`: source/caret formatting.
- `src/language/files.ts`: virtual storage and per-run file sessions.
- `src/language/debugger.ts`: pause gate, snapshots and trace recording/export.
- `src/language/editor.ts`: completion, indentation, exam paste and reference helpers.
- `src/language/workspace.ts`: saved-program validation and import/export naming.
- `src/StatePanels.tsx`: variables, trace and virtual file panels.
- `src/WorkspacePanel.tsx`: named programs and browser import/export controls.
- `src/Problems.tsx`: separate errors/warnings panel.
- `src/main.tsx`: highlighted editor/console UI and input promise adapter.
- `src/examples.ts` and `examples/`: runnable learning programs.
- `src/language/interpreter.test.ts`, `extensions.test.ts`, `v030.test.ts` and `v040.test.ts`: automated regression and extension tests.

For extension, add lexer tokens and AST node kinds, parse them, then implement their runtime semantics. Keep source locations throughout. A future Worker-based execution adapter can reuse the language modules.

## Arrays, routines and library rules

```text
PROCEDURE DisplayMessage(Message : STRING)
    OUTPUT Message
ENDPROCEDURE

FUNCTION SumSquare(A : INTEGER, B : INTEGER) RETURNS INTEGER
    RETURN A * A + B * B
ENDFUNCTION

DECLARE Scores : ARRAY[0:2] OF INTEGER
Scores[0] ← SumSquare(3, 4)
CALL DisplayMessage("The result is")
OUTPUT Scores[0]
```

- Array bounds and indices must evaluate to INTEGER. Bounds are evaluated once when declared. One or two dimensions are supported, including zero and negative lower bounds. Elements start uninitialized. Reads, writes and INPUT validate index count and range, and errors show the complete declared range. Whole-array expressions or assignments are not supported.
- CASE selects a variable (an indexed element also works). Each branch begins with one literal followed by a colon and one statement. OTHERWISE has no colon and must come last. Labels are tested sequentially, the first match executes, and no fall-through occurs. All five scalar types work; numeric INTEGER/REAL comparisons follow the existing comparison policy. Other label/selector type mismatches fail when reached. A structured statement can occupy a branch; it still counts as the branch's one statement.
- Define all procedures/functions at the beginning, before declarations or executable main code. Definitions are registered together, so routines can call other routines in that initial section. Duplicate routine/parameter names are rejected case-insensitively. Nested definitions are not supported.
- Parameters are scalar and passed by value. A routine sees its own locals plus globals, not its caller's locals. Locals/parameters shadow globals. Assigning an unshadowed global intentionally changes it. Parameters and returns require exact declared types. Array elements can be passed as scalar arguments; whole-array parameters are not supported.
- Zero-parameter procedures accept `CALL Name` or `CALL Name()`. Zero-parameter functions accept `Name()`; a bare function name also calls it when no variable with that name exists. CALL accepts only procedures; procedures cannot be used in expressions.
- RETURN exits a function immediately, including from nested selection/loops. Reaching ENDFUNCTION without a RETURN is a runtime error. Recursion works with fresh frames, bounded to 64 simultaneous calls. Functions may use INPUT/OUTPUT; expression operands and arguments evaluate sequentially from left to right. Stop cancels pending input inside routines.
- LENGTH requires STRING and counts Unicode code points. LCASE/UCASE accept STRING or CHAR and preserve that type. A CHAR conversion that expands into multiple code points (for example uppercase ß) raises an error rather than silently changing its type.
- SUBSTRING requires STRING, INTEGER start and INTEGER length. Both numbers must be positive, position 1 is the first character, and the complete requested range must exist. Out-of-range substrings are errors, not silently truncated.
- ROUND requires REAL value and INTEGER places. This implementation supports 0–15 decimal places and returns REAL. Decimal ties round away from zero (for example `ROUND(-1.25, 1)` is -1.3). Cambridge does not specify tie-breaking. It rounds the decimal representation of the already-evaluated floating-point value; it cannot eliminate earlier arithmetic rounding.
- RANDOM returns REAL on a uniform 32-bit discrete grid from 0 through 1, including both endpoints. It is intended for learning examples, not cryptography.

## Debugging and tracing

**Step into (F10)** starts a fresh debug run paused before the first statement. Each subsequent Step into executes the next logical operation and enters called routines. **Debug** starts without the initial pause and runs to an enabled breakpoint. **Continue** runs to the next breakpoint, completion or INPUT. **Step over** completes the current statement without pausing inside routines it calls. **Step out** completes the current routine and pauses at the next caller statement. **Stop (Shift+F10)** cancels a paused, running or input-waiting program. **Reset** also clears console, variables, trace and errors; it retains source and virtual file contents. **Clear console (Ctrl/Cmd+K)** only clears output.

Loop tests and FOR counter updates have checkpoints, including final termination tests; NEXT and UNTIL use their own source lines. Stepping enters procedure/function bodies and returns naturally to the caller. Debug controls include step into, over and out; backward execution is not implemented.

Variables shows type, value and scope. The call-stack list and frame selector expose globals plus every active procedure/function frame; entering a routine selects its frame. Uninitialized values display —. Arrays are paged 50 elements at a time across their complete declared bounds, with compact coordinate labels for 2D arrays. Successful debug completion retains the final global snapshot; Reset clears it.

Open Trace table, select variables or individual elements of a literal-bounded array of at most 100 elements, then Start trace. Step trace and Continue trace share the same interpreter checkpoints. Rows record selected-value or scope changes, rather than every unchanged statement. Scope entry/exit can share a step number. CSV and TSV exports include headers and quote delimiters/newlines correctly; an export text box is provided if clipboard access fails. Reset trace clears recorded rows. Traces stop collecting after 1,000 rows; values are capped at 1,000 characters and whole-array watches show their first 10 elements. Program execution continues after the trace cap.

## Virtual text files

The Files panel supports creating, editing, renaming, deleting, importing/exporting text files, and resetting to the included FileA.txt sample. It keeps one previous complete file-state snapshot that can be restored after an edit, import, rename, deletion, reset or pseudocode write. Contents and the recovery snapshot persist in this browser using localStorage. Browser storage clearing or private browsing can remove them; storage failures are shown. Files are browser-local text, with no access to host paths or the network.

```text
DECLARE LineOfText : STRING
OPENFILE "FileA.txt" FOR READ
OPENFILE "FileB.txt" FOR WRITE
READFILE "FileA.txt", LineOfText
WRITEFILE "FileB.txt", LineOfText
CLOSEFILE "FileA.txt"
CLOSEFILE "FileB.txt"
```

READ requires an existing file. WRITE creates or truncates immediately. READFILE advances one line and assigns it using the target's declared type; WRITEFILE writes the named variable/array element followed by a newline. Embedded newlines in a value are rejected. An empty file has zero lines; a terminal newline does not create a phantom extra line. CRLF is normalized. Reading past the end, double-opening, using a closed file or the wrong mode raises a source-positioned error. EOF/APPEND are not extensions of the supplied syntax here.

Each run starts with fresh handles/cursors and always closes handles on completion, error or Stop. Writes already made are retained, including when execution is stopped. File editing is locked during execution. Filenames are case-sensitive, 1–120 characters, with no slashes or control characters; storage is limited to 100 files and one million text characters in total.

## Remaining specification limitations and version 0.5 priorities

The statement families in the supplied guidance are implemented, including arrays, CASE, routines, built-ins and virtual files. This is an executable interpretation, not official Cambridge certification. Indentation is cosmetic; arbitrary line wrapping and direct numbered source are unsupported. The numeric, array, nesting, output, trace and ROUND limits documented above are implementation restrictions.

Beyond the supplied scalar-parameter syntax, there is no whole-array passing/returning, whole-array assignment, arrays above 2D, nested routine definitions, or pass-by-reference extension. Program and virtual-file transfer uses explicit browser import/export controls; interpreted pseudocode still has no host filesystem or network access. Breakpoints are line based and are not persisted with the draft. There are no conditional breakpoints, editable runtime values or backward execution.

Suggested 0.5 priorities: move long execution into a Web Worker; add conditional breakpoints and watch expressions; add a project bundle export containing source plus virtual files; support several recovery revisions; and add automated cross-browser and screen-reader regression checks.

## Validation

See `TESTING.md` for the exact results and `CHANGELOG.md` for this iteration’s changes. Re-run `npm test` and `npm run build` after changing the language or UI. The lockfile pins the tested dependency tree.
