export const PROGRAM_LIMIT = 50;
export function validateProgramName(name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 80 || /[\x00-\x1f/\\]/.test(clean)) throw new Error('Use a program name of 1–80 characters without slashes or control characters.');
  return clean;
}
export function saveProgram(programs: Record<string, string>, name: string, source: string) {
  const clean = validateProgramName(name);
  if (!Object.hasOwn(programs, clean) && Object.keys(programs).length >= PROGRAM_LIMIT) throw new Error(`Saved programs are limited to ${PROGRAM_LIMIT}.`);
  if (source.length > 100_000) throw new Error('Programs are limited to 100,000 characters.');
  return { ...programs, [clean]: source };
}
export function parseProgramImport(name: string, source: string) {
  if (!/\.(?:pseudocode|txt)$/i.test(name)) throw new Error('Choose a .pseudocode or .txt file.');
  if (source.length > 100_000) throw new Error('Imported programs are limited to 100,000 characters.');
  return { name: validateProgramName(name.replace(/\.(?:pseudocode|txt)$/i, '')), source: source.replace(/\r\n?/g, '\n') };
}
export function safeFilename(name: string, extension: string) { return `${name.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'program'}${extension}`; }
