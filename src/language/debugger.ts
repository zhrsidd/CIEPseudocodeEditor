import type { DataType, Position, Value } from './model';
export interface VariableView {
  id: string; name: string; type: DataType; scope: string; value?: Value; constant: boolean;
  bounds?: [number, number][]; elements?: { index: string; value?: Value }[]; totalElements?: number; elementOffset?: number;
}
export interface StackFrameView { id: string; scope: string; routine: string; callLine?: number; variables: VariableView[] }
export interface Snapshot { variables: VariableView[]; scope: string; step: number; stack: StackFrameView[] }
export interface StepEvent { position: Position; kind: string; snapshot: Snapshot }
/** A gate on interpreter checkpoints, never a second evaluator. Abort always releases a pause. */
export class DebugGate {
  private release?: () => void;
  private command: 'step' | 'continue' | 'over' | 'out' = 'step';
  private targetDepth = 0;
  private first: boolean;
  private currentDepth = 0;
  constructor(private signal: AbortSignal, private paused: (event: StepEvent) => void, private breakpoints = new Set<number>(), pauseInitially = true) { this.first = pauseInitially; this.command = pauseInitially ? 'step' : 'continue'; }
  async before(event: StepEvent) {
    if (this.signal.aborted) return;
    const depth = event.snapshot.stack.length;
    const shouldPause = this.first || this.command === 'step' ||
      (this.command === 'continue' && this.breakpoints.has(event.position.line)) ||
      (this.command === 'over' && depth <= this.targetDepth) ||
      (this.command === 'out' && depth < this.targetDepth);
    this.first = false;
    if (!shouldPause) return;
    this.currentDepth = depth;
    await new Promise<void>(resolve => {
      const finish = () => { this.signal.removeEventListener('abort', finish); this.release = undefined; resolve(); };
      this.release = finish; this.signal.addEventListener('abort', finish, { once: true }); this.paused(event);
    });
  }
  private resume(command: 'step' | 'continue' | 'over' | 'out') { this.command = command; this.targetDepth = this.currentDepth; this.release?.(); }
  step() { this.resume('step'); }
  continue() { this.resume('continue'); }
  stepOver() { this.resume('over'); }
  stepOut() { this.resume('out'); }
  setBreakpoints(lines: Iterable<number>) { this.breakpoints = new Set(lines); }
}
export interface TraceRow { step: number; line: number; scope: string; values: string[] }
export function formatValue(value?: Value) { return !value ? '—' : value.type === 'STRING' || value.type === 'CHAR' ? JSON.stringify(value.value) : value.type === 'BOOLEAN' ? (value.value ? 'TRUE' : 'FALSE') : String(value.value); }
export class TraceRecorder {
  rows: TraceRow[] = [];
  truncated = false;
  private previous?: string;
  constructor(public selected: string[], private limit = 1000) {}
  record(event: StepEvent) {
    const values = this.selected.map(id => {
      const element = id.match(/^(.*)\[(-?\d+(?:,-?\d+)?)\]$/), v = event.snapshot.variables.find(v => v.id === (element?.[1] ?? id));
      if (element && v?.bounds) return formatValue(v.elements?.find(e => e.index === element[2])?.value);
      return !v ? '—' : v.bounds ? '[' + (v.elements ?? []).slice(0, 10).map(e => `${e.index}=${formatValue(e.value)}`).join('; ') + (v.totalElements! > 10 ? '; …]' : ']') : formatValue(v.value);
    }).map(v => v.slice(0, 1000));
    const signature = JSON.stringify([event.snapshot.scope, values]);
    if (this.previous === signature) return;
    this.previous = signature;
    if (this.rows.length >= this.limit) { this.truncated = true; return; }
    this.rows.push({ step: event.snapshot.step, line: event.position.line, scope: event.snapshot.scope, values });
  }
  reset() { this.rows = []; this.previous = undefined; this.truncated = false; }
  export(separator: ',' | '\t') {
    const quote = (s: string) => /["\r\n,\t]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    return [['Step', 'Line', 'Scope', ...this.selected], ...this.rows.map(r => [String(r.step), String(r.line), r.scope, ...r.values])].map(row => row.map(quote).join(separator)).join('\n');
  }
}
