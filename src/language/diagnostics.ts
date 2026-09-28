import type { Diagnostic } from './model';
export function diagnosticExcerpt(source: string, diagnostic: Diagnostic) {
  const sourceLine = source.split('\n')[diagnostic.line - 1]?.replace(/\r$/, '') ?? '';
  const start = Math.min(Math.max(0, diagnostic.column - 1), sourceLine.length);
  const length = Math.min(Math.max(1, diagnostic.length ?? 1), Math.max(1, sourceLine.length - start));
  const expand = (text: string) => text.replace(/\t/g, '    ');
  return { sourceLine: expand(sourceLine), caret: ' '.repeat(expand(sourceLine.slice(0, start)).length) + '^'.repeat(Math.max(1, expand(sourceLine.slice(start, start + length)).length)) };
}
