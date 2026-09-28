import { LanguageError, type Position } from './model';
export const SAMPLE_FILES: Record<string, string> = { 'FileA.txt': 'Hello from Cambridge pseudocode!\n' };
const POS = { line: 1, column: 1 };
/** Text data is shared between runs; handles and read cursors belong to a FileSession. */
export class VirtualFiles {
  private files = new Map<string, string>();
  private listeners = new Set<() => void>();
  constructor(initial: Record<string, string> = {}) { this.replace(initial); }
  private name(name: string) {
    if (!name.trim() || name.length > 120 || /[\x00-\x1f/\\]/.test(name)) throw new Error('Use a filename of 1–120 characters without slashes or control characters.');
  }
  private validate(data: Map<string, string>) {
    if (data.size > 100 || [...data.values()].reduce((n, s) => n + s.length, 0) > 1_000_000) throw new Error('Virtual files are limited to 100 files and 1,000,000 characters in total.');
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed() { this.listeners.forEach(fn => fn()); }
  snapshot() { return Object.fromEntries(this.files); }
  has(name: string) { return this.files.has(name); }
  read(name: string) { const text = this.files.get(name); if (text === undefined) throw new Error(`File "${name}" does not exist.`); return text; }
  write(name: string, content: string) {
    this.name(name); if (typeof content !== 'string') throw new Error('File contents must be text.');
    const next = new Map(this.files); next.set(name, content.replace(/\r\n?/g, '\n')); this.validate(next); this.files = next; this.changed();
  }
  create(name: string) { if (this.has(name)) throw new Error(`File "${name}" already exists.`); this.write(name, ''); }
  rename(oldName: string, name: string) {
    this.name(name); if (oldName === name) return;
    if (this.has(name)) throw new Error(`File "${name}" already exists.`);
    const content = this.read(oldName); this.files.delete(oldName); this.files.set(name, content); this.changed();
  }
  delete(name: string) { this.read(name); this.files.delete(name); this.changed(); }
  replace(data: Record<string, string>) {
    const next = new Map<string, string>();
    for (const [name, text] of Object.entries(data)) { this.name(name); if (typeof text !== 'string') throw new Error('File contents must be text.'); next.set(name, text.replace(/\r\n?/g, '\n')); }
    this.validate(next); this.files = next; this.changed();
  }
}
export class FileSession {
  private handles = new Map<string, { mode: 'READ' | 'WRITE'; cursor: number; lines: string[] }>();
  constructor(private files: VirtualFiles) {}
  private guard<T>(pos: Position, action: () => T): T {
    try { return action(); } catch (err) { if (err instanceof LanguageError) throw err; throw new LanguageError((err as Error).message, pos); }
  }
  open(name: string, mode: 'READ' | 'WRITE', pos: Position = POS) {
    this.guard(pos, () => {
      if (this.handles.has(name)) throw new Error(`File "${name}" is already open. CLOSEFILE before reopening it.`);
      if (mode === 'WRITE') this.files.write(name, '');
      const text = this.files.read(name), lines = text === '' ? [] : text.split('\n');
      if (text.endsWith('\n')) lines.pop();
      this.handles.set(name, { mode, cursor: 0, lines });
    });
  }
  private handle(name: string, mode: 'READ' | 'WRITE') {
    const handle = this.handles.get(name);
    if (!handle) throw new Error(`File "${name}" is not open. Use OPENFILE first.`);
    if (handle.mode !== mode) throw new Error(`File "${name}" is open for ${handle.mode}, not ${mode}.`);
    return handle;
  }
  read(name: string, pos: Position = POS) {
    return this.guard(pos, () => { const h = this.handle(name, 'READ'); if (h.cursor >= h.lines.length) throw new Error(`End of file reached in "${name}". No line remains to read.`); return h.lines[h.cursor++]; });
  }
  write(name: string, text: string, pos: Position = POS) {
    this.guard(pos, () => { this.handle(name, 'WRITE'); if (/[\r\n]/.test(text)) throw new Error('WRITEFILE writes one data item per line; the value cannot contain a newline.'); this.files.write(name, this.files.read(name) + text + '\n'); });
  }
  close(name: string, pos: Position = POS) {
    this.guard(pos, () => { if (!this.handles.delete(name)) throw new Error(`File "${name}" is not open.`); });
  }
  closeAll() { this.handles.clear(); }
}
