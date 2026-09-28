import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { compile } from './language/parser';
import { Interpreter, parseInput, StoppedError } from './language/interpreter';
import { LanguageError, type DataType, type Diagnostic, type Position } from './language/model';
import { examples } from './examples';
import { highlight } from './language/highlight';
import { Problems } from './Problems';
import { Variables, TracePanel, FilesPanel } from './StatePanels';
import { ProgramPanel } from './WorkspacePanel';
import { DebugGate, TraceRecorder, type Snapshot } from './language/debugger';
import { VirtualFiles, SAMPLE_FILES } from './language/files';
import { completion, enterEdit, examCode, referenceAt, REFERENCE, traceChoices } from './language/editor';
import { saveProgram } from './language/workspace';
const FILE_KEY = 'cie-pseudocode-files-v1';
const FILE_BACKUP_KEY = 'cie-pseudocode-files-backup-v1', DRAFT_KEY = 'cie-pseudocode-draft-v1', PROGRAMS_KEY = 'cie-pseudocode-programs-v1';
function loadFiles() {
  try { const text = localStorage.getItem(FILE_KEY); if (text) return new VirtualFiles(JSON.parse(text)); } catch { /* Fall back to the documented sample when stored data is invalid. */ }
  return new VirtualFiles(SAMPLE_FILES);
}
function storedObject(key: string) { try { const value = JSON.parse(localStorage.getItem(key) ?? '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, string> : {}; } catch { return {}; } }
function loadDraft() { try { return localStorage.getItem(DRAFT_KEY) ?? examples['Welcome & input']; } catch { return examples['Welcome & input']; } }
import './style.css';
type Request = { name: string; type: DataType; position: Position; resolve: (text: string) => void };
type Entry = { text: string; input?: boolean };
function App() {
  const [source, setSource] = useState(loadDraft);
  const [selected, setSelected] = useState('Current draft');
  const [programs, setPrograms] = useState<Record<string, string>>(() => storedObject(PROGRAMS_KEY));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState('Ready to run');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<Diagnostic | null>(null);
  const [warnings, setWarnings] = useState<Diagnostic[]>([]);
  const [request, setRequest] = useState<Request | null>(null);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [fileStore] = useState(loadFiles), [files, setFiles] = useState(() => fileStore.snapshot()), [storageNote, setStorageNote] = useState('');
  const [fileBackup, setFileBackup] = useState<Record<string, string> | null>(() => { const value = storedObject(FILE_BACKUP_KEY); return Object.keys(value).length ? value : null; });
  const [paused, setPaused] = useState(false), [activeLine, setActiveLine] = useState<number | null>(null), [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const gate = useRef<DebugGate | null>(null), trace = useRef<TraceRecorder | null>(null);
  const runtime = useRef<Interpreter | null>(null), arrayPages = useRef<Record<string, number>>({});
  const [breakpoints, setBreakpoints] = useState<Set<number>>(() => new Set());
  const [, refreshTrace] = useState(0);
  const [traceSelected, setTraceSelected] = useState<string[] | null>(null);
  const choices = useMemo(() => { try { return traceChoices(compile(source).program); } catch { return []; } }, [source]);
  const selectedTrace = traceSelected ?? choices.slice(0, 2).map(c => c.id);
  const [suggestions, setSuggestions] = useState<{ prefix: string; items: string[] }>({ prefix: '', items: [] });
  const [suggestionIndex, setSuggestionIndex] = useState(0), [hint, setHint] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false), [pasteText, setPasteText] = useState(''), [pasteNote, setPasteNote] = useState('');
  const controller = useRef<AbortController | null>(null);
  const resetRequested = useRef(false);
  const editor = useRef<HTMLTextAreaElement>(null), gutter = useRef<HTMLDivElement>(null), inputField = useRef<HTMLInputElement>(null), consoleEnd = useRef<HTMLDivElement>(null);
  const highlighted = useMemo(() => source.split("\n").map(line => highlight(line)), [source]);
  const painting = useRef<HTMLPreElement>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  useEffect(() => { if (request) inputField.current?.focus(); }, [request]);
  useEffect(() => { consoleEnd.current?.scrollIntoView({ block: 'nearest' }); }, [entries, request]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, source); } catch { /* Draft remains available in page memory. */ } }, [source]);
  useEffect(() => { try { localStorage.setItem(PROGRAMS_KEY, JSON.stringify(programs)); } catch { /* Named programs remain available in page memory. */ } }, [programs]);
  useEffect(() => fileStore.subscribe(() => {
    const next = fileStore.snapshot();
    setFiles(previous => { if (JSON.stringify(previous) !== JSON.stringify(next)) { setFileBackup(previous); try { localStorage.setItem(FILE_BACKUP_KEY, JSON.stringify(previous)); } catch { /* Main storage warning below is enough. */ } } return next; });
    try { localStorage.setItem(FILE_KEY, JSON.stringify(next)); setStorageNote(''); } catch { setStorageNote('Browser storage is unavailable or full. Files remain usable until this page closes.'); }
  }), [fileStore]);
  const run = async (mode: 'run' | 'debug' | 'trace' = 'run', pauseInitially = true) => {
    if (controller.current) return;
    const control = new AbortController(); controller.current = control; resetRequested.current = false;
    setRunning(true); setPaused(false); setActiveLine(null); setSnapshot(null); setSuggestions({ prefix: '', items: [] });
    trace.current = mode === 'trace' ? new TraceRecorder(selectedTrace) : null;
    arrayPages.current = {};
    gate.current = mode === 'run' ? null : new DebugGate(control.signal, event => {
      setPaused(true); setActiveLine(event.position.line); setSnapshot(event.snapshot); setStatus(`Paused before line ${event.position.line} · ${event.kind.toUpperCase()}`);
      const el = editor.current;
      if (el) { el.scrollTop = Math.max(0, (event.position.line - 4) * parseFloat(getComputedStyle(el).lineHeight)); if (painting.current) painting.current.scrollTop = el.scrollTop; if (gutter.current) gutter.current.scrollTop = el.scrollTop; }
    }, breakpoints, pauseInitially);
    setError(null); setWarnings([]); setEntries([]); setRequest(null); setStatus('Running…');
    try {
      const compiled = compile(source); setWarnings(compiled.warnings);
      const activeRuntime = new Interpreter({ signal: control.signal, files: fileStore, watch: selectedTrace,
        beforeStep: gate.current ? event => gate.current!.before(event) : undefined,
        onStep: mode !== 'run' ? event => { trace.current?.record(event); if (trace.current && event.snapshot.step % 100 === 0) refreshTrace(n => n + 1); } : undefined,
        output: text => setEntries(old => [...old, { text }]),
        input: (name, type, position) => new Promise<string>((resolve, reject) => {
          const abort = () => { control.signal.removeEventListener('abort', abort); reject(new StoppedError()); };
          if (control.signal.aborted) { abort(); return; }
          control.signal.addEventListener('abort', abort, { once: true });
          setInput(''); setInputError(''); setStatus(`Waiting for ${name}`);
          setRequest({ name, type, position, resolve: text => { control.signal.removeEventListener('abort', abort); resolve(text); } });
        })
      });
      runtime.current = activeRuntime;
      await activeRuntime.run(compiled.program);
      if (mode !== 'run') setSnapshot(activeRuntime.snapshot(arrayPages.current));
      setStatus('Completed');
    } catch (err) {
      if (err instanceof StoppedError) setStatus(resetRequested.current ? 'Reset' : 'Stopped');
      else { if (err instanceof LanguageError && err.warnings.length) setWarnings(err.warnings); setStatus('Check your code'); setError(err instanceof LanguageError ? { ...err.position, message: err.message, hint: err.hint } : { line: 1, column: 1, message: err instanceof Error ? err.message : 'Unexpected error.' }); }
    } finally { controller.current = null; gate.current = null; setRunning(false); setPaused(false); setActiveLine(null); setRequest(null); refreshTrace(n => n + 1); }
  };
  const step = () => { if (!controller.current) { void run('debug'); return; } if (paused) { setPaused(false); setStatus('Stepping…'); gate.current?.step(); } };
  const resume = () => { setPaused(false); setActiveLine(null); setStatus('Running…'); gate.current?.continue(); };
  const stepOver = () => { setPaused(false); setStatus('Stepping over…'); gate.current?.stepOver(); };
  const stepOut = () => { setPaused(false); setStatus('Stepping out…'); gate.current?.stepOut(); };
  const reset = () => { resetRequested.current = true; controller.current?.abort(); setRequest(null); setPaused(false); setSnapshot(null); setEntries([]); setError(null); setWarnings([]); setActiveLine(null); trace.current = null; setStatus('Reset'); };
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void run(); }
      else if (event.key === 'F10') { event.preventDefault(); if (event.shiftKey) controller.current?.abort(); else step(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setEntries([]); }
    };
    window.addEventListener('keydown', shortcuts); return () => window.removeEventListener('keydown', shortcuts);
  });
  const edit = (text: string) => { setSnapshot(null); trace.current = null; setSelected('Current draft'); setSource(text); setError(null); setWarnings([]); setStatus('Ready to run'); };
  const toggleBreakpoint = (line: number) => setBreakpoints(current => { const next = new Set(current); if (next.has(line)) next.delete(line); else next.add(line); gate.current?.setBreakpoints(next); return next; });
  const showArrayPage = (id: string, offset: number) => { arrayPages.current = { ...arrayPages.current, [id]: offset }; if (runtime.current) setSnapshot(runtime.current.snapshot(arrayPages.current)); };
  const loadProgram = (name: string, text: string) => { edit(text); setSelected(name); setCursor({ line: 1, column: 1 }); setTraceSelected(null); setBreakpoints(new Set()); };
  const applyEdit = (change: { source: string; cursor: number }) => { edit(change.source); setSuggestions({ prefix: '', items: [] }); requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(change.cursor, change.cursor); }); };
  const acceptSuggestion = (word: string) => { const el = editor.current; if (!el) return; const start = el.selectionStart - suggestions.prefix.length; applyEdit({ source: source.slice(0, start) + word + source.slice(el.selectionEnd), cursor: start + word.length }); setHint(REFERENCE[word] ?? ''); };
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (!request) return;
    try { parseInput(input, request.type, request.position); }
    catch (err) { setInputError((err as Error).message); return; }
    setEntries(old => [...old, { text: input, input: true }]); setRequest(null); setStatus('Running…'); request.resolve(input);
  };
  const locate = (line: number, column: number) => {
    const offset = source.split('\n').slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + column - 1;
    const el = editor.current;
    if (el) {
      el.focus(); el.setSelectionRange(offset, offset + 1);
      el.scrollTop = Math.max(0, (line - 3) * parseFloat(getComputedStyle(el).lineHeight));
      if (painting.current) painting.current.scrollTop = el.scrollTop;
      if (gutter.current) gutter.current.scrollTop = el.scrollTop;
    }
  };
  const insert = (text: string) => {
    const el = editor.current; if (!el) return;
    const start = el.selectionStart, end = el.selectionEnd;
    setSource(source.slice(0, start) + text + source.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length); });
  };
  return <div className="app">
    <header><div className="brand"><span className="mark" aria-hidden="true">←</span><div><h1>Pseudocode Lab</h1><p>CAMBRIDGE IGCSE · 0478 · 2026–2028</p></div></div><span className="milestone">Version 0.4</span></header>
    <main>
      <div className="toolbar"><div className="examples"><label htmlFor="examples">Example</label><select id="examples" disabled={running} value={selected} onChange={e => { const name = e.target.value; setSelected(name); setCursor({ line: 1, column: 1 }); setSource(examples[name as keyof typeof examples]); setError(null); setWarnings([]); setStatus('Ready to run'); setTraceSelected(null); setSnapshot(null); trace.current = null; setSuggestions({ prefix: '', items: [] }); }}>
        <option>Current draft</option>{Object.keys(examples).map(name => <option key={name}>{name}</option>)}
      </select></div><div className="actions"><button className="run" title="Run · Ctrl/Cmd + Enter" onClick={() => void run()} disabled={running}>▶ Run</button><button title="Debug to the first breakpoint" onClick={() => void run('debug', false)} disabled={running}>Debug</button><button title="Step into · F10" onClick={step} disabled={running && !paused}>Step into</button><button title="Step over the current statement" onClick={stepOver} disabled={!paused}>Step over</button><button title="Step out of the current routine" onClick={stepOut} disabled={!paused || (snapshot?.stack.length ?? 0) <= 1}>Step out</button><button title="Continue until a breakpoint, completion or input" onClick={resume} disabled={!paused}>Continue</button><button title="Stop · Shift + F10" onClick={() => controller.current?.abort()} disabled={!running}>Stop</button><button title="Reset execution state; keep code and files" onClick={reset}>Reset</button><button title="Clear console · Ctrl/Cmd + K" onClick={() => setEntries([])}>Clear console</button></div></div>
      <div className="workspace">
        <section className="editor-panel" aria-labelledby="editor-title"><div className="panel-heading"><h2 id="editor-title">Pseudocode</h2><div className="editor-tools"><button className="insert" disabled={running} onClick={() => setPasteOpen(!pasteOpen)}>Paste exam code</button><button className="insert" disabled={running} onClick={() => insert('←')} title="Insert assignment arrow">Insert ←</button></div></div>
          <div className="editor-wrap"><div className="gutter" ref={gutter}>{source.split('\n').map((_, i) => <div key={i} className={error?.line === i + 1 ? 'error-line' : activeLine === i + 1 ? 'active-line' : ''}><button type="button" aria-label={`${breakpoints.has(i + 1) ? 'Remove' : 'Add'} breakpoint at line ${i + 1}`} aria-pressed={breakpoints.has(i + 1)} onClick={() => toggleBreakpoint(i + 1)}><span aria-hidden="true">{breakpoints.has(i + 1) ? '●' : ''}</span>{i + 1}</button></div>)}</div><div className="code-surface"><pre className="code-paint" ref={painting} aria-hidden="true">{highlighted.map((tokens, index) => <div className={activeLine === index + 1 ? 'active-code-line' : undefined} key={index}>{tokens.length ? tokens.map((token, n) => <span title={REFERENCE[token.text.toUpperCase()]} className={token.style ? `syntax-${token.style}` : undefined} key={n}>{token.text}</span>) : '\u00a0'}</div>)}</pre><textarea aria-autocomplete="list" aria-controls={suggestions.items.length ? 'completions' : undefined} aria-activedescendant={suggestions.items.length ? `completion-${suggestionIndex}` : undefined} maxLength={100000} ref={editor} aria-label="Pseudocode editor" spellCheck={false} autoCapitalize="off" autoCorrect="off" readOnly={running} value={source} onChange={e => { edit(e.target.value); const before = e.target.value.slice(0, e.target.selectionStart).split('\n'); setCursor({ line: before.length, column: before.at(-1)!.length + 1 }); setSuggestions(completion(e.target.value, e.target.selectionStart)); setSuggestionIndex(0); setHint(referenceAt(e.target.value, e.target.selectionStart)); }} onScroll={e => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; if (painting.current) { painting.current.scrollTop = e.currentTarget.scrollTop; painting.current.scrollLeft = e.currentTarget.scrollLeft; } }} onSelect={e => { const before = e.currentTarget.value.slice(0, e.currentTarget.selectionStart).split('\n'); setCursor({ line: before.length, column: before.at(-1)!.length + 1 }); setHint(referenceAt(e.currentTarget.value, e.currentTarget.selectionStart)); }} onKeyDown={e => {
            if (e.ctrlKey || e.metaKey || e.altKey || running || e.nativeEvent.isComposing) return;
            if (e.key === 'Escape') { setSuggestions({ prefix: '', items: [] }); return; }
            if (suggestions.items.length && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setSuggestionIndex(i => (i + (e.key === 'ArrowDown' ? 1 : suggestions.items.length - 1)) % suggestions.items.length); return; }
            if (e.key === 'Enter') { e.preventDefault(); if (suggestions.items.length) acceptSuggestion(suggestions.items[suggestionIndex]); else applyEdit(enterEdit(source, e.currentTarget.selectionStart, e.currentTarget.selectionEnd)); }
          }} wrap="off" /></div></div>
          {suggestions.items.length > 0 && !running && <div className="completions" role="listbox" id="completions" aria-label="Code suggestions">{suggestions.items.map((word, index) => <button role="option" aria-selected={index === suggestionIndex} id={`completion-${index}`} key={word} onMouseDown={e => e.preventDefault()} onClick={() => acceptSuggestion(word)}>{word}</button>)}<small>↑ ↓ choose · Enter insert · Esc dismiss</small></div>}
          {hint && <pre className="reference-hint" aria-label="Syntax reference">{hint}</pre>}
          <div className="editor-footer"><span>Ln {cursor.line}, Col {cursor.column}</span><span>Ctrl / ⌘ + Enter to run</span></div>
        </section>
        <section className="console-panel" aria-labelledby="console-title"><div className="panel-heading"><h2 id="console-title">Console</h2><span className="console-label">OUTPUT / INPUT</span></div>
          <div className="console-content" role="log" aria-label="Program output" aria-live="polite" aria-relevant="additions text">{entries.length === 0 && !running ? <div className="empty"><span className="empty-icon" aria-hidden="true">›_</span><h3>Your program starts here.</h3><p>Choose an example or write your own,<br/>then press Run to see the output.</p></div> : entries.map((entry, i) => <div className={entry.input ? 'console-entry input-entry' : 'console-entry'} key={i}>{entry.input && <span aria-label="Input">› </span>}{entry.text || '\u00a0'}</div>)}<div ref={consoleEnd}/></div>
          {request && <form className="input-form" onSubmit={submit}><p className="waiting-label">Program waiting for input:</p><label htmlFor="console-input">{request.name} <span>{request.type}</span></label><div className="input-row"><input id="console-input" ref={inputField} value={input} onChange={e => { setInput(e.target.value); setInputError(''); }} autoComplete="off" aria-invalid={!!inputError} aria-describedby={inputError ? 'input-error' : undefined}/><button type="submit">Submit ↵</button></div>{inputError && <p id="input-error" role="alert">{inputError}</p>}</form>}
          <div className="console-footer">Run resets variables and handles; files are retained.</div>
        </section>
      </div>
      <div className={`status ${error ? 'has-error' : ''}`}><div role="status"><span aria-hidden="true">{error ? '!' : running ? '◷' : '✓'}</span> {status}{error ? `: ${error.message}` : ''}</div></div>
      {pasteOpen && <section className="aux-panel panel-body"><label>Paste numbered exam code<textarea className="exam-text" value={pasteText} onChange={e => setPasteText(e.target.value)} /></label><div className="panel-actions"><button disabled={running} onClick={() => { const result = examCode(pasteText); edit(result.source); setTraceSelected(null); setPasteNote(result.stripped ? 'Printed line numbers removed.' : 'No clear sequential numbering found; text loaded unchanged.'); }}>Load exam code</button><button onClick={() => setPasteOpen(false)}>Close</button></div><p role="status">{pasteNote}</p></section>}
      <ProgramPanel source={source} programs={programs} disabled={running} save={name => setPrograms(current => saveProgram(current, name, source))} load={name => loadProgram(name, programs[name])} remove={name => setPrograms(current => { const next = { ...current }; delete next[name]; return next; })} importProgram={(name, text) => { setPrograms(current => saveProgram(current, name, text)); loadProgram(name, text); }}/>
      <Variables snapshot={snapshot} page={showArrayPage}/>
      <TracePanel choices={choices} selected={selectedTrace} change={setTraceSelected} running={running} recorder={trace.current} start={() => void run('trace')} step={step} resume={resume} paused={paused} reset={() => { trace.current?.reset(); refreshTrace(n => n + 1); }}/>
      <FilesPanel store={fileStore} files={files} disabled={running} storageNote={storageNote} backup={fileBackup} restore={() => { if (fileBackup) fileStore.replace(fileBackup); }}/>
      <details className="aux-panel" open={!!error || warnings.length > 0}><summary>Problems · {error ? '1 error' : '0 errors'} · {warnings.length} warnings</summary><Problems source={source} error={error} warnings={warnings} locate={locate}/></details>
      <details><summary>Syntax & current scope</summary><div className="help"><p>Declare variables before use. Use PascalCase names, upper-case keywords, single quotes for CHAR and double quotes for STRING. Names are case insensitive.</p><p>Use <code>←</code> for assignment, <code>=</code> to compare, and <code>DIV(10, 3)</code> / <code>MOD(10, 3)</code>. Assignments require matching types: use <code>4.0</code> for a REAL variable. Statements go on separate lines; THEN may share the IF line.</p><p>Available: declarations, literal constants, arithmetic, logic, input/output, IF, FOR, WHILE and REPEAT. Also available: 1D/2D arrays, CASE, procedures/functions and Cambridge built-ins. Virtual file handling is supported. Set breakpoints with the line-number buttons; Debug runs to a breakpoint, and Step into/over/out use the interpreter call stack. Define routines before main code. This is an independent learning tool, not an official Cambridge product.</p><p>The current draft and named programs persist locally and can be imported or exported. The editor highlights Cambridge syntax; Tab moves keyboard focus. Enter auto-indents; suggestions use arrow keys and Enter. Files persist locally, support import/export and keep one recoverable previous state.</p></div></details>
    </main><footer>Write. Run. Understand.<span>Runs locally in your browser</span></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
