import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from './parser';
import { Interpreter, parseInput, StoppedError } from './interpreter';
import { LanguageError } from './model';
import { examples } from '../examples';
async function execute(source: string, inputs: string[] = [], maxSteps?: number) {
  const output: string[] = []; let index = 0;
  await new Interpreter({ output: text => output.push(text), input: async () => { assert.ok(index < inputs.length, 'Unexpected INPUT'); return inputs[index++]; }, maxSteps }).run(compile(source).program);
  return output;
}
test('arithmetic precedence, exponent associativity, unary signs, DIV/MOD', async () => {
  assert.deepEqual(await execute('OUTPUT 2 + 3 * 4, ",", 2 ^ 3 ^ 2, ",", -2 ^ 2, ",", 2 ^ -2\nOUTPUT DIV(-10, 3), ",", MOD(-10, 3), ",", 6 / 2'), ['14,512,-4,0.25', '-3,-1,3']);
});
test('comments, all literals, literal constants and case-insensitive references', async () => {
  assert.deepEqual(await execute(`// comment
CONSTANT Rate ← -6.50
DECLARE Total : REAL
DECLARE Letter : CHAR
DECLARE Message : STRING
DECLARE Flag : BOOLEAN
Total ← Rate * 2.0
Letter ← '🙂'
Message ← "// is text"
Flag ← TRUE
OUTPUT total, Letter, Message, Flag, FALSE, "" // inline`), ['-13🙂// is textTRUEFALSE']);
});
test('all relational operators and boolean precedence', async () => {
  assert.deepEqual(await execute('OUTPUT 1 = 1, 1 <> 2, 1 < 2, 2 > 1, 1 <= 1, 2 >= 2\nOUTPUT NOT 1 = 2 AND FALSE OR TRUE'), ['TRUETRUETRUETRUETRUETRUE', 'TRUE']);
});
test('nested IF, multiline and inline THEN', async () => {
  assert.deepEqual(await execute(`IF FALSE THEN
OUTPUT "bad"
ELSE
IF TRUE
THEN
OUTPUT "yes"
ENDIF
ENDIF`), ['yes']);
});
test('FOR inclusive, empty, equal, descending, non-divisible and nested ranges', async () => {
  assert.deepEqual(await execute(`DECLARE i : INTEGER
DECLARE j : INTEGER
FOR i ← 1 TO 3
OUTPUT i
NEXT I
FOR i ← 2 TO 1
OUTPUT "bad"
NEXT i
FOR i ← 5 TO 1 STEP -3
OUTPUT i
NEXT i
FOR i ← 2 TO 2
FOR j ← 1 TO 2
OUTPUT i, j
NEXT j
NEXT i`), ['1', '2', '3', '5', '2', '21', '22']);
});
test('WHILE precondition and REPEAT postcondition', async () => {
  assert.deepEqual(await execute(`DECLARE N : INTEGER
N ← 0
WHILE FALSE DO
OUTPUT "bad"
ENDWHILE
REPEAT
N ← N + 1
UNTIL N >= 2
WHILE N < 4 DO
N ← N + 1
ENDWHILE
OUTPUT N`), ['4']);
});
test('typed INPUT preserves string spaces', async () => {
  assert.deepEqual(await execute(`DECLARE N : INTEGER
DECLARE R : REAL
DECLARE S : STRING
DECLARE C : CHAR
DECLARE B : BOOLEAN
INPUT N
INPUT R
INPUT S
INPUT C
INPUT B
OUTPUT N, R, S, C, B`, ['-2', '3.5', ' hi ', 'x', 'TRUE']), ['-23.5 hi xTRUE']);
});
const invalid: [string, RegExp][] = [
  ['OUTPUT Missing', /not been declared/],
  ['DECLARE N : INTEGER\nOUTPUT N', /no value/],
  ['DECLARE N : INTEGER\nN ← 2.0', /needs INTEGER/],
  ['DECLARE R : REAL\nR ← 2', /needs REAL/],
  ['DECLARE C : CHAR\nC ← "x"', /needs CHAR/],
  ['CONSTANT N ← 1\nN ← 2', /constant/],
  ['CONSTANT N ← 1\nINPUT N', /constant/],
  ['DECLARE Name : INTEGER\nDECLARE NAME : INTEGER', /already declared/],
  ['OUTPUT 1 / 0', /zero/], ['OUTPUT DIV(1, 0)', /zero/], ['OUTPUT MOD(1, 0)', /zero/],
  ['OUTPUT DIV(1.0, 2)', /INTEGER/], ['OUTPUT "a" + "b"', /Arithmetic/],
  ['IF 1 THEN\nENDIF', /BOOLEAN/], ['OUTPUT TRUE AND 1', /BOOLEAN/],
  ['OUTPUT "1" = 1', /Cannot compare/], ['OUTPUT TRUE < FALSE', /BOOLEAN/],
  ['DECLARE N : INTEGER\nFOR N ← 1 TO 2 STEP 0\nNEXT N', /zero/],
  ['DECLARE N : REAL\nFOR N ← 1 TO 2\nNEXT N', /INTEGER/],
  ['DECLARE N : INTEGER\nFOR N ← 1.0 TO 2\nNEXT N', /INTEGER/],
  ['OUTPUT 10 ^ 400', /range/], ['OUTPUT 9007199254740991 + 1', /range/],
];
for (const [source, message] of invalid) test(`runtime rejects ${source.replaceAll('\n', ' / ')}`, async () => { await assert.rejects(execute(source), message); });
const badSyntax: [string, RegExp][] = [
  ['CONSTANT X ← 1 + 2', /literal/], ['CONSTANT X ← -TRUE', /literal/],
 ['DECLARE Bad_Name : INTEGER', /Unexpected character/],
  ['DECLARE IF : INTEGER', /identifier/], ['output 1', /upper case/],
  ["OUTPUT 'ab'", /exactly one/], ['OUTPUT "oops', /Unterminated/],
  ['OUTPUT 1.', /both sides/], ['OUTPUT .2', /Unexpected/],
  ['IF TRUE THEN\nOUTPUT 1', /ENDIF/], ['FOR I ← 1 TO 2\nNEXT J', /NEXT/],
  ['OUTPUT 1 OUTPUT 2', /end of the statement/], ['OUTPUT', /expression/],
  ['OUTPUT DIV(1)', /Expected ,/], ['DECLARE A : ARRAY', /Expected \[/]
];
for (const [source, message] of badSyntax) test(`parser rejects ${source.replaceAll('\n', ' / ')}`, () => assert.throws(() => compile(source), message));
test('errors retain exact line and column', async () => {
  await assert.rejects(execute('// a\nOUTPUT 1 / 0'), err => err instanceof LanguageError && err.position.line === 2 && err.position.column === 10);
});
test('ASCII assignment warning and typographic quotes from guidance', async () => {
  assert.equal(compile('DECLARE N : INTEGER\nN <- 1').warnings[0].line, 2);
  assert.deepEqual(await execute('OUTPUT “Hello”, ꞌxꞌ, 4 – 2'), ['Hellox2']);
});
test('input validation', () => {
  for (const [input, type] of [['1.2', 'INTEGER'], ['', 'REAL'], ['NaN', 'REAL'], ['yes', 'BOOLEAN'], ['xx', 'CHAR']] as const) assert.throws(() => parseInput(input, type, { line: 1, column: 1 }), LanguageError);
});
test('execution limits also catch empty loops', async () => { await assert.rejects(execute('WHILE TRUE DO\nENDWHILE', [], 20), /Execution limit/); });
test('abort interrupts running loop after yielding', async () => {
  const controller = new AbortController();
  const promise = new Interpreter({ signal: controller.signal, output: () => {}, input: async () => '' }).run(compile('WHILE TRUE DO\nENDWHILE').program);
  setTimeout(() => controller.abort(), 0); await assert.rejects(promise, StoppedError);
});
test('output limits bound memory', async () => { await assert.rejects(execute(`WHILE TRUE DO\nOUTPUT "${'a'.repeat(1000)}"\nENDWHILE`), /Output limit/); });
test('all shipped examples run', async () => {
  assert.equal((await execute(examples['Welcome & input'], ['Ada', '15'])).at(-1), 'Hello, Ada. Keep exploring!');
  assert.equal((await execute(examples['Times table'], ['7'])).at(-1), '7 × 12 = 84');
  assert.deepEqual(await execute(examples.Countdown), ['5', '4', '3', '2', '1', 'Lift off!']);
  assert.equal((await execute(examples['Password loop'], ['wrong', 'Secret'])).at(-1), 'Access granted');
  assert.deepEqual(await execute(examples['Digits & arithmetic']), ['2', '7', '4', '2 to the power of 3 = 8']);
  assert.deepEqual(await execute(examples['Types & logic']), ['Total: 26', 'Grade: A; passed: TRUE']);
});

test('parenthesized constants are expressions, not literal syntax', () => {
  for (const source of ['CONSTANT X ← (1)', 'CONSTANT X ← -(1)']) assert.throws(() => compile(source), /literal/);
});
test('empty output lines are bounded', async () => {
  await assert.rejects(execute('WHILE TRUE DO\nOUTPUT ""\nENDWHILE'), /Output limit/);
});

test('lowercase declarations now warn instead of blocking', () => { assert.match(compile('DECLARE badName : INTEGER').warnings[0].message, /capital/); });
