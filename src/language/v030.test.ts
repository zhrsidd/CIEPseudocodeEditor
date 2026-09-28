import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from './parser';
import { Interpreter, StoppedError, parseInput } from './interpreter';
import { VirtualFiles, FileSession } from './files';
import { DebugGate, TraceRecorder, type StepEvent } from './debugger';
import { completion, declaredNames, enterEdit, examCode, referenceAt, traceChoices } from './editor';
import { LanguageError, type DataType } from './model';
async function execute(source: string, files = new VirtualFiles()) {
  const output: string[] = [], events: StepEvent[] = [];
  const runtime = new Interpreter({ files, input: async () => '', output: text => output.push(text), onStep: event => events.push(event) });
  await runtime.run(compile(source).program); return { output, events, runtime };
}
function debug(source: string) {
  const control = new AbortController(), pauses: StepEvent[] = [], waits: ((e: StepEvent | undefined) => void)[] = [];
  let finished = false;
  const gate = new DebugGate(control.signal, e => { const waiter = waits.shift(); if (waiter) waiter(e); else pauses.push(e); });
  const runtime = new Interpreter({ signal: control.signal, beforeStep: e => gate.before(e), input: async () => '', output: () => {} });
  const done = runtime.run(compile(source).program).finally(() => { finished = true; waits.splice(0).forEach(w => w(undefined)); });
  return { control, gate, runtime, done, next: async () => pauses.length ? pauses.shift() : finished ? undefined : new Promise<StepEvent | undefined>(resolve => waits.push(resolve)) };
}
test('file statements parse into explicit AST nodes', () => {
  assert.deepEqual(compile('OPENFILE "a" FOR READ\nREADFILE "a", Text\nOPENFILE "b" FOR WRITE\nWRITEFILE "b", Text\nCLOSEFILE "a"').program.map(s => s.kind), ['openfile','readfile','openfile','writefile','closefile']);
});
test('copy a line between virtual files', async () => {
  const files = new VirtualFiles({ 'a.txt': 'Hello\n' });
  await execute('DECLARE Text : STRING\nOPENFILE "a.txt" FOR READ\nOPENFILE "b.txt" FOR WRITE\nREADFILE "a.txt", Text\nWRITEFILE "b.txt", Text\nCLOSEFILE "a.txt"\nCLOSEFILE "b.txt"', files);
  assert.equal(files.read('b.txt'), 'Hello\n');
});
test('file identifiers accept STRING variables and WRITE truncates', async () => {
  const files = new VirtualFiles({ a: 'old\nold\n' });
  await execute('DECLARE Name : STRING\nName ← "a"\nOPENFILE Name FOR WRITE\nCLOSEFILE Name', files); assert.equal(files.read('a'), '');
});
for (const [type, text, expected] of [['INTEGER','4','4'],['REAL','4.5','4.5'],['BOOLEAN','TRUE','TRUE'],['CHAR','x','x'],['STRING',' hi ',' hi ']]) test(`READFILE / WRITEFILE ${type}`, async () => {
  const files = new VirtualFiles({ a: text + '\n' });
  const { output } = await execute(`DECLARE X : ${type}\nOPENFILE "a" FOR READ\nREADFILE "a", X\nOPENFILE "b" FOR WRITE\nWRITEFILE "b", X\nOUTPUT X`, files);
  assert.deepEqual(output,[expected]); assert.equal(files.read('b'), expected+'\n');
});
test('READFILE supports array element targets and EOF after the last line', async () => {
  const files = new VirtualFiles({ a: 'first\n\nlast\n' });
  assert.deepEqual((await execute('DECLARE A : ARRAY[1:3] OF STRING\nOPENFILE "a" FOR READ\nREADFILE "a", A[1]\nREADFILE "a", A[2]\nREADFILE "a", A[3]\nOUTPUT A[1], ",", A[2], ",", A[3]', files)).output, ['first,,last']);
});
const fileErrors: [string, RegExp][] = [
  ['OPENFILE "missing" FOR READ', /does not exist/],
  ['OPENFILE "a" FOR READ\nOPENFILE "a" FOR WRITE', /already open/],
  ['OPENFILE "a" FOR READ\nOPENFILE "a" FOR READ', /already open/],
  ['DECLARE X : STRING\nREADFILE "a", X', /not open/],
  ['DECLARE X : STRING\nX ← "hi"\nOPENFILE "a" FOR READ\nWRITEFILE "a", X', /not WRITE/],
  ['DECLARE X : STRING\nOPENFILE "a" FOR WRITE\nREADFILE "a", X', /not READ/],
  ['CLOSEFILE "a"', /not open/],
  ['DECLARE X : STRING\nOPENFILE "a" FOR READ\nCLOSEFILE "a"\nREADFILE "a", X', /not open/],
  ['DECLARE X : STRING\nOPENFILE "empty" FOR READ\nREADFILE "empty", X', /End of file/],
  ['OPENFILE 1 FOR READ', /STRING filename/],
  ['CONSTANT X ← 1\nOPENFILE "a" FOR READ\nREADFILE "a", X', /constant/],
  ['DECLARE X : INTEGER\nOPENFILE "a" FOR READ\nREADFILE "a", X', /valid INTEGER/]
];
for (const [source, error] of fileErrors) test(`file error: ${source.replaceAll('\n',' / ')}`, async () => assert.rejects(execute(source, new VirtualFiles({ a:'hello\n', empty:'' })), error));
for (const source of ['OPENFILE "a" FOR APPEND','OPENFILE "a" READ','READFILE "a" X','WRITEFILE "a", 42','CLOSEFILE','READFILE "a", X + 1']) test(`file syntax rejection ${source}`, () => assert.throws(() => compile(source), LanguageError));
test('file sessions close all handles and reset cursor on reopen', () => {
  const files = new VirtualFiles({ a:'a\nb' }), session = new FileSession(files);
  session.open('a','READ'); assert.equal(session.read('a'),'a'); assert.equal(session.read('a'),'b'); assert.throws(() => session.read('a'), /End of file/);
  session.closeAll(); session.open('a','READ'); assert.equal(session.read('a'),'a');
});
test('newline model has no phantom final line', () => {
  for (const [text, values] of [['',[]],['\n',['']],['x\n',['x']],['x\n\n',['x','']]] as [string,string[]][]) {
    const session = new FileSession(new VirtualFiles({a:text})); session.open('a','READ'); values.forEach(value => assert.equal(session.read('a'),value)); assert.throws(() => session.read('a'), /End of file/);
  }
});
test('virtual file CRUD, reset and validation are isolated from host paths', () => {
  const files = new VirtualFiles(); files.create('a'); files.write('a','x\r\ny'); files.rename('a','b'); assert.equal(files.read('b'),'x\ny'); assert.throws(() => files.create('b'), /exists/); assert.throws(() => files.create('../x'), /filename/); files.delete('b'); assert.deepEqual(files.snapshot(),{}); files.replace({c:'text'}); assert.equal(files.read('c'),'text');
});
test('virtual file size limit is atomic', () => {
  const files = new VirtualFiles({a:'ok'}); assert.throws(() => files.write('a','x'.repeat(1_000_001)), /limited/); assert.equal(files.read('a'),'ok');
});
test('new runs reset variables and handles but retain files', async () => {
  const files = new VirtualFiles({a:'one\ntwo'}), out: string[]=[];
  const runtime = new Interpreter({files,input:async()=>'',output:s=>out.push(s)});
  const program = compile('DECLARE X : STRING\nOPENFILE "a" FOR READ\nREADFILE "a", X\nOUTPUT X').program;
  await runtime.run(program); await runtime.run(program); assert.deepEqual(out,['one','one']);
  await assert.rejects(runtime.run(compile('OPENFILE "a" FOR READ\nOUTPUT Unknown').program)); assert.equal(runtime.snapshot().variables.length,0);
  await runtime.run(program); assert.equal(out.at(-1),'one');
});
test('step pauses before each assignment and exposes the previous result', async () => {
  const h=debug('DECLARE N : INTEGER\nN ← 4\nN ← N + 1\nOUTPUT N');
  assert.equal((await h.next())?.position.line,1); h.gate.step(); assert.equal((await h.next())?.position.line,2);
  h.gate.step(); const third=await h.next(); assert.equal(third?.position.line,3); assert.equal(third?.snapshot.variables[0].value?.value,4);
  h.gate.step(); assert.equal((await h.next())?.snapshot.variables[0].value?.value,5); h.gate.continue(); await h.done;
});
test('FOR stepping includes NEXT and each counter value', async () => {
  const {events}=await execute('DECLARE N : INTEGER\nFOR N ← 1 TO 2\nOUTPUT N\nNEXT N');
  assert.deepEqual(events.map(e=>[e.kind,e.position.line]),[['declare',1],['for',2],['output',3],['next',4],['output',3],['next',4]]);
  assert.equal(events[3].snapshot.variables[0].value?.value,2);
});
test('WHILE and UNTIL checkpoints include the final condition test', async () => {
  const {events}=await execute('DECLARE N : INTEGER\nN ← 0\nWHILE N < 1 DO\nN ← N + 1\nENDWHILE\nREPEAT\nN ← N + 1\nUNTIL N = 2');
  assert.equal(events.filter(e=>e.kind==='while').length,2); assert.equal(events.find(e=>e.kind==='until')?.position.line,8);
});
test('IF stepping enters only selected branch', async () => {
  const h=debug('IF TRUE THEN\nOUTPUT 1\nELSE\nOUTPUT 2\nENDIF'); assert.equal((await h.next())?.position.line,1); h.gate.step(); assert.equal((await h.next())?.position.line,2); h.gate.continue(); await h.done;
});
test('debugger steps into procedures and naturally returns to caller', async () => {
  const h=debug('PROCEDURE P(N : INTEGER)\nN ← N + 1\nENDPROCEDURE\nCALL P(4)\nOUTPUT 9');
  assert.equal((await h.next())?.position.line,4); h.gate.step(); const inner=await h.next(); assert.equal(inner?.position.line,2); assert.match(inner!.snapshot.scope,/P #/); assert.equal(inner!.snapshot.variables[0].value!.value,4);
  h.gate.step(); assert.equal((await h.next())?.snapshot.scope,'Global'); h.gate.continue(); await h.done;
});
test('debugger steps into functions before completing caller assignment', async () => {
  const h=debug('FUNCTION F RETURNS INTEGER\nRETURN 7\nENDFUNCTION\nDECLARE N : INTEGER\nN ← F()\nOUTPUT N');
  await h.next(); h.gate.step(); assert.equal((await h.next())?.position.line,5); h.gate.step(); assert.equal((await h.next())?.position.line,2); h.gate.step(); const out=await h.next(); assert.equal(out?.position.line,6); assert.equal(out!.snapshot.variables[0].value?.value,7); h.gate.continue(); await h.done;
});
test('Stop releases a paused debugger and clears failed state', async () => {
  const h=debug('DECLARE N : INTEGER\nN ← 1'); await h.next(); h.control.abort(); await assert.rejects(h.done,StoppedError); assert.equal(h.runtime.snapshot().variables.length,0);
});
test('Stop interrupts a pending host INPUT promise', async () => {
  const controller=new AbortController(); let began!:()=>void; const waiting=new Promise<void>(r=>began=r);
  const runtime=new Interpreter({signal:controller.signal,input:()=>{began();return new Promise(()=>{});},output:()=>{}});
  const done=runtime.run(compile('DECLARE N : INTEGER\nINPUT N').program); await waiting; controller.abort(); await assert.rejects(done,StoppedError);
});
test('snapshots include original names, scope, constants and bounded array views', async () => {
  const {runtime}=await execute('CONSTANT Size ← 2\nDECLARE Marks : ARRAY[0:1, -1:0] OF INTEGER\nMarks[1,0] ← 9');
  const [size,array]=runtime.snapshot().variables; assert.equal(size.constant,true); assert.equal(array.name,'Marks'); assert.equal(array.elements?.at(-1)?.value?.value,9); assert.equal(array.elements?.[0].value,undefined);
});
test('snapshot copies cannot modify live values', async () => {
  const {runtime}=await execute('DECLARE N : INTEGER\nN ← 1'); runtime.snapshot().variables[0].value!.value=99; assert.equal(runtime.snapshot().variables[0].value?.value,1);
});
test('trace records selected changes across loops and exports quoted CSV/TSV', async () => {
  const trace=new TraceRecorder(['GLOBAL::N']);
  const {events}=await execute('DECLARE N : INTEGER\nFOR N ← 1 TO 2\nOUTPUT N\nNEXT N'); events.forEach(e=>trace.record(e));
  assert.deepEqual(trace.rows.map(r=>r.values[0]),['—','1','2']); assert.equal(trace.rows.at(-1)?.line,4); assert.match(trace.export(','),/^Step,Line,Scope/); assert.match(trace.export('\t'),/^Step\tLine\tScope/); trace.reset(); assert.equal(trace.rows.length,0);
});
test('trace records scope entry and exit without confusing local and global names', async () => {
  const trace=new TraceRecorder(['GLOBAL::N','P::N']);
  const {events}=await execute('PROCEDURE P(N : INTEGER)\nN ← 9\nENDPROCEDURE\nDECLARE N : INTEGER\nN ← 1\nCALL P(N)'); events.forEach(e=>trace.record(e));
  assert.ok(trace.rows.some(r=>r.values.join(',')==='1,9')); assert.deepEqual(trace.rows.at(-1)?.values,['1','—']);
});
test('trace limit truncates recording without failing execution', async () => {
  const trace=new TraceRecorder(['GLOBAL::N'],2); const {events}=await execute('DECLARE N : INTEGER\nFOR N ← 1 TO 5\nNEXT N'); events.forEach(e=>trace.record(e)); assert.equal(trace.rows.length,2); assert.equal(trace.truncated,true);
});
for (const [type, good, bad] of [['INTEGER','4','4.5'],['REAL','4.5','NaN'],['CHAR','x','xy'],['BOOLEAN','TRUE','yes']] as [DataType,string,string][]) test(`input validation ${type}`,()=>{assert.equal(parseInput(good,type,{line:1,column:1}).type,type);assert.throws(()=>parseInput(bad,type,{line:1,column:1}),LanguageError);});
test('STRING input preserves empty text and whitespace',()=>{assert.equal(parseInput('  ','STRING',{line:1,column:1}).value,'  ');assert.equal(parseInput('','STRING',{line:1,column:1}).value,'');});
test('infinite empty loops retain execution safety limit with debug hooks',async()=>{await assert.rejects(new Interpreter({maxSteps:10,output:()=>{},input:async()=>'',onStep:()=>{}}).run(compile('WHILE TRUE DO\nENDWHILE').program),/safety limit/);});
test('exam utility strips only clear sequential printed numbering',()=>{
  assert.deepEqual(examCode('1 DECLARE N : INTEGER\n2 N ← 4\n3     OUTPUT N'),{source:'DECLARE N : INTEGER\nN ← 4\n    OUTPUT N',stripped:true});
  for(const text of ['OUTPUT 42\nOUTPUT 43','1 42\n2 43','1 OUTPUT 1\n3 OUTPUT 3','1 OUTPUT 1']) assert.equal(examCode(text).stripped,false);
});
for(const [line,spaces] of [['FOR I ← 1 TO 3',4],['WHILE TRUE DO',4],['REPEAT',4],['PROCEDURE P',4],['FUNCTION F RETURNS INTEGER',4],['CASE OF X',2],['IF TRUE',2],['IF TRUE THEN',4],['    OUTPUT 1',4]] as [string,number][]) test(`Enter indentation after ${line}`,()=>{assert.equal(enterEdit(line,line.length).source,line+'\n'+' '.repeat(spaces));});
for(const [open,close] of [['FOR I ← 1 TO 3','NEXT I'],['WHILE TRUE DO','ENDWHILE'],['REPEAT','UNTIL TRUE'],['PROCEDURE P','ENDPROCEDURE'],['FUNCTION F RETURNS INTEGER','ENDFUNCTION'],['CASE OF X','ENDCASE'],['IF TRUE','ENDIF']])test(`dedent ${close}`,()=>{const source=open+'\n    '+close;assert.equal(enterEdit(source,source.length).source,open+'\n'+close+'\n');});
test('THEN/ELSE indentation uses Cambridge two/four spaces',()=>{for(const word of ['THEN','ELSE']){const source='IF TRUE\n    '+word;assert.equal(enterEdit(source,source.length).source,'IF TRUE\n  '+word+'\n    ');}});
test('Enter mid-line never reindents existing source',()=>{assert.equal(enterEdit('OUTPUT 12',8).source,'OUTPUT 1\n2');});
test('autocomplete suggests keywords, types, built-ins and declared identifiers',()=>{
  assert.ok(completion('DEC',3).items.includes('DECLARE')); assert.ok(completion('INT',3).items.includes('INTEGER')); assert.ok(completion('SUB',3).items.includes('SUBSTRING'));
  const source='DECLARE Counter : INTEGER\nCou'; assert.ok(completion(source,source.length).items.includes('Counter'));
  assert.deepEqual(declaredNames('CONSTANT Rate ← 1\nPROCEDURE Show(X : INTEGER)\nENDPROCEDURE\nFUNCTION Sum RETURNS INTEGER\nRETURN 1\nENDFUNCTION'),['Rate','Show','X','Sum']);
});
test('autocomplete does not activate in text literals or comments',()=>{for(const text of ['// DEC','OUTPUT "DEC',"OUTPUT 'D"])assert.equal(completion(text,text.length).items.length,0);});
test('reference hints expose concise Cambridge syntax',()=>{assert.match(referenceAt('SUBSTRING',4),/Positions start at 1/);assert.match(referenceAt('FOR',2),/NEXT Counter/);});
test('trace choices include routine parameters and nested declarations',()=>{assert.deepEqual(traceChoices(compile('PROCEDURE P(N : INTEGER)\nDECLARE X : REAL\nENDPROCEDURE\nDECLARE A : INTEGER').program).map(c=>c.id),['P::N','P::X','GLOBAL::A']);});
test('unambiguous continuation works inside delimiters',async()=>{assert.deepEqual((await execute('DECLARE A : ARRAY[\n1:2\n] OF INTEGER\nA[\n1\n] ← (1 +\n 2)\nOUTPUT SUBSTRING(\n"abc",\n1, 2\n), A[1]')).output,['ab3']);});
test('ambiguous bare newline expressions remain invalid',()=>{assert.throws(()=>compile('OUTPUT 1 +\n2'),LanguageError);assert.throws(()=>compile('OUTPUT 1\n+ 2'),LanguageError);});
test('all six version 0.3 examples run as valid Cambridge programs',async()=>{
  const {examples}=await import('../examples');
  const files=new VirtualFiles({'FileA.txt':'sample\n'}); await execute(examples['File copy'],files);assert.equal(files.read('FileB.txt'),'sample\n');
  assert.deepEqual((await execute(examples['Modular grade report'])).output,['Ada: Excellent','Ali: Keep practising']);
  assert.deepEqual((await execute(examples['Trace an accumulator'])).output,['Total: 10']);
  assert.deepEqual((await execute(examples['Nested logic with arrays'])).output,['Student 2 passed','Student 3 passed','Pass count: 2']);
  for(const [name,input,expected] of [['Class marks search','91','Found at position 3'],['Guessing game','1','Correct!']]){
    const out:string[]=[];await new Interpreter({random:()=>0,input:async()=>input,output:s=>out.push(s)}).run(compile(examples[name as keyof typeof examples]).program);assert.equal(out.at(-1),expected);
  }
});
