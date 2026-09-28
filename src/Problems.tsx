import type { Diagnostic } from './language/model';
import { diagnosticExcerpt } from './language/diagnostics';
interface Props { source: string; error: Diagnostic | null; warnings: Diagnostic[]; locate: (line: number, column: number) => void }
export function Problems({ source, error, warnings, locate }: Props) {
  const entries = [...(error ? [{ ...error, severity: 'Error' }] : []), ...warnings.slice(0, 100).map(w => ({ ...w, severity: 'Warning' }))];
  return <section className="problems" aria-labelledby="problems-title">
    <div className="problems-heading"><h2 id="problems-title">Problems</h2><span>{error ? '1 error' : '0 errors'} · {warnings.length} warning{warnings.length === 1 ? '' : 's'}</span></div>
    {entries.length === 0 ? <p className="no-problems">No diagnostics. Run your program to check it.</p> : <div className="problem-list">{entries.map((entry, index) => {
      const excerpt = diagnosticExcerpt(source, entry);
      return <article className={`problem ${entry.severity.toLowerCase()}`} key={index}>
        <button onClick={() => locate(entry.line, entry.column)}><strong>{entry.severity}</strong> · Line {entry.line}, column {entry.column}<span>{entry.message}</span></button>
        <pre aria-label={`Source line ${entry.line}`}><code>{excerpt.sourceLine}{'\n'}{excerpt.caret}</code></pre>
        {entry.hint && <p>{entry.hint}</p>}
      </article>;
    })}{warnings.length > 100 && <p>Showing the first 100 of {warnings.length} warnings.</p>}</div>}
  </section>;
}
