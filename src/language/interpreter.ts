import { LanguageError, type DataType, type Expr, type Position, type Statement, type Value, type Target, type Routine } from './model';
import { BUILTINS } from './lexer';
import { builtin } from './builtins';
import { FileSession, VirtualFiles } from './files';
import type { Snapshot, StackFrameView, StepEvent, VariableView } from './debugger';
export class StoppedError extends Error { constructor() { super('Program stopped.'); } }
interface Cell { name: string; type: DataType; constant: boolean; data?: Value; bounds?: [number, number][]; elements?: Map<string, Value> }
interface Reference { cell: Cell; key?: string; label: string }
class ReturnSignal { constructor(public data: Value, public position: Position) {} }
export interface RuntimeIO {
  input: (name: string, type: DataType, position: Position) => Promise<string>;
  output: (text: string) => void;
  signal?: AbortSignal;
  maxSteps?: number;
  random?: () => number;
  files?: VirtualFiles;
  beforeStep?: (event: StepEvent) => Promise<void>;
  onStep?: (event: StepEvent) => void;
  watch?: string[];
}
export const display = (data: Value) => data.type === 'BOOLEAN' ? (data.value ? 'TRUE' : 'FALSE') : String(data.value);
export function parseInput(text: string, type: DataType, pos: Position): Value {
  const trimmed = text.trim(); let value: Value['value'] = text;
  if (type === 'INTEGER' || type === 'REAL') {
    const pattern = type === 'INTEGER' ? /^[+-]?\d+$/ : /^[+-]?\d+(\.\d+)?$/;
    if (!pattern.test(trimmed)) throw new LanguageError(`Enter a valid ${type} value.`, pos);
    value = Number(trimmed);
    if (!Number.isFinite(value) || (type === 'INTEGER' && !Number.isSafeInteger(value))) throw new LanguageError('Input is outside the supported numeric range.', pos);
  } else if (type === 'BOOLEAN') {
    if (!['TRUE', 'FALSE'].includes(trimmed)) throw new LanguageError('Enter TRUE or FALSE for a BOOLEAN.', pos);
    value = trimmed === 'TRUE';
  } else if (type === 'CHAR' && [...text].length !== 1) throw new LanguageError('Enter exactly one character.', pos);
  return { type, value };
}
export class Interpreter {
  private cells = new Map<string, Cell>();
  private local?: Map<string, Cell>;
  private routines = new Map<string, Routine>();
  private callDepth = 0;
  private allocatedElements = 0;
  private steps = 0;
  private outputSize = 0;
  private outputLines = 0;
  private completedSteps = 0;
  private scope = 'Global';
  private scopeId = 'GLOBAL';
  private frameNumber = 0;
  private frames: { id: string; scope: string; routine: string; callLine?: number; cells: Map<string, Cell> }[] = [];
  private active = false;
  private fileSession?: FileSession;
  constructor(private io: RuntimeIO) {}
  private error(message: string, pos: Position, hint?: string): never { throw new LanguageError(message, pos, hint); }
  private lookup(name: string) { return this.local?.get(name.toUpperCase()) ?? this.cells.get(name.toUpperCase()); }
  private cell(name: string, pos: Position) { return this.lookup(name) ?? this.error(`${name} has not been declared.`, pos, `Declare ${name} before using it.`); }
  private async reference(target: Target, depth = 0): Promise<Reference> {
    const cell = this.cell(target.name, target);
    if (!cell.bounds) {
      if (target.indices) this.error(`${target.name} is a scalar, not an array.`, target);
      return { cell, label: target.name };
    }
    const range = cell.bounds.map(([lower, upper]) => `${lower}:${upper}`).join(', ');
    if (!target.indices || target.indices.length !== cell.bounds.length) this.error(`${target.name} requires ${cell.bounds.length} index(es); declared range [${range}].`, target, `Use ${target.name}[${cell.bounds.map(([lower]) => lower).join(', ')}] to access an element.`);
    const indices: number[] = [];
    for (let i = 0; i < target.indices.length; i++) {
      const expression = target.indices[i], index = this.integer(await this.evaluate(expression, depth + 1), expression);
      const [lower, upper] = cell.bounds[i];
      if (index < lower || index > upper) this.error(`${target.name}: index ${index} in dimension ${i + 1} is out of range. Valid declared range: [${range}].`, expression, `Use an INTEGER index from ${lower} to ${upper} for dimension ${i + 1}.`);
      indices.push(index);
    }
    return { cell, key: indices.join(','), label: `${target.name}[${indices.join(',')}]` };
  }
  private check() { if (this.io.signal?.aborted) throw new StoppedError(); }
  private async tick(pos: Position) {
    this.check();
    if (++this.steps > (this.io.maxSteps ?? 100_000)) this.error('Execution limit reached. The program exceeded the execution safety limit; this may indicate an infinite loop.', pos);
    if (this.steps % 200 === 0) { await new Promise(resolve => setTimeout(resolve, 0)); this.check(); }
  }
  snapshot(pages: Record<string, number> = {}): Snapshot {
    const makeVariables = (cells: Map<string, Cell>, scope: string, scopeId: string) => {
      const variables: VariableView[] = [];
      for (const [key, cell] of cells) {
        const view: VariableView = { id: `${scopeId}::${key}`, name: cell.name, type: cell.type, scope, constant: cell.constant, value: cell.data ? { ...cell.data } : undefined };
        if (cell.bounds) {
          view.bounds = cell.bounds.map(b => [...b] as [number, number]);
          view.totalElements = cell.bounds.reduce((n, [lo, hi]) => n * (hi - lo + 1), 1); view.elements = [];
          view.elementOffset = Math.max(0, Math.min(pages[view.id] ?? 0, Math.max(0, view.totalElements - 1)));
          const width = cell.bounds[1] ? cell.bounds[1][1] - cell.bounds[1][0] + 1 : 1;
          for (let n = view.elementOffset; n < Math.min(view.elementOffset + 50, view.totalElements); n++) {
            const index = cell.bounds.length === 1 ? String(cell.bounds[0][0] + n) : `${cell.bounds[0][0] + Math.floor(n / width)},${cell.bounds[1][0] + n % width}`;
            const value = cell.elements!.get(index); view.elements.push({ index, value: value ? { ...value } : undefined });
          }
          for (const watched of this.io.watch ?? []) {
            const match = watched.match(new RegExp(`^${view.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[(-?\\d+(?:,-?\\d+)?)\\]$`));
            if (match && !view.elements.some(e => e.index === match[1])) { const value = cell.elements!.get(match[1]); view.elements.push({ index: match[1], value: value ? { ...value } : undefined }); }
          }
        }
        variables.push(view);
      }
      return variables;
    };
    const globals = makeVariables(this.cells, 'Global', 'GLOBAL');
    const stack: StackFrameView[] = [{ id: 'GLOBAL', scope: 'Global', routine: 'Main program', variables: globals }, ...this.frames.map(frame => ({ id: frame.id, scope: frame.scope, routine: frame.routine, callLine: frame.callLine, variables: makeVariables(frame.cells, frame.scope, frame.routine.toUpperCase()) }))];
    const current = stack.at(-1)!;
    return { variables: [...globals, ...(current.id === 'GLOBAL' ? [] : current.variables)], scope: this.scope, step: this.completedSteps, stack };
  }
  private async before(position: Position, kind: string) {
    await this.tick(position);
    if (this.io.beforeStep) await this.io.beforeStep({ position, kind, snapshot: this.snapshot() });
    this.check();
  }
  private after(position: Position, kind: string) {
    this.completedSteps++;
    if (this.io.onStep) this.io.onStep({ position, kind, snapshot: this.snapshot() });
  }
  private scopeChanged(position: Position) {
    if (this.io.onStep) this.io.onStep({ position, kind: 'scope', snapshot: this.snapshot() });
  }
  private async filename(expression: Expr) {
    const value = await this.evaluate(expression);
    if (value.type !== 'STRING') this.error('File identifiers must evaluate to STRING filenames.', expression);
    return value.value as string;
  }
  private async input(name: string, type: DataType, position: Position): Promise<string> {
    this.check();
    if (!this.io.signal) return this.io.input(name, type, position);
    const signal = this.io.signal;
    return new Promise<string>((resolve, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(new StoppedError()); };
      signal.addEventListener('abort', abort, { once: true });
      Promise.resolve().then(() => { this.check(); return this.io.input(name, type, position); }).then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    });
  }
  private numeric(data: Value, pos: Position): number {
    if (data.type !== 'INTEGER' && data.type !== 'REAL') this.error('Arithmetic requires INTEGER or REAL values.', pos);
    return data.value as number;
  }
  private integer(data: Value, pos: Position): number { if (data.type !== 'INTEGER') this.error('This operation requires INTEGER values.', pos); return data.value as number; }
  private boolean(data: Value, pos: Position): boolean { if (data.type !== 'BOOLEAN') this.error('Conditions and logical operators require BOOLEAN values.', pos); return data.value as boolean; }
  private number(value: number, type: DataType, pos: Position): Value {
    if (!Number.isFinite(value) || (type === 'INTEGER' && !Number.isSafeInteger(value))) this.error('Numeric result is outside the supported range.', pos);
    return { type, value };
  }
  private async evaluate(e: Expr, depth = 0): Promise<Value> {
    if (depth > 300) this.error('Expression is too complex to evaluate (maximum depth 300).', e);
    const evaluate = (expr: Expr) => this.evaluate(expr, depth + 1);
    switch (e.kind) {
      case 'literal': return e.data;
      case 'name': {
        if (!e.indices && !this.lookup(e.name) && this.routines.has(e.name.toUpperCase())) return (await this.invoke(e.name, [], e, true))!;
        const ref = await this.reference(e, depth);
        return (ref.key === undefined ? ref.cell.data : ref.cell.elements!.get(ref.key)) ?? this.error(`${ref.label} has no value. Assign or INPUT a value first.`, e);
      }
      case 'call': return (await this.invoke(e.name, e.args, e, true, depth))!;
      case 'unary': {
        const a = await evaluate(e.operand);
        if (e.op === 'NOT') return { type: 'BOOLEAN', value: !this.boolean(a, e) };
        const n = this.numeric(a, e); return this.number(e.op === '-' ? -n : n, a.type, e);
      }
      case 'integerCall': {
        const a = this.integer(await evaluate(e.left), e), b = this.integer(await evaluate(e.right), e);
        if (b === 0) this.error('Cannot divide by zero.', e);
        return this.number(e.op === 'DIV' ? Math.trunc(a / b) : a % b, 'INTEGER', e);
      }
      case 'binary': {
        // Eager evaluation catches invalid operands consistently in both logical branches.
        const a = await evaluate(e.left), b = await evaluate(e.right);
        if (e.op === 'AND' || e.op === 'OR') {
          const av = this.boolean(a, e), bv = this.boolean(b, e);
          return { type: 'BOOLEAN', value: e.op === 'AND' ? av && bv : av || bv };
        }
        if (['=', '<>', '<', '>', '<=', '>='].includes(e.op)) {
          const numeric = ['INTEGER', 'REAL'].includes(a.type) && ['INTEGER', 'REAL'].includes(b.type);
          if (a.type !== b.type && !numeric) this.error(`Cannot compare ${a.type} with ${b.type}.`, e);
          if (a.type === 'BOOLEAN' && !['=', '<>'].includes(e.op)) this.error('BOOLEAN values support only = and <> comparisons.', e);
          const av = a.value, bv = b.value;
          const value = e.op === '=' ? av === bv : e.op === '<>' ? av !== bv : e.op === '<' ? av < bv : e.op === '>' ? av > bv : e.op === '<=' ? av <= bv : av >= bv;
          return { type: 'BOOLEAN', value };
        }
        const av = this.numeric(a, e), bv = this.numeric(b, e);
        if (e.op === '/' && bv === 0) this.error('Cannot divide by zero.', e);
        const value = e.op === '+' ? av + bv : e.op === '-' ? av - bv : e.op === '*' ? av * bv : e.op === '/' ? av / bv : av ** bv;
        const type = e.op === '/' || a.type === 'REAL' || b.type === 'REAL' || (e.op === '^' && bv < 0) ? 'REAL' : 'INTEGER';
        return this.number(value, type, e);
      }
    }
  }
  private assign(ref: Reference, data: Value, pos: Position) {
    const { cell, key, label } = ref;
    if (cell.constant) this.error(`${label} is a constant and cannot be changed.`, pos);
    if (cell.type !== data.type) this.error(`${label} needs ${cell.type}, but this value is ${data.type}. It was declared as ${cell.type}.`, pos, `Assign a ${cell.type} expression to ${label}.`);
    if (key === undefined) cell.data = data;
    else cell.elements!.set(key, data);
  }
  private async invoke(name: string, expressions: Expr[], pos: Position, asFunction: boolean, depth = 0): Promise<Value | undefined> {
    const key = name.toUpperCase(), definition = this.routines.get(key);
    if (BUILTINS.has(key) && !asFunction) this.error(`${name} returns a value; CALL is only for procedures.`, pos, `Use ${name}(...) in an expression or OUTPUT.`);
    if (!BUILTINS.has(key)) {
      if (!definition) this.error(`Unknown ${asFunction ? 'function' : 'procedure'} ${name}.`, pos, 'Define the routine before the main program.');
      if (asFunction !== !!definition.returnType) this.error(asFunction ? `${name} is a procedure and cannot be used as an expression.` : `${name} is a function; CALL is only for procedures.`, pos, asFunction ? `Use CALL ${name}(...).` : `Use ${name}(...) in an expression or OUTPUT.`);
      if (expressions.length !== definition.params.length) this.error(`${name} expects ${definition.params.length} argument(s), received ${expressions.length}.`, pos);
    }
    const args: Value[] = [];
    // Evaluate in the caller's scope, left to right, before creating the callee's frame.
    for (const expression of expressions) args.push(await this.evaluate(expression, depth + 1));
    if (BUILTINS.has(key)) return builtin(key, args, pos, this.io.random);
    const routine = definition!;
    const frame = new Map<string, Cell>();
    routine.params.forEach((param, i) => {
      if (args[i].type !== param.type) this.error(`${name}: parameter ${param.name} needs ${param.type}, received ${args[i].type}.`, expressions[i], `Pass a ${param.type} value as argument ${i + 1}.`);
      frame.set(param.name.toUpperCase(), { name: param.name, type: param.type, constant: false, data: { ...args[i] } });
    });
    if (this.callDepth >= 64) this.error('Routine call depth limit reached (64). Check for unbounded recursion.', pos);
    await this.tick(pos);
    const caller = this.local, callerScope = this.scope, callerId = this.scopeId;
    this.local = frame; this.callDepth++; this.scope = `${routine.name} #${++this.frameNumber}`; this.scopeId = routine.name.toUpperCase();
    this.frames.push({ id: `${this.scopeId}-${this.frameNumber}`, scope: this.scope, routine: routine.name, callLine: pos.line, cells: frame }); this.scopeChanged(pos);
    try {
      await this.block(routine.body);
      if (routine.returnType) this.error(`${name} reached ENDFUNCTION without returning a value.`, pos, `Add RETURN with a ${routine.returnType} value on every execution path.`);
    } catch (signal) {
      if (!(signal instanceof ReturnSignal)) throw signal;
      if (signal.data.type !== routine.returnType) this.error(`${name} must RETURN ${routine.returnType}, received ${signal.data.type}.`, signal.position, `Return a ${routine.returnType} expression.`);
      return signal.data;
    } finally { this.frames.pop(); this.local = caller; this.scope = callerScope; this.scopeId = callerId; this.callDepth--; this.scopeChanged(pos); }
  }
  async run(program: Statement[]): Promise<void> {
    if (this.active) throw new Error('This interpreter is already running.');
    this.active = true;
    this.cells.clear(); this.routines.clear(); this.local = undefined;
    this.steps = 0; this.completedSteps = 0; this.allocatedElements = 0; this.outputSize = 0; this.outputLines = 0;
    this.callDepth = 0; this.frameNumber = 0; this.frames = []; this.scope = 'Global'; this.scopeId = 'GLOBAL';
    this.fileSession = new FileSession(this.io.files ?? new VirtualFiles());
    let completed = false;
    try {
      for (const statement of program) if (statement.kind === 'routine') {
        const key = statement.name.toUpperCase();
        if (this.routines.has(key)) this.error(`Duplicate routine ${statement.name}.`, statement);
        this.routines.set(key, statement);
      }
      await this.block(program); completed = true;
    } finally {
      this.fileSession.closeAll(); this.fileSession = undefined; this.local = undefined; this.active = false;
      if (!completed) { this.cells.clear(); this.routines.clear(); }
    }
  }
  private async block(statements: Statement[]): Promise<void> {
    for (const s of statements) {
      if (s.kind === 'routine') continue;
      if (s.kind !== 'while') await this.before(s, s.kind);
      switch (s.kind) {
        case 'declare': case 'constant': {
          const key = s.name.toUpperCase(), scope = this.local ?? this.cells;
          if (scope.has(key) || this.routines.has(key)) this.error(`${s.name} is already declared (names are case insensitive).`, s);
          const data = s.kind === 'constant' ? await this.evaluate(s.expression) : undefined;
          const cell: Cell = { name: s.name, type: s.kind === 'declare' ? s.type : data!.type, constant: s.kind === 'constant', data };
          if (s.kind === 'declare' && s.bounds) {
            const bounds: [number, number][] = []; let count = 1;
            for (const [lo, hi] of s.bounds) {
              const lower = this.integer(await this.evaluate(lo), lo), upper = this.integer(await this.evaluate(hi), hi);
              if (lower > upper) this.error(`${s.name}: lower bound ${lower} exceeds upper bound ${upper}.`, lo, 'Write each range as lower:upper, with lower <= upper.');
              count *= upper - lower + 1; bounds.push([lower, upper]);
            }
            this.allocatedElements += count;
            if (!Number.isSafeInteger(count) || this.allocatedElements > 100_000) this.error('Array allocation limit reached (100,000 elements per run).', s);
            cell.bounds = bounds; cell.elements = new Map();
          }
          scope.set(key, cell); break;
        }
        case 'assign': {
          const ref = await this.reference(s.target);
          this.assign(ref, await this.evaluate(s.expression), s.expression); break;
        }
        case 'input': {
          const ref = await this.reference(s.target);
          if (ref.cell.constant) this.error(`${ref.label} is a constant and cannot receive input.`, s);
          const text = await this.input(ref.label, ref.cell.type, s); this.check();
          this.assign(ref, parseInput(text, ref.cell.type, s), s); break;
        }
        case 'output': {
          const parts: string[] = [];
          for (const expression of s.expressions) parts.push(display(await this.evaluate(expression)));
          const text = parts.join('');
          this.outputSize += text.length + 1;
          if (this.outputSize > 100_000 || ++this.outputLines > 2_000) this.error('Output limit reached (100,000 characters or 2,000 lines).', s);
          this.io.output(text); break;
        }
        case 'openfile': this.fileSession!.open(await this.filename(s.file), s.mode, s); break;
        case 'closefile': this.fileSession!.close(await this.filename(s.file), s); break;
        case 'readfile': {
          const name = await this.filename(s.file), ref = await this.reference(s.target);
          if (ref.cell.constant) this.error(`${ref.label} is a constant and cannot receive file input.`, s.target);
          this.assign(ref, parseInput(this.fileSession!.read(name, s), ref.cell.type, s), s.target); break;
        }
        case 'writefile': {
          const name = await this.filename(s.file);
          const value = await this.evaluate({ ...s.target, kind: 'name' });
          this.fileSession!.write(name, display(value), s); break;
        }
        case 'call': await this.invoke(s.name, s.args, s, false); break;
        case 'return': { const value = await this.evaluate(s.expression); this.after(s, s.kind); throw new ReturnSignal(value, s.expression); }
        case 'if': { const condition = this.boolean(await this.evaluate(s.condition), s.condition); this.after(s, s.kind); await this.block(condition ? s.yes : s.no); continue; }
        case 'case': {
          const selector = await this.evaluate(s.selector); this.after(s, s.kind); let selected: Statement | undefined;
          for (const branch of s.branches) {
            const value = await this.evaluate(branch.value);
            const numeric = ['INTEGER', 'REAL'].includes(selector.type) && ['INTEGER', 'REAL'].includes(value.type);
            if (selector.type !== value.type && !numeric) this.error(`CASE label is ${value.type}, but the selector is ${selector.type}.`, branch.value);
            if (value.value === selector.value) { selected = branch.body; break; }
          }
          if (selected ?? s.otherwise) await this.block([selected ?? s.otherwise!]); continue;
        }
        case 'while': {
          while (true) {
            await this.before(s, 'while'); const condition = this.boolean(await this.evaluate(s.condition), s.condition); this.after(s, 'while');
            if (!condition) break; await this.block(s.body);
          }
          continue;
        }
        case 'repeat': {
          this.after(s, 'repeat');
          while (true) {
            await this.block(s.body); const end = s.endPosition ?? s.condition;
            await this.before(end, 'until'); const condition = this.boolean(await this.evaluate(s.condition), s.condition); this.after(end, 'until');
            if (condition) break;
          }
          continue;
        }
        case 'for': {
          const cell = this.cell(s.name, s);
          if (cell.constant || cell.bounds || cell.type !== 'INTEGER') this.error('The FOR counter must be a declared INTEGER variable.', s);
          const start = this.integer(await this.evaluate(s.start), s.start), end = this.integer(await this.evaluate(s.end), s.end), step = this.integer(await this.evaluate(s.step), s.step);
          if (step === 0) this.error('STEP cannot be zero.', s.step);
          let n = start; const valid = (value: number) => step > 0 ? value <= end : value >= end;
          if (valid(n)) this.assign({ cell, label: s.name }, this.number(n, 'INTEGER', s), s);
          this.after(s, 'for');
          while (valid(n)) {
            await this.block(s.body); const nextPos = s.endPosition ?? s;
            await this.before(nextPos, 'next'); const next = n + step;
            if (valid(next)) this.assign({ cell, label: s.name }, this.number(next, 'INTEGER', nextPos), nextPos);
            this.after(nextPos, 'next'); if (!valid(next)) break; n = next;
          }
          continue;
        }
      }
      this.after(s, s.kind);
    }
  }
}
