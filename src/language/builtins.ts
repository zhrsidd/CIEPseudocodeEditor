import { LanguageError, type Position, type Value } from './model';

/** Pure library dispatch. RANDOM is injectable so its range can be tested deterministically. */
export function builtin(name: string, args: Value[], pos: Position, random = () => Math.floor(Math.random() * 0x100000000) / 0xffffffff): Value {
  const arity: Record<string, number> = { LENGTH: 1, LCASE: 1, UCASE: 1, SUBSTRING: 3, ROUND: 2, RANDOM: 0 };
  const fail = (message: string): never => { throw new LanguageError(`${name}: ${message}`, pos); };
  if (args.length !== arity[name]) fail(`expected ${arity[name]} argument(s), received ${args.length}.`);
  const typed = (index: number, types: Value['type'][]) => {
    const value = args[index];
    if (!types.includes(value.type)) fail(`argument ${index + 1} must be ${types.join(' or ')}, received ${value.type}.`);
    return value;
  };
  if (name === 'RANDOM') {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value > 1) fail('random source must return a value from 0 to 1.');
    return { type: 'REAL', value };
  }
  if (name === 'LENGTH') return { type: 'INTEGER', value: [...String(typed(0, ['STRING']).value)].length };
  if (name === 'LCASE' || name === 'UCASE') {
    const arg = typed(0, ['STRING', 'CHAR']), text = String(arg.value);
    const value = name === 'LCASE' ? text.toLowerCase() : text.toUpperCase();
    if (arg.type === 'CHAR' && [...value].length !== 1) fail('this Unicode case conversion produces more than one character and cannot remain CHAR.');
    return { type: arg.type, value };
  }
  if (name === 'SUBSTRING') {
    const text = [...String(typed(0, ['STRING']).value)];
    const start = typed(1, ['INTEGER']).value as number, length = typed(2, ['INTEGER']).value as number;
    if (start < 1 || length < 1) fail('start and length must be positive INTEGER values; positions start at 1.');
    if (start > text.length || length > text.length - start + 1) fail(`requested substring is outside the valid range 1:${text.length}.`);
    return { type: 'STRING', value: text.slice(start - 1, start - 1 + length).join('') };
  }
  if (name === 'ROUND') {
    const value = typed(0, ['REAL']).value as number, places = typed(1, ['INTEGER']).value as number;
    if (places < 0 || places > 15) fail('places must be from 0 to 15 in this interpreter.');
    // Round the number's decimal representation, avoiding 1.005 * 100 binary artifacts.
    // Ties go away from zero. Cambridge does not specify a tie-breaking rule.
    const [mantissa, exponent = '0'] = Math.abs(value).toString().split('e');
    const fractionalDigits = mantissa.split('.')[1]?.length ?? 0;
    const digits = BigInt(mantissa.replace('.', ''));
    const shift = Number(exponent) - fractionalDigits + places;
    let rounded: bigint;
    if (shift >= 0) rounded = digits * 10n ** BigInt(shift);
    else {
      const divisor = 10n ** BigInt(-shift);
      rounded = digits / divisor + (digits % divisor * 2n >= divisor ? 1n : 0n);
    }
    const result = Number(`${value < 0 ? '-' : ''}${rounded}e-${places}`);
    if (!Number.isFinite(result)) fail('rounded result is outside the supported numeric range.');
    return { type: 'REAL', value: result };
  }
  return fail('unknown built-in routine.');
}
