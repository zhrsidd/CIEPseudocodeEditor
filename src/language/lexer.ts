import { LanguageError, type Diagnostic, type Position, type Value } from './model';
export const KEYWORDS = new Set(('DECLARE CONSTANT INTEGER REAL STRING CHAR BOOLEAN TRUE FALSE INPUT OUTPUT IF THEN ELSE ENDIF FOR TO STEP NEXT WHILE DO ENDWHILE REPEAT UNTIL AND OR NOT DIV MOD ARRAY OF CASE OTHERWISE ENDCASE PROCEDURE CALL ENDPROCEDURE FUNCTION RETURNS RETURN ENDFUNCTION LENGTH LCASE UCASE SUBSTRING ROUND RANDOM OPENFILE READFILE WRITEFILE CLOSEFILE READ WRITE').split(' '));
export const BUILTINS = new Set(['DIV', 'MOD', 'LENGTH', 'LCASE', 'UCASE', 'SUBSTRING', 'ROUND', 'RANDOM']);
export interface Token extends Position { kind: 'word' | 'keyword' | 'literal' | 'symbol' | 'newline' | 'eof'; text: string; data?: Value }
export function lex(source: string): { tokens: Token[]; warnings: Diagnostic[] } {
  const tokens: Token[] = [], warnings: Diagnostic[] = [];
  let i = 0, line = 1, column = 1;
  const advance = () => { const c = source[i++]; if (c === '\n') { line++; column = 1; } else column++; return c; };
  const add = (kind: Token['kind'], text: string, pos: Position, data?: Value) => tokens.push({ kind, text, ...pos, length: Math.max(1, column - pos.column), data });
  try {
  while (i < source.length) {
    const c = source[i], pos = { line, column };
    if (c === ' ' || c === '\t' || c === '\r') { advance(); continue; }
    if (c === '\n') { advance(); add('newline', '\n', pos); continue; }
    if (c === '/' && source[i + 1] === '/') { while (i < source.length && source[i] !== '\n') advance(); continue; }
    if (/[A-Za-z]/.test(c)) {
      let word = ''; while (i < source.length && /[A-Za-z0-9]/.test(source[i])) word += advance();
      const upper = word.toUpperCase();
      if (KEYWORDS.has(upper)) {
        if (word !== upper) throw new LanguageError(`Write the keyword ${upper} in upper case.`, pos);
        add('keyword', upper, pos);
      } else {
        add('word', word, pos);
        if (/^[a-z]/.test(word) && word.length > 1) warnings.push({ ...pos, length: word.length, message: `Cambridge identifiers should start with a capital letter: ${word}.`, hint: `Use ${word[0].toUpperCase() + word.slice(1)} (PascalCase). Names are case insensitive.` });
      }
      continue;
    }
    if (/[0-9]/.test(c)) {
      let number = ''; while (i < source.length && /[0-9]/.test(source[i])) number += advance();
      let type: Value['type'] = 'INTEGER';
      if (source[i] === '.') {
        type = 'REAL'; number += advance();
        if (!/[0-9]/.test(source[i] ?? '')) throw new LanguageError('A REAL literal needs digits on both sides of the decimal point.', pos);
        while (i < source.length && /[0-9]/.test(source[i])) number += advance();
      }
      const value = Number(number);
      if (!Number.isFinite(value) || (type === 'INTEGER' && !Number.isSafeInteger(value))) throw new LanguageError('Number is outside the supported numeric range.', pos);
      add('literal', number, pos, { type, value }); continue;
    }
    if ('\'"“‘ꞌ'.includes(c)) {
      const closing = c === '“' ? '”' : c === '‘' ? '’' : c;
      const type = c === '"' || c === '“' ? 'STRING' : 'CHAR'; advance();
      let value = '';
      while (i < source.length && source[i] !== closing && source[i] !== '\n' && source[i] !== '\r') value += advance();
      if (source[i] !== closing) throw new LanguageError('Unterminated quoted literal.', pos);
      advance();
      if (type === 'CHAR' && [...value].length !== 1) throw new LanguageError('A CHAR literal must contain exactly one character.', pos);
      add('literal', value, pos, { type, value }); continue;
    }
    const pair = source.slice(i, i + 2);
    if (['<-', '<=', '>=', '<>'].includes(pair)) {
      advance(); advance(); add('symbol', pair === '<-' ? '←' : pair, pos);
      if (pair === '<-') warnings.push({ ...pos, length: 2, message: 'Cambridge pseudocode uses ← for assignment.', hint: 'Replace <- with ←; the Insert ← button can help.' });
      continue;
    }
    if ('←+-*/^=<>():,[]'.includes(c) || c === '–' || c === '−') { advance(); add('symbol', c === '–' || c === '−' ? '-' : c, pos); continue; }
    throw new LanguageError(`Unexpected character “${c}”. Identifiers may contain only letters and digits.`, pos);
  }
  } catch (error) { if (error instanceof LanguageError) error.warnings = warnings; throw error; }
  add('eof', '', { line, column }); return { tokens, warnings };
}
