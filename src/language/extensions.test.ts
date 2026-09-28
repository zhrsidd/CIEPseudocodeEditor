import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from './parser';
import { Interpreter, StoppedError } from './interpreter';
import { LanguageError, type DataType } from './model';
import { diagnosticExcerpt } from './diagnostics';
import { highlight } from './highlight';
import { builtin } from './builtins';
async function execute(source: string, inputs: string[] = []) {
  const output: string[] = []; let index = 0;
  await new Interpreter({ output: text => output.push(text), input: async () => { assert.ok(index < inputs.length, 'Unexpected input'); return inputs[index++]; } }).run(compile(source).program);
  return output;
}
test('1D arrays read, write, input and expression indices with custom lower bounds', async () => {
  assert.deepEqual(await execute(`DECLARE Names : ARRAY[-2:0] OF STRING
DECLARE Index : INTEGER
Index ← -2
Names[Index] ← "Ali"
Names[Index + 1] ← Names[Index]
INPUT Names[0]
OUTPUT Names[-2], ",", Names[-1], ",", Names[0]`, ['Ada']), ['Ali,Ali,Ada']);
});
test('2D arrays keep distinct coordinates and preserve CHAR', async () => {
  assert.deepEqual(await execute(`DECLARE Board : ARRAY[0:1, 3:4] OF CHAR
Board[0,3] ← 'X'
Board[1,3] ← 'Y'
Board[0,4] ← 'Z'
INPUT Board[1,4]
OUTPUT Board[0,3], Board[1,3], Board[0,4], Board[1,4]`, ['W']), ['XYZW']);
});
test('array bounds may use initialized integer expressions', async () => {
  assert.deepEqual(await execute('CONSTANT Size ← 3\nDECLARE A : ARRAY[Size - 2:Size] OF INTEGER\nA[3] ← 7\nOUTPUT A[3] * 2'), ['14']);
});
for (const [type, literal, expected] of [['INTEGER', '2', '2'], ['REAL', '2.0', '2'], ['STRING', '"Hi"', 'Hi'], ['CHAR', "'x'", 'x'], ['BOOLEAN', 'TRUE', 'TRUE']]) {
  test(`array elements support ${type}`, async () => assert.deepEqual(await execute(`DECLARE A : ARRAY[4:4] OF ${type}\nA[4] ← ${literal}\nOUTPUT A[4]`), [expected]));
}
const arrayErrors: [string, RegExp][] = [
  ['DECLARE A : ARRAY[1:3] OF INTEGER\nOUTPUT A[0]', /range.*\[1:3\]/],
  ['DECLARE A : ARRAY[1:3] OF INTEGER\nA[4] ← 1', /range.*\[1:3\]/],
  ['DECLARE A : ARRAY[-2:0, 5:6] OF INTEGER\nINPUT A[-1,7]', /dimension 2.*\[-2:0, 5:6\]/],
  ['DECLARE A : ARRAY[1:3] OF INTEGER\nOUTPUT A[1]', /no value/],
  ['DECLARE A : ARRAY[1:3] OF INTEGER\nA[1] ← 1.0', /needs INTEGER/],
  ['DECLARE A : ARRAY[1:3] OF INTEGER\nOUTPUT A[1.0]', /requires INTEGER/],
  ['DECLARE A : ARRAY[1:3] OF INTEGER\nOUTPUT A', /requires 1 index/],
  ['DECLARE A : ARRAY[1:3, 0:1] OF INTEGER\nOUTPUT A[1]', /requires 2 index/],
  ['DECLARE A : ARRAY[1:3] OF INTEGER\nOUTPUT A[1,2]', /requires 1 index/],
  ['DECLARE A : INTEGER\nA[1] ← 1', /scalar/],
  ['DECLARE A : ARRAY[3:1] OF INTEGER', /lower bound/],
  ['DECLARE A : ARRAY[1.0:3] OF INTEGER', /requires INTEGER/],
  ['DECLARE A : ARRAY[1:100001] OF INTEGER', /allocation limit/],
  ['DECLARE A : ARRAY[1:3] OF INTEGER\nA ← 2', /requires 1 index/],
  ['DECLARE A : ARRAY[1:3] OF INTEGER\nFOR A ← 1 TO 2\nNEXT A', /FOR counter/]
];
for (const [source, message] of arrayErrors) test(`array rejection: ${source.replaceAll('\n', ' / ')}`, async () => assert.rejects(execute(source), message));
for (const [type, literal] of [['INTEGER', '-2'], ['REAL', '1.5'], ['STRING', '"yes"'], ['CHAR', "'W'"], ['BOOLEAN', 'TRUE']]) {
  test(`CASE selects ${type} and stops at first duplicate match`, async () => {
    assert.deepEqual(await execute(`DECLARE Move : ${type}\nMove ← ${literal}\nCASE OF Move\n${literal} : OUTPUT "first"\n${literal} : OUTPUT "bad"\nOTHERWISE OUTPUT "bad"\nENDCASE`), ['first']);
  });
}
test('CASE optional OTHERWISE and no match', async () => {
  assert.deepEqual(await execute('DECLARE N : INTEGER\nN ← 2\nCASE OF N\n1 : OUTPUT "bad"\nENDCASE\nCASE OF N\n1 : OUTPUT "bad"\nOTHERWISE OUTPUT "fallback"\nENDCASE'), ['fallback']);
});
test('CASE tests sequentially without evaluating later mismatched labels', async () => {
  assert.deepEqual(await execute('DECLARE N : INTEGER\nN ← 1\nCASE OF N\n1 : OUTPUT "first"\n"text" : OUTPUT "bad"\nENDCASE'), ['first']);
});
test('CASE mismatched label type fails when reached', async () => {
  await assert.rejects(execute('DECLARE N : INTEGER\nN ← 1\nCASE OF N\n"text" : OUTPUT "bad"\nENDCASE'), /CASE label is STRING/);
});
test('nested CASE in a branch', async () => {
  assert.deepEqual(await execute('DECLARE N : INTEGER\nN ← 1\nCASE OF N\n1 : CASE OF N\n1 : OUTPUT "nested"\nENDCASE\nENDCASE'), ['nested']);
});
test('procedures: no parameters, value parameters, independent local scope', async () => {
  assert.deepEqual(await execute(`PROCEDURE Change(N : INTEGER)
DECLARE Local : INTEGER
Local ← N + 1
N ← 99
OUTPUT Local
ENDPROCEDURE
PROCEDURE Blank
OUTPUT ""
ENDPROCEDURE
DECLARE N : INTEGER
N ← 4
CALL Change(N)
CALL Change(5)
CALL Blank
CALL Blank()
OUTPUT N`), ['5', '6', '', '', '4']);
});
test('scope is lexical: callee cannot see caller locals; globals remain visible', async () => {
  assert.deepEqual(await execute(`PROCEDURE Inner
OUTPUT N
ENDPROCEDURE
PROCEDURE Outer
DECLARE N : INTEGER
N ← 99
CALL Inner
ENDPROCEDURE
DECLARE N : INTEGER
N ← 7
CALL Outer
OUTPUT N`), ['7', '7']);
});
test('routine local arrays shadow globals and are fresh for every call', async () => {
  assert.deepEqual(await execute(`PROCEDURE P
DECLARE A : ARRAY[0:0] OF INTEGER
A[0] ← 8
OUTPUT A[0]
ENDPROCEDURE
DECLARE A : ARRAY[1:1] OF INTEGER
A[1] ← 1
CALL P
CALL P
OUTPUT A[1]`), ['8', '8', '1']);
});
test('function expressions, no-parameter syntax and early RETURN through loops', async () => {
  assert.deepEqual(await execute(`FUNCTION SumSquare(A : INTEGER, B : INTEGER) RETURNS INTEGER
RETURN A * A + B * B
ENDFUNCTION
FUNCTION First RETURNS INTEGER
REPEAT
RETURN 3
UNTIL FALSE
ENDFUNCTION
OUTPUT SumSquare(10, 20), ",", First, ",", First() + SumSquare(1, 2)`), ['500,3,8']);
});
test('functions in array indices, bounds, FOR bounds and IF conditions', async () => {
  assert.deepEqual(await execute(`FUNCTION Two RETURNS INTEGER
RETURN 2
ENDFUNCTION
DECLARE A : ARRAY[1:Two()] OF INTEGER
DECLARE I : INTEGER
FOR I ← 1 TO Two()
A[I] ← I
NEXT I
IF A[Two()] = Two() THEN
OUTPUT A[Two()]
ENDIF`), ['2']);
});
test('function can request INPUT asynchronously', async () => {
  assert.deepEqual(await execute('FUNCTION ReadNumber RETURNS INTEGER\nDECLARE N : INTEGER\nINPUT N\nRETURN N\nENDFUNCTION\nOUTPUT ReadNumber() + ReadNumber()', ['2','3']), ['5']);
});
test('recursion has independent frames and supports base-case RETURN', async () => {
  assert.deepEqual(await execute('FUNCTION Fact(N : INTEGER) RETURNS INTEGER\nIF N = 0 THEN\nRETURN 1\nENDIF\nRETURN N * Fact(N - 1)\nENDFUNCTION\nOUTPUT Fact(5)'), ['120']);
});
test('unbounded recursion gives a language error', async () => {
  await assert.rejects(execute('FUNCTION Loop RETURNS INTEGER\nRETURN Loop()\nENDFUNCTION\nOUTPUT Loop()'), /call depth limit/);
});
test('procedure can mutate an explicitly referenced global', async () => {
  assert.deepEqual(await execute('PROCEDURE P\nN ← N + 1\nENDPROCEDURE\nDECLARE N : INTEGER\nN ← 1\nCALL P\nOUTPUT N'), ['2']);
});
const routineErrors: [string, RegExp][] = [
  ['PROCEDURE P(N : INTEGER)\nENDPROCEDURE\nCALL P', /expects 1 argument/],
  ['PROCEDURE P\nENDPROCEDURE\nCALL P(1)', /expects 0 argument/],
  ['PROCEDURE P(N : INTEGER)\nENDPROCEDURE\nCALL P(1.0)', /parameter N needs INTEGER/],
  ['PROCEDURE P\nENDPROCEDURE\nOUTPUT P()', /procedure.*expression/],
  ['FUNCTION F RETURNS INTEGER\nRETURN 1\nENDFUNCTION\nCALL F', /function; CALL/],
  ['FUNCTION F RETURNS INTEGER\nRETURN "x"\nENDFUNCTION\nOUTPUT F()', /must RETURN INTEGER/],
  ['FUNCTION F RETURNS INTEGER\nIF FALSE THEN\nRETURN 1\nENDIF\nENDFUNCTION\nOUTPUT F()', /without returning/],
  ['FUNCTION F(N : STRING) RETURNS STRING\nRETURN N\nENDFUNCTION\nOUTPUT F(1)', /parameter N needs STRING/],
  ['FUNCTION F(N : INTEGER) RETURNS INTEGER\nRETURN N\nENDFUNCTION\nOUTPUT F()', /expects 1 argument/],
  ['PROCEDURE P\nDECLARE Local : INTEGER\nLocal ← 1\nENDPROCEDURE\nCALL P\nOUTPUT Local', /not been declared/],
  ['CALL Missing', /Unknown procedure/], ['OUTPUT Missing()', /Unknown function/],
  ['CALL LENGTH("x")', /CALL is only/],
  ['PROCEDURE P\nENDPROCEDURE\nDECLARE P : INTEGER', /already declared/],
  ['PROCEDURE P(N : INTEGER)\nDECLARE N : INTEGER\nENDPROCEDURE\nCALL P(1)', /already declared/]
];
for (const [source, message] of routineErrors) test(`routine rejection: ${source.replaceAll('\n', ' / ')}`, async () => assert.rejects(execute(source), message));
const malformed: [string, RegExp][] = [
  ['DECLARE A : ARRAY[1:3,1:3,1:3] OF INTEGER', /1D and 2D/],
  ['DECLARE A : ARRAY[1:3 OF INTEGER', /Expected \]/],
  ['DECLARE A : ARRAY[1:3] INTEGER', /Expected OF/],
  ['OUTPUT A[]', /expression/], ['OUTPUT A[1,2,3]', /1D and 2D/],
  ['CASE Move\nENDCASE', /Expected OF/],
  ['CASE OF Move\n1 OUTPUT 1\nENDCASE', /Expected :/],
  ['CASE OF Move\n1 :\nOUTPUT 1\nENDCASE', /one statement/],
  ['CASE OF Move\n1 : OUTPUT 1', /ENDCASE/],
  ['CASE OF Move\n1 : OUTPUT 1\nOTHERWISE OUTPUT 2\n2 : OUTPUT 3\nENDCASE', /OTHERWISE must be/],
  ['CASE OF Move\n1 : OUTPUT 1\nOTHERWISE OUTPUT 2\nOTHERWISE OUTPUT 3\nENDCASE', /OTHERWISE must be/],
  ['CASE OF Move\nENDCASE', /at least one/],
  ['CASE OF Move\nValue : OUTPUT 1\nENDCASE', /literal/],
  ['OUTPUT 1\nPROCEDURE P\nENDPROCEDURE', /start of the program/],
  ['PROCEDURE P\nPROCEDURE Q\nENDPROCEDURE\nENDPROCEDURE', /Nested definitions/],
  ['PROCEDURE P\nENDPROCEDURE\nPROCEDURE p\nENDPROCEDURE', /Duplicate routine/],
  ['PROCEDURE P(A : INTEGER, a : INTEGER)\nENDPROCEDURE', /Duplicate parameter/],
  ['PROCEDURE P\nRETURN 1\nENDPROCEDURE', /only allowed inside a FUNCTION/],
  ['RETURN 1', /only allowed inside a FUNCTION/],
  ['FUNCTION F\nRETURN 1\nENDFUNCTION', /RETURNS/],
  ['FUNCTION F RETURNS INTEGER\nRETURN 1', /ENDFUNCTION/],
  ['PROCEDURE P\nOUTPUT 1', /ENDPROCEDURE/]
];
for (const [source, message] of malformed) test(`extended parser rejection: ${source.replaceAll('\n',' / ')}`, () => assert.throws(() => compile(source), message));
const builtinPrograms: [string, string][] = [
  ['LENGTH("Happy Days")', '10'], ['LENGTH("")', '0'], ['LENGTH("🙂a")', '2'],
  ['LCASE("HeLLo")', 'hello'], ['LCASE(\'W\')', 'w'], ['UCASE("Happy")', 'HAPPY'], ['UCASE(\'x\')', 'X'],
  ['SUBSTRING("Happy Days", 1, 5)', 'Happy'], ['SUBSTRING("abc", 3, 1)', 'c'], ['SUBSTRING("🙂a", 1, 1)', '🙂'],
  ['ROUND(1.005, 2)', '1.01'], ['ROUND(-1.25, 1)', '-1.3'], ['ROUND(2.5, 0)', '3'], ['ROUND(9.99, 1)', '10']
];
for (const [expression, expected] of builtinPrograms) test(`built-in ${expression}`, async () => assert.deepEqual(await execute(`OUTPUT ${expression}`), [expected]));
test('built-ins preserve CHAR/STRING and ROUND returns REAL', async () => {
  assert.deepEqual(await execute('DECLARE C : CHAR\nDECLARE S : STRING\nDECLARE R : REAL\nC ← UCASE(\'a\')\nS ← LCASE("A")\nR ← ROUND(2.5, 0)\nOUTPUT C, S, R'), ['Aa3']);
});
for (const expression of ['LENGTH()', 'LENGTH(1)', 'LENGTH(\'x\')', 'LCASE(TRUE)', 'UCASE(1)', 'SUBSTRING("abc", 0, 1)', 'SUBSTRING("abc", 1, 0)', 'SUBSTRING("abc", 3, 2)', 'SUBSTRING("abc", 1.0, 1)', 'SUBSTRING(\'a\', 1, 1)', 'ROUND(1, 0)', 'ROUND(1.0, 1.0)', 'ROUND(1.0, -1)', 'ROUND(1.0, 16)', 'RANDOM(1)', 'UCASE(\'ß\')']) {
  test(`built-in rejects ${expression}`, async () => assert.rejects(execute(`OUTPUT ${expression}`), LanguageError));
}
test('RANDOM returns REAL throughout inclusive permitted range', async () => {
  for (const value of [0, 0.5, 1]) assert.deepEqual(builtin('RANDOM', [], { line: 1, column: 1 }, () => value), { type: 'REAL', value });
  const output = await execute('DECLARE R : REAL\nR ← RANDOM()\nOUTPUT R >= 0.0 AND R <= 1.0'); assert.deepEqual(output, ['TRUE']);
});
test('warnings do not block identifiers or ASCII assignment', async () => {
  const source = 'DECLARE score : INTEGER\nscore <- 5\nOUTPUT Score';
  const { warnings } = compile(source); assert.equal(warnings.length, 3);
  assert.equal(warnings[1].line, 2); assert.equal(warnings[2].column, 7);
  assert.ok(warnings.every(w => w.hint)); assert.deepEqual(await execute(source), ['5']);
});
test('PascalCase and conventional single-letter indices do not warn', () => {
  assert.equal(compile('DECLARE CountDown : INTEGER\nDECLARE i : INTEGER\nCountDown ← 1').warnings.length, 0);
});
test('warnings coexist with fatal parser and lexer errors', () => {
  for (const source of ['DECLARE score : INTEGER\nOUTPUT (', 'DECLARE score : INTEGER\n@']) assert.throws(() => compile(source), err => err instanceof LanguageError && err.warnings.length === 1);
});
test('type diagnostics point to offending expression with hint and caret', async () => {
  const source = 'DECLARE Name : STRING\nName ← 42';
  await assert.rejects(execute(source), err => {
    assert.ok(err instanceof LanguageError); assert.equal(err.position.line, 2); assert.equal(err.position.column, 8);
    assert.ok(err.hint); assert.deepEqual(diagnosticExcerpt(source, { ...err.position, message: err.message }), { sourceLine: 'Name ← 42', caret: '       ^^' }); return true;
  });
});
test('diagnostic caret expands tabs and handles EOF', () => {
  assert.equal(diagnosticExcerpt('\tOUTPUT X', { line: 1, column: 9, message: 'x' }).caret, '           ^');
  assert.equal(diagnosticExcerpt('', { line: 1, column: 1, message: 'x' }).caret, '^');
});
test('highlighting classifies all requested token groups and preserves source', () => {
  const source = '// comment\nDECLARE A : INTEGER\nA ← LENGTH("a") + 42\nOUTPUT \'x\', TRUE';
  const tokens = highlight(source); assert.equal(tokens.map(t => t.text).join(''), source);
  for (const style of ['comment', 'keyword', 'type', 'operator', 'builtin', 'string', 'number', 'char', 'boolean']) assert.ok(tokens.some(t => t.style === style), style);
});
test('highlighting tolerates incomplete code and does not interpret markup', () => {
  for (const source of ['OUTPUT "unfinished\nDECLARE', 'OUTPUT "<script>"', 'A[', '🙂', 'OUTPUT “text”', '\r\n']) assert.equal(highlight(source).map(t => t.text).join(''), source);
});
test('stopping recursive procedure execution unwinds frames', async () => {
  const controller = new AbortController();
  const source = 'PROCEDURE P\nWHILE TRUE DO\nENDWHILE\nENDPROCEDURE\nCALL P';
  const run = new Interpreter({ signal: controller.signal, output: () => {}, input: async () => '' }).run(compile(source).program);
  setTimeout(() => controller.abort(), 0); await assert.rejects(run, StoppedError);
});

test('new example programs execute successfully', async () => {
  const { examples } = await import('../examples');
  assert.deepEqual(await execute(examples['Array of names'], ['Ada', 'Ali', 'Sam']), ['Enter name 1', 'Enter name 2', 'Enter name 3', '1: Ada', '2: Ali', '3: Sam']);
  assert.deepEqual(await execute(examples['Two-dimensional board']), ['- - -', '- X -', '- - -']);
  assert.deepEqual(await execute(examples['CASE navigation'], ['w']), ['Choose W, E, A or D', 'Position: 40']);
  assert.deepEqual(await execute(examples['Procedures & local scope']), ['Parameters are passed by value', 'Inside procedure: 8', 'Outside procedure: 7']);
  assert.deepEqual(await execute(examples.Functions), ['Sum of squares: 500', 'In an expression: 26']);
  const output = await execute(examples['String & number routines']);
  assert.deepEqual(output.slice(0, 4), ['Length: 10', 'First word: Happy', 'happy days / W', 'Rounded: 3.14']);
  assert.match(output[4], /^Random value \(0 to 1\): /);
});
test('nested CASE complexity is bounded', () => {
  const source = 'CASE OF N\n1 : '.repeat(160) + 'OUTPUT 1\n' + 'ENDCASE\n'.repeat(160);
  assert.throws(() => compile(source), /nesting is too deep/);
});
test('function RETURN from CASE and all scalar parameter types', async () => {
  assert.deepEqual(await execute(`FUNCTION SelectValue(N : INTEGER, R : REAL, S : STRING, C : CHAR, B : BOOLEAN) RETURNS STRING
CASE OF B
TRUE : RETURN S
FALSE : RETURN "no"
ENDCASE
ENDFUNCTION
OUTPUT SelectValue(1, 1.0, "yes", 'y', TRUE)`), ['yes']);
});
