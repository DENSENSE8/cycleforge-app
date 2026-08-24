/**
 * Calculator engine — a shunting-yard parser and evaluator, pure and
 * dependency-free so it runs under `node --test` with zero setup.
 *
 * ## Why not `eval` / `new Function`
 *
 * Not only the obvious. `eval('012')` is `10` in sloppy mode (legacy octal),
 * `eval('1,2')` is `2`, and `eval('')` is `undefined` — three silently wrong
 * answers for three things an operator will type. A parser that knows the
 * grammar it accepts is smaller than the list of JavaScript behaviours you
 * would have to defend against, and it can return a REASON instead of throwing
 * a `SyntaxError` at a warehouse bench.
 *
 * ## The grammar, in full
 *
 * ```
 *   expr   := term (('+' | '-') term)*
 *   term   := unary (('*' | '/' | '%' ) unary)*        // '%' is modulo
 *   unary  := ('-' | '+')? primary
 *   primary:= NUMBER | '(' expr ')'
 * ```
 *
 * Percent-of (`120 * 15%`) is deliberately absent: the two meanings of `%` on a
 * pocket calculator (modulo vs percent-of) cannot both be right, and a receiving
 * bench counting cartons into cases wants modulo. Stated here so the next
 * person does not add the other one on top.
 */

export type CalcResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: string };

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '%' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

const PRECEDENCE: Readonly<Record<string, number>> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };

function tokenize(input: string): Token[] | string {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === ',' || ch === '_') {
      // Thousands separators and stray whitespace are noise, not operators —
      // an operator pasting `1,250` means one thousand two hundred fifty.
      i += 1;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      let j = i;
      let seenDot = false;
      while (j < input.length) {
        const c = input[j];
        if (c >= '0' && c <= '9') {
          j += 1;
          continue;
        }
        if (c === '.' && !seenDot) {
          seenDot = true;
          j += 1;
          continue;
        }
        if (c === ',' || c === '_') {
          j += 1;
          continue;
        }
        break;
      }
      const raw = input.slice(i, j).replace(/[,_]/g, '');
      const value = Number(raw);
      if (!Number.isFinite(value)) return `"${raw}" is not a number`;
      tokens.push({ kind: 'number', value });
      i = j;
      continue;
    }
    if (ch === '.') {
      // A leading dot: `.5`.
      let j = i + 1;
      while (j < input.length && input[j] >= '0' && input[j] <= '9') j += 1;
      if (j === i + 1) return 'A "." needs digits after it';
      tokens.push({ kind: 'number', value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%') {
      tokens.push({ kind: 'op', value: ch });
      i += 1;
      continue;
    }
    if (ch === '×') {
      tokens.push({ kind: 'op', value: '*' });
      i += 1;
      continue;
    }
    if (ch === '÷') {
      tokens.push({ kind: 'op', value: '/' });
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i += 1;
      continue;
    }
    return `"${ch}" is not something this calculator understands`;
  }
  return tokens;
}

function applyOp(op: string, a: number, b: number): number | string {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      // Not `Infinity`. On a bench "12 / 0" is a mistyped entry, and an answer
      // of ∞ reads as a successful calculation.
      return b === 0 ? 'Cannot divide by zero' : a / b;
    case '%':
      return b === 0 ? 'Cannot take a remainder of zero' : a % b;
    default:
      return `Unknown operator "${op}"`;
  }
}

/**
 * Evaluate an arithmetic expression.
 *
 * Unary minus is handled by injecting a `0` before a `-` in prefix position,
 * which is exact for this grammar (there is no exponentiation, so there is no
 * right-associativity for it to get wrong).
 */
export function evaluateExpression(input: string): CalcResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: 'Nothing to calculate' };

  const tokenized = tokenize(trimmed);
  if (typeof tokenized === 'string') return { ok: false, reason: tokenized };

  const values: number[] = [];
  const ops: string[] = [];
  let expectOperand = true;

  const reduce = (): string | null => {
    const op = ops.pop();
    if (op == null || op === '(') return 'Unbalanced parentheses';
    const b = values.pop();
    const a = values.pop();
    if (a == null || b == null) return 'Incomplete expression';
    const result = applyOp(op, a, b);
    if (typeof result === 'string') return result;
    values.push(result);
    return null;
  };

  for (const token of tokenized) {
    if (token.kind === 'number') {
      if (!expectOperand) return { ok: false, reason: 'Two numbers with no operator between them' };
      values.push(token.value);
      expectOperand = false;
      continue;
    }
    if (token.kind === 'lparen') {
      if (!expectOperand) return { ok: false, reason: 'Missing operator before "("' };
      ops.push('(');
      continue;
    }
    if (token.kind === 'rparen') {
      if (expectOperand) return { ok: false, reason: 'Empty parentheses' };
      while (ops.length > 0 && ops[ops.length - 1] !== '(') {
        const error = reduce();
        if (error) return { ok: false, reason: error };
      }
      if (ops.pop() !== '(') return { ok: false, reason: 'Unbalanced parentheses' };
      expectOperand = false;
      continue;
    }
    // An operator in operand position is a sign, not a binary operator.
    if (expectOperand) {
      if (token.value === '-') {
        values.push(0);
        ops.push('-');
        continue;
      }
      if (token.value === '+') continue;
      return { ok: false, reason: `"${token.value}" needs a number before it` };
    }
    while (
      ops.length > 0 &&
      ops[ops.length - 1] !== '(' &&
      PRECEDENCE[ops[ops.length - 1]] >= PRECEDENCE[token.value]
    ) {
      const error = reduce();
      if (error) return { ok: false, reason: error };
    }
    ops.push(token.value);
    expectOperand = true;
  }

  if (expectOperand) return { ok: false, reason: 'Expression ends on an operator' };
  while (ops.length > 0) {
    const error = reduce();
    if (error) return { ok: false, reason: error };
  }
  if (values.length !== 1) return { ok: false, reason: 'Incomplete expression' };

  const value = values[0];
  if (!Number.isFinite(value)) return { ok: false, reason: 'That is not a finite number' };
  return { ok: true, value };
}

/**
 * Render a result for a bench readout: up to 6 decimals, trailing zeros
 * stripped, thousands separated. `1/3` reads `0.333333`, not
 * `0.3333333333333333` — a 16-digit tail is not a number an operator reads, and
 * it is not more correct than the six they can.
 */
export function formatCalcValue(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString('en-US');
  const rounded = Number(value.toFixed(6));
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 6 });
}
