import { useRef, useState } from 'react';
import { parseProgramImport, safeFilename } from './language/workspace';

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}
interface Props {
  source: string; programs: Record<string, string>; disabled: boolean;
  save: (name: string) => void; load: (name: string) => void; remove: (name: string) => void; importProgram: (name: string, source: string) => void;
}
export function ProgramPanel(p: Props) {
  const [name, setName] = useState('My program'), [selected, setSelected] = useState(''), [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const action = (fn: () => void) => { try { fn(); setMessage(''); } catch (error) { setMessage((error as Error).message); } };
  const imported = async (file?: File) => { if (!file) return; try { const data = parseProgramImport(file.name, await file.text()); p.importProgram(data.name, data.source); setName(data.name); setMessage(`Imported ${file.name}.`); } catch (error) { setMessage((error as Error).message); } finally { if (input.current) input.current.value = ''; } };
  return <details className="aux-panel"><summary>Programs · {Object.keys(p.programs).length} saved</summary><div className="panel-body">
    <p className="muted">The current draft and named programs stay in this browser. Export a copy for transfer or backup.</p>
    <fieldset disabled={p.disabled}><legend>Save or open a program</legend><div className="file-controls"><label>Program name<input value={name} maxLength={80} onChange={e => setName(e.target.value)}/></label><label>Saved program<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose a saved program</option>{Object.keys(p.programs).sort().map(item => <option key={item}>{item}</option>)}</select></label></div>
      <div className="panel-actions"><button onClick={() => action(() => p.save(name))}>Save current</button><button disabled={!selected} onClick={() => action(() => p.load(selected))}>Open saved</button><button disabled={!selected} onClick={() => action(() => p.remove(selected))}>Delete saved</button><button onClick={() => downloadText(safeFilename(name, '.pseudocode'), p.source)}>Export current</button><button onClick={() => input.current?.click()}>Import program</button></div>
      <input className="visually-hidden" ref={input} type="file" accept=".pseudocode,.txt,text/plain" onChange={e => void imported(e.target.files?.[0])}/>
    </fieldset>{message && <p role="status">{message}</p>}
  </div></details>;
}
