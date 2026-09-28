import { useEffect, useRef, useState } from 'react';
import { formatValue, type Snapshot, type TraceRecorder } from './language/debugger';
import { SAMPLE_FILES, type VirtualFiles } from './language/files';
import { downloadText } from './WorkspacePanel';
export function Variables({ snapshot, page }: { snapshot: Snapshot | null; page: (id: string, offset: number) => void }) {
  const [frameId, setFrameId] = useState('GLOBAL');
  useEffect(() => { if (snapshot) setFrameId(snapshot.stack.at(-1)?.id ?? 'GLOBAL'); }, [snapshot?.scope]);
  const frame = snapshot?.stack.find(item => item.id === frameId) ?? snapshot?.stack.at(-1);
  return <details className="aux-panel" open={!!snapshot}><summary>Variables {snapshot ? `· ${snapshot.scope}` : ''}</summary>
    {!snapshot ? <p>Use Step or Start trace to inspect variables.</p> : <div className="panel-body"><label>Call stack frame<select value={frame?.id ?? 'GLOBAL'} onChange={e => setFrameId(e.target.value)}>{[...snapshot.stack].reverse().map((item, index) => <option value={item.id} key={item.id}>{index === 0 ? '▸ ' : ''}{item.scope}{item.callLine ? ` · called at line ${item.callLine}` : ''}</option>)}</select></label><ol className="call-stack" aria-label="Call stack">{[...snapshot.stack].reverse().map(item => <li key={item.id}><button className={item.id === frame?.id ? 'current-frame' : ''} onClick={() => setFrameId(item.id)}>{item.scope}{item.callLine ? ` — line ${item.callLine}` : ''}</button></li>)}</ol><div className="table-scroll"><table><thead><tr><th>Identifier</th><th>Type</th><th>Value</th><th>Scope</th></tr></thead><tbody>{frame?.variables.map(v => <tr key={v.id}><th>{v.name}{v.constant ? ' (constant)' : ''}</th><td>{v.bounds ? `ARRAY[${v.bounds.map(b => b.join(':')).join(', ')}] OF ` : ''}{v.type}</td><td>{v.bounds ? <details><summary>{v.totalElements} elements</summary><div className={`array-values ${v.bounds.length === 2 ? 'array-grid-2d' : ''}`}>{v.elements?.map(e => <span key={e.index}><b>[{e.index}]</b> {formatValue(e.value)}</span>)}</div><div className="array-pager"><button disabled={!v.elementOffset} onClick={() => page(v.id, Math.max(0, (v.elementOffset ?? 0) - 50))}>Previous 50</button><span>{(v.elementOffset ?? 0) + 1}–{Math.min((v.elementOffset ?? 0) + 50, v.totalElements!)} of {v.totalElements}</span><button disabled={(v.elementOffset ?? 0) + 50 >= v.totalElements!} onClick={() => page(v.id, (v.elementOffset ?? 0) + 50)}>Next 50</button></div></details> : formatValue(v.value)}</td><td>{v.scope}</td></tr>)}</tbody></table>{!frame?.variables.length && <p>No variables declared in this frame yet.</p>}</div></div>}
  </details>;
}
interface TraceProps { choices: { id: string; label: string }[]; selected: string[]; change: (ids: string[]) => void; running: boolean; recorder: TraceRecorder | null; start: () => void; step: () => void; resume: () => void; paused: boolean; reset: () => void }
export function TracePanel(p: TraceProps) {
  const [exported, setExported] = useState(''); const [copyNote, setCopyNote] = useState('');
  useEffect(() => { setExported(''); setCopyNote(''); }, [p.recorder]);
  const copy = async (separator: ',' | '\t') => {
    const text = p.recorder?.export(separator) ?? ''; setExported(text);
    try { await navigator.clipboard.writeText(text); setCopyNote('Copied to clipboard.'); } catch { setCopyNote('Select the export text below and copy it.'); }
  };
  return <details className="aux-panel" open={!!p.recorder}><summary>Trace table {p.recorder ? `· ${p.recorder.rows.length} rows` : ''}</summary><div className="panel-body">
    <fieldset disabled={p.running}><legend>Variables to trace</legend><div className="trace-choices">{p.choices.map(c => <label key={c.id}><input type="checkbox" checked={p.selected.includes(c.id)} onChange={e => p.change(e.target.checked ? [...p.selected, c.id] : p.selected.filter(id => id !== c.id))}/>{c.label}</label>)}</div>{!p.choices.length && <p>Declare variables in a valid program to select them here.</p>}</fieldset>
    <div className="panel-actions"><button disabled={p.running || !p.selected.length} onClick={p.start}>Start trace</button><button disabled={!p.paused} onClick={p.step}>Step trace</button><button disabled={!p.paused} onClick={p.resume}>Continue trace</button><button onClick={() => { p.reset(); setExported(''); setCopyNote(''); }}>Reset trace</button><button disabled={!p.recorder?.rows.length} onClick={() => void copy(',')}>Copy CSV</button><button disabled={!p.recorder?.rows.length} onClick={() => void copy('\t')}>Copy TSV</button></div>
    {p.recorder && <div className="table-scroll"><table><thead><tr><th>Step</th><th>Line</th><th>Scope</th>{p.recorder.selected.map(id => <th key={id}>{p.choices.find(c => c.id === id)?.label ?? id}</th>)}</tr></thead><tbody>{p.recorder.rows.map((r, index) => <tr key={index}><td>{r.step}</td><td>{r.line}</td><td>{r.scope}</td>{r.values.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody></table></div>}
    {p.recorder?.truncated && <p>Trace reached its 1,000-row limit. Program execution continues.</p>}<p className="muted">Rows record selected-value or scope changes after a statement. — means uninitialized or out of scope.</p>
    {exported && <><p role="status">{copyNote}</p><label>Trace export<textarea className="export-text" readOnly value={exported} onFocus={e => e.target.select()}/></label></>}
  </div></details>;
}
export function FilesPanel({ store, files, disabled, storageNote, backup, restore }: { store: VirtualFiles; files: Record<string, string>; disabled: boolean; storageNote: string; backup: Record<string, string> | null; restore: () => void }) {
  const [selected, setSelected] = useState('FileA.txt'), [name, setName] = useState(''), [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const active = Object.hasOwn(files, selected) ? selected : Object.keys(files)[0] ?? '';
  const action = (fn: () => void) => { try { fn(); setMessage(''); } catch (e) { setMessage((e as Error).message); } };
  return <details className="aux-panel"><summary>Files · {Object.keys(files).length} virtual files</summary><div className="panel-body">
    <p className="muted">Stored in this browser. Run resets open handles, not file contents. File editing is locked during execution.</p><fieldset disabled={disabled}><legend>Manage text files</legend>
      <div className="file-controls"><label>File<select value={active} onChange={e => setSelected(e.target.value)}><option value="" disabled>No file selected</option>{Object.keys(files).sort().map(n => <option key={n}>{n}</option>)}</select></label><label>New filename<input value={name} maxLength={120} onChange={e => setName(e.target.value)}/></label></div>
      <div className="panel-actions"><button onClick={() => action(() => { store.create(name); setSelected(name); setName(''); })}>Create file</button><button disabled={!active} onClick={() => action(() => { store.rename(active, name); setSelected(name); setName(''); })}>Rename file</button><button disabled={!active} onClick={() => action(() => store.delete(active))}>Delete file</button><button onClick={() => action(() => { store.replace(SAMPLE_FILES); setSelected('FileA.txt'); })}>Reset files to sample</button><button disabled={!backup} onClick={() => action(restore)}>Restore previous state</button><button disabled={!active} onClick={() => downloadText(active, files[active])}>Export selected</button><button onClick={() => input.current?.click()}>Import text file</button></div>
      <input className="visually-hidden" ref={input} type="file" accept=".txt,text/plain" onChange={e => { const file = e.target.files?.[0]; if (!file) return; void file.text().then(text => action(() => { store.write(file.name, text); setSelected(file.name); })).finally(() => { if (input.current) input.current.value = ''; }); }}/>
      {active && <label>Contents of {active}<textarea className="file-text" value={files[active]} onChange={e => action(() => store.write(active, e.target.value))} spellCheck={false}/></label>}
    </fieldset>{(message || storageNote) && <p role="status">{message || storageNote}</p>}
  </div></details>;
}
