import { KEYWORDS } from './lexer';
import { highlight } from './highlight';
import type { Statement } from './model';
export function examCode(text: string): { source: string; stripped: boolean } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const numbered = lines.filter(l => l.trim()).map(l => l.match(/^\s*(\d+)[ \t](.*)$/));
  const clear = numbered.length >= 2 && numbered.every((m, i) => m && Number(m[1]) >= 1 && (i === 0 || Number(m[1]) === Number(numbered[i - 1]![1]) + 1)) && numbered.some(m => /^(DECLARE|CONSTANT|OUTPUT|INPUT|FOR|IF|WHILE|REPEAT|PROCEDURE|FUNCTION|CASE|OPENFILE)\b/.test(m![2].trimStart()));
  return { source: clear ? lines.map(l => l.trim() ? l.replace(/^\s*\d+[ \t]/, '') : l).join('\n') : lines.join('\n'), stripped: clear };
}
const CLOSERS: Record<string, string> = { ENDIF: 'IF', ENDCASE: 'CASE', NEXT: 'FOR', ENDWHILE: 'WHILE', UNTIL: 'REPEAT', ENDPROCEDURE: 'PROCEDURE', ENDFUNCTION: 'FUNCTION', ELSE: 'IF', THEN: 'IF' };
function stackBefore(source: string) {
  const stack: { kind: string; indent: number }[] = [];
  for (const line of source.split('\n')) {
    const word = line.trimStart().match(/^[A-Z]+\b/)?.[0]; if (!word) continue;
    if (CLOSERS[word] && !['ELSE', 'THEN'].includes(word)) { const index = stack.map(s => s.kind).lastIndexOf(CLOSERS[word]); if (index >= 0) stack.splice(index); }
    if (['FOR', 'WHILE', 'REPEAT', 'PROCEDURE', 'FUNCTION', 'IF', 'CASE'].includes(word)) stack.push({ kind: word, indent: line.match(/^\s*/)?.[0].replace(/\t/g, '    ').length ?? 0 });
  }
  return stack;
}
export function enterEdit(source: string, start: number, end = start) {
  const lineStart = source.lastIndexOf('\n', start - 1) + 1, lineEndAt = source.indexOf('\n', end), lineEnd = lineEndAt < 0 ? source.length : lineEndAt;
  const before = source.slice(lineStart, start), word = before.trimStart().match(/^[A-Z]+\b/)?.[0] ?? '';
  let indent = before.match(/^[ \t]*/)?.[0].replace(/\t/g, '    ').length ?? 0;
  let prefix = source.slice(0, start);
  if (start === end && end === lineEnd) {
    const stack = stackBefore(source.slice(0, lineStart)), opener = [...stack].reverse().find(s => s.kind === CLOSERS[word]);
    if (opener) {
      indent = opener.indent + (word === 'THEN' || word === 'ELSE' ? 2 : 0);
      prefix = source.slice(0, lineStart) + ' '.repeat(indent) + before.trimStart();
    }
    if (['FOR', 'WHILE', 'REPEAT', 'PROCEDURE', 'FUNCTION'].includes(word)) indent += 4;
    else if (word === 'IF') indent += /\bTHEN\s*(?:\/\/.*)?$/.test(before) ? 4 : 2;
    else if (word === 'CASE' || word === 'THEN' || word === 'ELSE') indent += 2;
  }
  const insert = '\n' + ' '.repeat(indent);
  return { source: prefix + insert + source.slice(end), cursor: prefix.length + insert.length };
}
export function declaredNames(source: string) {
  const tokens = highlight(source).filter(t => !/^\s*$/.test(t.text) && !['comment', 'string', 'char'].includes(t.style));
  const names = new Set<string>();
  tokens.forEach((t, i) => { if (/^[A-Za-z][A-Za-z0-9]*$/.test(t.text) && !KEYWORDS.has(t.text.toUpperCase()) && (['DECLARE', 'CONSTANT', 'PROCEDURE', 'FUNCTION'].includes(tokens[i - 1]?.text) || tokens[i + 1]?.text === ':')) names.add(t.text); });
  return [...names];
}
export function completion(source: string, cursor: number) {
  const prefix = source.slice(0, cursor).match(/[A-Za-z][A-Za-z0-9]*$/)?.[0] ?? '';
  const last = highlight(source.slice(0, cursor)).at(-1);
  if (!prefix || !last || ['comment', 'string', 'char'].includes(last.style)) return { prefix: '', items: [] as string[] };
  return { prefix, items: [...new Set([...KEYWORDS, ...declaredNames(source)])].filter(s => s.toUpperCase().startsWith(prefix.toUpperCase()) && s !== prefix).sort().slice(0, 8) };
}
export const REFERENCE: Record<string, string> = {
  DECLARE: 'DECLARE Name : INTEGER\nDeclare a variable before use.', CONSTANT: 'CONSTANT Name ← literal', INPUT: 'INPUT Variable\nPause for a value of the declared type.', OUTPUT: 'OUTPUT Value1, Value2',
  IF: 'IF Condition\n  THEN\n    Statements\n  ELSE\n    Statements\nENDIF', THEN: 'THEN follows IF; enclosed statements use four spaces.', ELSE: 'ELSE supplies the alternative IF branch.', ENDIF: 'ENDIF closes an IF statement.',
  CASE: 'CASE OF Choice\n  Literal : Statement\n  OTHERWISE Statement\nENDCASE', OTHERWISE: 'OTHERWISE Statement\nOptional final CASE branch.', ENDCASE: 'ENDCASE closes CASE.',
  FOR: 'FOR Counter ← Start TO End STEP Increment\n    Statements\nNEXT Counter', NEXT: 'NEXT Counter\nAdvance the matching FOR loop.', TO: 'TO supplies the inclusive upper FOR bound.', STEP: 'STEP Increment\nNonzero INTEGER; may be negative.',
  WHILE: 'WHILE Condition DO\n    Statements\nENDWHILE', DO: 'DO starts the WHILE body.', ENDWHILE: 'ENDWHILE returns to the WHILE condition.', REPEAT: 'REPEAT\n    Statements\nUNTIL Condition', UNTIL: 'UNTIL Condition\nFinish REPEAT when TRUE.',
  PROCEDURE: 'PROCEDURE Name(Parameter : INTEGER)\n    Statements\nENDPROCEDURE', ENDPROCEDURE: 'ENDPROCEDURE returns to the caller.', CALL: 'CALL ProcedureName(Arguments)', FUNCTION: 'FUNCTION Name(Parameter : INTEGER) RETURNS INTEGER\n    RETURN Value\nENDFUNCTION', ENDFUNCTION: 'ENDFUNCTION closes a function. Every path must RETURN.', RETURNS: 'RETURNS DataType\nDeclares the function result type.', RETURN: 'RETURN Expression\nExit the function with a typed value.',
  ARRAY: 'ARRAY[Lower:Upper, Lower:Upper] OF DataType\nOne or two dimensions; explicit bounds.', OF: 'OF introduces an array element type or CASE selector.',
  OPENFILE: 'OPENFILE "File.txt" FOR READ\nREAD requires an existing file; WRITE creates or truncates.', READFILE: 'READFILE "File.txt", Variable\nRead one line into the declared type.', WRITEFILE: 'WRITEFILE "File.txt", Variable\nWrite one data item and a newline.', CLOSEFILE: 'CLOSEFILE "File.txt"', READ: 'FOR READ\nOpen an existing virtual file.', WRITE: 'FOR WRITE\nCreate or truncate a virtual file.',
  LENGTH: 'LENGTH(String)\nReturns the number of characters.', LCASE: 'LCASE(StringOrChar)\nLowercase; preserves STRING/CHAR.', UCASE: 'UCASE(StringOrChar)\nUppercase; preserves STRING/CHAR.', SUBSTRING: 'SUBSTRING(String, Start, Length)\nPositions start at 1; Start and Length are positive INTEGERs.', ROUND: 'ROUND(RealValue, Places)\nReturns REAL, rounded to Places decimal places.', RANDOM: 'RANDOM()\nReturns REAL from 0 to 1 inclusive.', DIV: 'DIV(Integer1, Integer2)\nQuotient with fractional part discarded.', MOD: 'MOD(Integer1, Integer2)\nInteger remainder.',
  INTEGER: 'INTEGER: a whole number.', REAL: 'REAL: a number with a fractional part; use 4.0 for a REAL literal.', STRING: 'STRING: text in double quotes.', CHAR: "CHAR: one character in single quotes.", BOOLEAN: 'BOOLEAN: TRUE or FALSE.', TRUE: 'TRUE: Boolean literal.', FALSE: 'FALSE: Boolean literal.', AND: 'Boolean AND: both operands TRUE.', OR: 'Boolean OR: at least one operand TRUE.', NOT: 'NOT Boolean: reverse TRUE/FALSE.'
};
export function referenceAt(source: string, cursor: number) {
  const left = source.slice(0, cursor).match(/[A-Za-z]+$/)?.[0] ?? '', right = source.slice(cursor).match(/^[A-Za-z]+/)?.[0] ?? '';
  return REFERENCE[(left + right).toUpperCase()] ?? '';
}
export function traceChoices(program: Statement[]) {
  const names = new Map<string, string>();
  const integerLiteral = (e: import('./model').Expr): number | undefined => e.kind === 'literal' && e.data.type === 'INTEGER' ? e.data.value as number : e.kind === 'unary' && e.op === '-' && e.operand.kind === 'literal' && e.operand.data.type === 'INTEGER' ? -(e.operand.data.value as number) : undefined;
  const visit = (statements: Statement[], scope: string) => statements.forEach(s => {
    if (s.kind === 'routine') { s.params.forEach(p => names.set(`${s.name.toUpperCase()}::${p.name.toUpperCase()}`, `${s.name} · ${p.name}`)); visit(s.body, s.name); }
    else {
      if (s.kind === 'declare' || s.kind === 'constant') {
        const id = `${scope.toUpperCase()}::${s.name.toUpperCase()}`; names.set(id, `${scope} · ${s.name}`);
        if (s.kind === 'declare' && s.bounds) {
          const bounds = s.bounds.map(([lo, hi]) => [integerLiteral(lo), integerLiteral(hi)] as const);
          if (bounds.every(([lo, hi]) => lo !== undefined && hi !== undefined && lo <= hi) && bounds.reduce((n, [lo, hi]) => n * (hi! - lo! + 1), 1) <= 100) {
            if (bounds.length === 1) for (let i = bounds[0][0]!; i <= bounds[0][1]!; i++) names.set(`${id}[${i}]`, `${scope} · ${s.name}[${i}]`);
            else for (let row = bounds[0][0]!; row <= bounds[0][1]!; row++) for (let col = bounds[1][0]!; col <= bounds[1][1]!; col++) names.set(`${id}[${row},${col}]`, `${scope} · ${s.name}[${row},${col}]`);
          }
        }
      }
      if (s.kind === 'if') { visit(s.yes, scope); visit(s.no, scope); }
      if (s.kind === 'for' || s.kind === 'while' || s.kind === 'repeat') visit(s.body, scope);
      if (s.kind === 'case') { s.branches.forEach(b => visit([b.body], scope)); if (s.otherwise) visit([s.otherwise], scope); }
    }
  });
  visit(program, 'Global'); return [...names].map(([id, label]) => ({ id, label }));
}
