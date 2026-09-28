export type DataType = 'INTEGER' | 'REAL' | 'STRING' | 'CHAR' | 'BOOLEAN';
export interface Position { line: number; column: number; length?: number }
export interface Value { type: DataType; value: number | string | boolean }
export interface Diagnostic extends Position { message: string; hint?: string }
export class LanguageError extends Error {
  warnings: Diagnostic[] = [];
  constructor(message: string, public position: Position, public hint?: string) { super(message); this.name = 'LanguageError'; }
}
/** An assignable scalar variable or a single indexed array element. */
export interface Target extends Position { name: string; indices?: Expr[] }
export type Expr = Position & (
  | { kind: 'literal'; data: Value }
  | ({ kind: 'name' } & Target)
  | { kind: 'unary'; op: string; operand: Expr }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'integerCall'; op: string; left: Expr; right: Expr }
  | { kind: 'call'; name: string; args: Expr[] }
);
export interface Parameter extends Position { name: string; type: DataType }
export interface Routine extends Position {
  kind: 'routine'; name: string; params: Parameter[]; returnType?: DataType; body: Statement[];
}
export type Statement = Position & (
  | { kind: 'declare'; name: string; type: DataType; bounds?: [Expr, Expr][] }
  | { kind: 'constant'; name: string; expression: Expr }
  | { kind: 'assign'; target: Target; expression: Expr }
  | { kind: 'input'; target: Target }
  | { kind: 'output'; expressions: Expr[] }
  | { kind: 'if'; condition: Expr; yes: Statement[]; no: Statement[] }
  | { kind: 'case'; selector: Expr; branches: { value: Expr; body: Statement }[]; otherwise?: Statement }
  | { kind: 'while' | 'repeat'; condition: Expr; body: Statement[]; endPosition?: Position }
  | { kind: 'for'; name: string; start: Expr; end: Expr; step: Expr; body: Statement[]; endPosition?: Position }
  | { kind: 'call'; name: string; args: Expr[] }
  | { kind: 'return'; expression: Expr }
  | { kind: 'openfile'; file: Expr; mode: 'READ' | 'WRITE' }
  | { kind: 'readfile'; file: Expr; target: Target }
  | { kind: 'writefile'; file: Expr; target: Target }
  | { kind: 'closefile'; file: Expr }
  | Routine
);
