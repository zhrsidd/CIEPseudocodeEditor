import { BUILTINS, KEYWORDS } from './lexer';
export interface HighlightToken { text: string; style: string }
const TYPES = new Set(['INTEGER', 'REAL', 'STRING', 'CHAR', 'BOOLEAN', 'ARRAY']);
/** Tolerant presentation-only scanner: incomplete code remains editable and fully visible. */
export function highlight(source: string): HighlightToken[] {
  const pattern = /\/\/[^\n\r]*|"[^"\n\r]*(?:"|$)|'[^'\n\r]*(?:'|$)|“[^”\n\r]*(?:”|$)|‘[^’\n\r]*(?:’|$)|ꞌ[^ꞌ\n\r]*(?:ꞌ|$)|\d+(?:\.\d+)?|[A-Za-z][A-Za-z0-9]*|<-|<=|>=|<>|[←+\-–−*/^=<>()[\]:,]|\s+|./gm;
  return Array.from(source.matchAll(pattern), ([text]) => {
    const upper = text.toUpperCase();
    const style = text.startsWith('//') ? 'comment' : /^["“]/.test(text) ? 'string' : /^['‘ꞌ]/.test(text) ? 'char' : /^\d/.test(text) ? 'number' : TYPES.has(upper) ? 'type' : ['TRUE', 'FALSE'].includes(upper) ? 'boolean' : BUILTINS.has(upper) ? 'builtin' : ['AND', 'OR', 'NOT'].includes(upper) ? 'operator' : KEYWORDS.has(upper) ? 'keyword' : /^[←+\-–−*/^=<>()[\]:,]/.test(text) ? 'operator' : '';
    return { text, style };
  });
}
