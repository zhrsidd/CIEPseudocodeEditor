import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from './parser';
import { Interpreter } from './interpreter';
import { DebugGate, TraceRecorder, type StepEvent } from './debugger';
import { traceChoices } from './editor';
import { parseProgramImport, safeFilename, saveProgram, validateProgramName } from './workspace';

function debug(source: string, breakpoints = new Set<number>(), pauseInitially = true) {
  const control = new AbortController(), pauses: StepEvent[] = [], waits: ((event?: StepEvent) => void)[] = [];
  let finished = false;
  const gate = new DebugGate(control.signal, event => { const waiter = waits.shift(); if (waiter) waiter(event); else pauses.push(event); }, breakpoints, pauseInitially);
  const runtime = new Interpreter({ signal: control.signal, beforeStep: event => gate.before(event), input: async () => '', output: () => {} });
  const done = runtime.run(compile(source).program).finally(() => { finished = true; waits.splice(0).forEach(waiter => waiter()); });
  return { gate, runtime, done, next: async () => pauses.shift() ?? (finished ? undefined : new Promise<StepEvent | undefined>(resolve => waits.push(resolve))) };
}

test('continue mode pauses at a breakpoint and can resume to completion', async () => {
  const h = debug('DECLARE N : INTEGER\nN ← 1\nN ← 2\nOUTPUT N', new Set([3]), false);
  assert.equal((await h.next())?.position.line, 3); h.gate.continue(); await h.done;
});
test('breakpoints can be replaced while a debug run is active', async () => {
  const h = debug('DECLARE N : INTEGER\nN ← 1\nN ← 2', new Set([2]), false);
  assert.equal((await h.next())?.position.line, 2); h.gate.setBreakpoints([3]); h.gate.continue(); assert.equal((await h.next())?.position.line, 3); h.gate.continue(); await h.done;
});
test('step over skips function internals and pauses in the caller', async () => {
  const h = debug('FUNCTION F RETURNS INTEGER\nRETURN 7\nENDFUNCTION\nDECLARE N : INTEGER\nN ← F()\nOUTPUT N');
  assert.equal((await h.next())?.position.line, 4); h.gate.step(); assert.equal((await h.next())?.position.line, 5); h.gate.stepOver(); const next = await h.next(); assert.equal(next?.position.line, 6); assert.equal(next?.snapshot.variables[0].value?.value, 7); h.gate.continue(); await h.done;
});
test('step out resumes at the first caller statement', async () => {
  const h = debug('FUNCTION F RETURNS INTEGER\nRETURN 7\nENDFUNCTION\nDECLARE N : INTEGER\nN ← F()\nOUTPUT N');
  await h.next(); h.gate.step(); await h.next(); h.gate.step(); const inner = await h.next(); assert.equal(inner?.position.line, 2); h.gate.stepOut(); assert.equal((await h.next())?.position.line, 6); h.gate.continue(); await h.done;
});
test('snapshots expose browsable caller frames', async () => {
  const h = debug('PROCEDURE Q(B : INTEGER)\nOUTPUT B\nENDPROCEDURE\nPROCEDURE P(A : INTEGER)\nCALL Q(A)\nENDPROCEDURE\nCALL P(3)\nOUTPUT 0');
  await h.next(); h.gate.step(); await h.next(); h.gate.step(); const nested = await h.next();
  assert.deepEqual(nested?.snapshot.stack.map(frame => frame.routine), ['Main program', 'P', 'Q']);
  assert.equal(nested?.snapshot.stack[1].variables[0].value?.value, 3); assert.equal(nested?.snapshot.stack[2].variables[0].name, 'B'); h.gate.continue(); await h.done;
});
test('array snapshots support arbitrary 50-element pages', async () => {
  const runtime = new Interpreter({ input: async () => '', output: () => {} });
  await runtime.run(compile('DECLARE A : ARRAY[1:120] OF INTEGER\nA[110] ← 9').program);
  const array = runtime.snapshot({ 'GLOBAL::A': 100 }).variables[0];
  assert.equal(array.elementOffset, 100); assert.equal(array.elements?.[9].index, '110'); assert.equal(array.elements?.[9].value?.value, 9); assert.equal(array.elements?.length, 20);
});
test('individual array elements can be selected and recorded in traces', async () => {
  const selected = 'GLOBAL::A[100]', events: StepEvent[] = [], trace = new TraceRecorder([selected]);
  const runtime = new Interpreter({ watch: [selected], input: async () => '', output: () => {}, onStep: event => events.push(event) });
  await runtime.run(compile('DECLARE A : ARRAY[1:100] OF INTEGER\nA[100] ← 7').program); events.forEach(event => trace.record(event));
  assert.deepEqual(trace.rows.map(row => row.values[0]), ['—', '7']);
});
test('trace choices include literal-bounded array elements', () => {
  const ids = traceChoices(compile('DECLARE A : ARRAY[-1:1] OF INTEGER').program).map(choice => choice.id);
  assert.deepEqual(ids, ['GLOBAL::A', 'GLOBAL::A[-1]', 'GLOBAL::A[0]', 'GLOBAL::A[1]']);
});
test('saved program helpers validate, replace and preserve source', () => {
  assert.deepEqual(saveProgram({}, ' Search ', 'OUTPUT 1'), { Search: 'OUTPUT 1' });
  assert.deepEqual(saveProgram({ Search: 'old' }, 'Search', 'new'), { Search: 'new' });
  assert.throws(() => validateProgramName('../bad'), /without slashes/);
});
test('program imports normalize newlines and require a supported extension', () => {
  assert.deepEqual(parseProgramImport('Search.pseudocode', 'OUTPUT 1\r\n'), { name: 'Search', source: 'OUTPUT 1\n' });
  assert.throws(() => parseProgramImport('Search.js', 'x'), /pseudocode or .txt/);
  assert.equal(safeFilename('My program!', '.pseudocode'), 'My-program.pseudocode');
});
