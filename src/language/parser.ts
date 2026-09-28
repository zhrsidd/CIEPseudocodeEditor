import { BUILTINS, lex, type Token } from './lexer';
import { LanguageError, type DataType, type Expr, type Parameter, type Routine, type Statement, type Target } from './model';
const TYPES = ['INTEGER', 'REAL', 'STRING', 'CHAR', 'BOOLEAN'];
const PRECEDENCE: Record<string, number> = { OR: 1, AND: 2, '=': 4, '<>': 4, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '^': 8 };
class Parser {
  private index = 0;
  private depth = 0;
  private routine?: 'procedure' | 'function';
  constructor(private tokens: Token[]) {}
  private get current() { return this.tokens[Math.min(this.index, this.tokens.length - 1)]; }
  private take() { const t = this.current; if (t.kind !== 'eof') this.index++; return t; }
  private is(text: string) { return this.current.text === text; }
  private expect(text: string) {
    if (!this.is(text)) this.fail(`Expected ${text}, found ${this.current.text || 'end of program'}.`, `Add ${text} at this location.`);
    return this.take();
  }
  private fail(message: string, hint?: string): never { throw new LanguageError(message, this.current, hint); }
  private lines() { while (this.current.kind === 'newline') this.take(); }
  private endLine() {
    if (this.current.kind !== 'newline' && this.current.kind !== 'eof') this.fail('Expected the end of the statement. Put each statement on its own line.');
    this.lines();
  }
  private identifier() {
    if (this.current.kind !== 'word') this.fail('Expected an identifier. Keywords cannot be used as names.', 'Use a name containing letters and digits, such as PlayerScore.');
    return this.take().text;
  }
  private type(): DataType {
    if (!TYPES.includes(this.current.text)) this.fail('Expected INTEGER, REAL, STRING, CHAR or BOOLEAN.');
    return this.take().text as DataType;
  }
  program(): Statement[] {
    this.lines(); const result: Statement[] = [], names = new Set<string>();
    while (this.is('PROCEDURE') || this.is('FUNCTION')) {
      const definition = this.definition();
      if (names.has(definition.name.toUpperCase())) throw new LanguageError(`Duplicate routine definition: ${definition.name}. Names are case insensitive.`, definition);
      names.add(definition.name.toUpperCase()); result.push(definition);
    }
    return [...result, ...this.block()];
  }
  private definition(): Routine {
    const pos = this.take(), isFunction = pos.text === 'FUNCTION', name = this.identifier();
    const params: Parameter[] = [], names = new Set<string>();
    if (this.is('(')) {
      this.take();
      if (!this.is(')')) do {
        const paramPos = this.current, paramName = this.identifier(); this.expect(':'); const type = this.type();
        if (names.has(paramName.toUpperCase())) throw new LanguageError(`Duplicate parameter ${paramName}.`, paramPos);
        names.add(paramName.toUpperCase()); params.push({ ...paramPos, name: paramName, type });
        if (!this.is(',')) break; this.take();
      } while (true);
      this.expect(')');
    }
    let returnType: DataType | undefined;
    if (isFunction) { this.expect('RETURNS'); returnType = this.type(); }
    this.endLine(); this.routine = isFunction ? 'function' : 'procedure';
    const ending = isFunction ? 'ENDFUNCTION' : 'ENDPROCEDURE', body = this.block([ending]);
    this.expect(ending); this.endLine(); this.routine = undefined;
    return { ...pos, kind: 'routine', name, params, returnType, body };
  }
  private block(stops: string[] = []): Statement[] {
    if (++this.depth > 150) this.fail('Program nesting is too deep (maximum 150).');
    this.lines(); const result: Statement[] = [];
    while (this.current.kind !== 'eof' && !stops.includes(this.current.text)) result.push(this.statement());
    this.depth--; return result;
  }
  private target(depth = 0): Target {
    const pos = this.current, name = this.identifier();
    return { ...pos, name, indices: this.indices(depth) };
  }
  private indices(depth: number): Expr[] | undefined {
    if (!this.is('[')) return undefined;
    this.take(); const indices = [this.expression(0, depth + 1)];
    if (this.is(',')) { this.take(); indices.push(this.expression(0, depth + 1)); }
    if (this.is(',')) this.fail('Only 1D and 2D array indices are supported.');
    this.expect(']'); return indices;
  }
  private arguments(depth = 0): Expr[] {
    this.expect('('); const args: Expr[] = [];
    if (!this.is(')')) do {
      args.push(this.expression(0, depth + 1));
      if (!this.is(',')) break; this.take();
    } while (true);
    this.expect(')'); return args;
  }
  private literal(): Expr {
    const pos = this.current; let op: Token | undefined;
    if (this.is('+') || this.is('-')) op = this.take();
    const t = this.take(); let value: Expr;
    if (t.kind === 'literal') value = { ...t, kind: 'literal', data: t.data! };
    else if (t.text === 'TRUE' || t.text === 'FALSE') value = { ...t, kind: 'literal', data: { type: 'BOOLEAN', value: t.text === 'TRUE' } };
    else throw new LanguageError('Expected a literal value, not a variable or expression.', pos);
    if (op) {
      if (!['INTEGER', 'REAL'].includes(value.data.type)) throw new LanguageError('A sign may only prefix a numeric literal.', pos);
      value = { ...op, kind: 'unary', op: op.text, operand: value };
    }
    return value;
  }
  private branchStatement(): Statement {
    if (++this.depth > 150) this.fail('Program nesting is too deep (maximum 150).');
    try { return this.statement(); } finally { this.depth--; }
  }
  private statement(): Statement {
    const pos = this.current;
    let result: Statement;
    if (this.is('DECLARE')) {
      this.take(); const name = this.identifier(); this.expect(':');
      let bounds: [Expr, Expr][] | undefined;
      if (this.is('ARRAY')) {
        this.take(); this.expect('['); bounds = [];
        do {
          const lower = this.expression(); this.expect(':'); const upper = this.expression(); bounds.push([lower, upper]);
          if (!this.is(',')) break;
          if (bounds.length === 2) this.fail('Only 1D and 2D arrays are supported.');
          this.take();
        } while (true);
        this.expect(']'); this.expect('OF');
      }
      result = { ...pos, kind: 'declare', name, type: this.type(), bounds };
    } else if (this.is('CONSTANT')) {
      this.take(); const name = this.identifier(); this.expect('←'); const expression = this.literal();
      if (this.current.kind !== 'newline' && this.current.kind !== 'eof') this.fail('Constants must contain a literal, not a variable or expression.');
      result = { ...pos, kind: 'constant', name, expression };
    } else if (this.is('OPENFILE')) {
      this.take(); const file = this.expression(); this.expect('FOR');
      if (!this.is('READ') && !this.is('WRITE')) this.fail('OPENFILE requires READ or WRITE mode.');
      result = { ...pos, kind: 'openfile', file, mode: this.take().text as 'READ' | 'WRITE' };
    } else if (this.is('READFILE') || this.is('WRITEFILE')) {
      const kind = this.take().text === 'READFILE' ? 'readfile' : 'writefile';
      const file = this.expression(); this.expect(','); result = { ...pos, kind, file, target: this.target() };
    } else if (this.is('CLOSEFILE')) {
      this.take(); result = { ...pos, kind: 'closefile', file: this.expression() };
    } else if (this.is('INPUT')) {
      this.take(); result = { ...pos, kind: 'input', target: this.target() };
    } else if (this.is('OUTPUT')) {
      this.take(); const expressions = [this.expression()];
      while (this.is(',')) { this.take(); expressions.push(this.expression()); }
      result = { ...pos, kind: 'output', expressions };
    } else if (this.is('IF')) {
      this.take(); const condition = this.expression(); this.lines(); this.expect('THEN'); this.endLine();
      const yes = this.block(['ELSE', 'ENDIF']); let no: Statement[] = [];
      if (this.is('ELSE')) { this.take(); this.endLine(); no = this.block(['ENDIF']); }
      this.expect('ENDIF'); result = { ...pos, kind: 'if', condition, yes, no };
    } else if (this.is('CASE')) {
      this.take(); this.expect('OF'); const selector: Expr = { ...this.target(), kind: 'name' }; this.endLine();
      const branches: { value: Expr; body: Statement }[] = []; let otherwise: Statement | undefined;
      while (!this.is('ENDCASE')) {
        if (this.current.kind === 'eof') this.fail('Expected ENDCASE before end of program.', 'Close this CASE with ENDCASE.');
        if (otherwise) this.fail('OTHERWISE must be the last CASE branch.');
        if (this.is('OTHERWISE')) {
          this.take();
          if (this.current.kind === 'newline') this.fail('Place a statement after OTHERWISE on the same line.');
          otherwise = this.branchStatement();
        } else {
          const value = this.literal(); this.expect(':');
          if (this.current.kind === 'newline') this.fail('Place one statement after the CASE label and colon.');
          branches.push({ value, body: this.branchStatement() });
        }
      }
      if (branches.length === 0) this.fail('CASE needs at least one literal branch before ENDCASE.');
      this.expect('ENDCASE'); result = { ...pos, kind: 'case', selector, branches, otherwise };
    } else if (this.is('WHILE')) {
      this.take(); const condition = this.expression(); this.lines(); this.expect('DO'); this.endLine();
      const body = this.block(['ENDWHILE']); this.expect('ENDWHILE'); result = { ...pos, kind: 'while', condition, body };
    } else if (this.is('REPEAT')) {
      this.take(); this.endLine(); const body = this.block(['UNTIL']); const endPosition = this.expect('UNTIL');
      result = { ...pos, kind: 'repeat', body, endPosition, condition: this.expression() };
    } else if (this.is('FOR')) {
      this.take(); const name = this.identifier(); this.expect('←'); const start = this.expression(); this.expect('TO'); const end = this.expression();
      let step: Expr = { ...pos, kind: 'literal', data: { type: 'INTEGER', value: 1 } };
      if (this.is('STEP')) { this.take(); step = this.expression(); }
      this.endLine(); const body = this.block(['NEXT']); const endPosition = this.expect('NEXT'); const next = this.identifier();
      if (next.toUpperCase() !== name.toUpperCase()) throw new LanguageError(`NEXT must name the FOR variable ${name}.`, pos);
      result = { ...pos, kind: 'for', name, start, end, step, body, endPosition };
    } else if (this.is('CALL')) {
      this.take(); const name = this.current.kind === 'keyword' && BUILTINS.has(this.current.text) ? this.take().text : this.identifier();
      result = { ...pos, kind: 'call', name, args: this.is('(') ? this.arguments() : [] };
    } else if (this.is('RETURN')) {
      if (this.routine !== 'function') this.fail('RETURN is only allowed inside a FUNCTION.');
      this.take(); result = { ...pos, kind: 'return', expression: this.expression() };
    } else if (this.is('PROCEDURE') || this.is('FUNCTION')) {
      this.fail('Define procedures and functions at the start of the program, before main code. Nested definitions are not supported.');
    } else if (this.current.kind === 'word') {
      const target = this.target(); this.expect('←'); result = { ...pos, kind: 'assign', target, expression: this.expression() };
    } else this.fail(`Unexpected ${this.current.text || 'end of program'}. This statement is unsupported or out of place.`);
    this.endLine(); return result;
  }
  private expression(min = 0, depth = 0): Expr {
    if (depth > 150) this.fail('Expression nesting is too deep (maximum 150).');
    const t = this.take(); let left: Expr;
    if (t.kind === 'literal') left = { ...t, kind: 'literal', data: t.data! };
    else if (t.text === 'TRUE' || t.text === 'FALSE') left = { ...t, kind: 'literal', data: { type: 'BOOLEAN', value: t.text === 'TRUE' } };
    else if (t.kind === 'word') left = this.is('(') ? { ...t, kind: 'call', name: t.text, args: this.arguments(depth) } : { ...t, kind: 'name', name: t.text, indices: this.indices(depth) };
    else if (['-', '+', 'NOT'].includes(t.text)) left = { ...t, kind: 'unary', op: t.text, operand: this.expression(t.text === 'NOT' ? 3 : 7, depth + 1) };
    else if (t.text === '(') { left = this.expression(0, depth + 1); this.expect(')'); }
    else if (t.text === 'DIV' || t.text === 'MOD') {
      this.expect('('); const a = this.expression(0, depth + 1); this.expect(','); const b = this.expression(0, depth + 1); this.expect(')');
      left = { ...t, kind: 'integerCall', op: t.text, left: a, right: b };
    } else if (BUILTINS.has(t.text)) left = { ...t, kind: 'call', name: t.text, args: this.arguments(depth) };
    else throw new LanguageError(`Expected a value or expression, found ${t.text || 'end of program'}.`, t);
    while (PRECEDENCE[this.current.text] !== undefined && PRECEDENCE[this.current.text] >= min) {
      const op = this.take(), precedence = PRECEDENCE[op.text];
      const right = this.expression(op.text === '^' ? precedence : precedence + 1, depth + 1);
      left = { ...op, kind: 'binary', op: op.text, left, right };
    }
    return left;
  }
}
export function compile(source: string) {
  if (source.length > 100_000) throw new LanguageError('Program exceeds the 100,000-character limit.', { line: 1, column: 1 });
  const { tokens: rawTokens, warnings } = lex(source);
  let delimiters = 0;
  const tokens = rawTokens.filter(t => {
    if (t.kind === 'symbol' && (t.text === '(' || t.text === '[')) delimiters++;
    else if (t.kind === 'symbol' && (t.text === ')' || t.text === ']')) delimiters = Math.max(0, delimiters - 1);
    return t.kind !== 'newline' || delimiters === 0;
  });
  try { return { program: new Parser(tokens).program(), warnings }; }
  catch (error) { if (error instanceof LanguageError) error.warnings = warnings; throw error; }
}
