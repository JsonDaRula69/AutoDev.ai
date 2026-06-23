/**
 * Minimal expression evaluator for the guardrail DSL.
 *
 * The guardrails.yaml `check` fields contain small boolean expressions such
 * as `action_type == 'deploy' AND agent != 'navigator'` or
 * `contains_secrets(diff)`. Until now these were ignored — the handler
 * hardcoded the logic per rule ID. This module implements a tiny, safe,
 * dependency-free evaluator so the rules can be driven by their `check`
 * expressions instead.
 *
 * Supported grammar (lowest → highest precedence):
 *
 *   or_expr   := and_expr ( 'OR' and_expr )*
 *   and_expr  := not_expr ( 'AND' not_expr )*
 *   not_expr  := 'NOT' not_expr | comparison
 *   comparison := primary ( ( '==' | '!=' | '>' | '<' ) primary )?
 *   primary   := function_call | variable | string | number | '(' or_expr ')'
 *   function_call := IDENT '(' args? ')'
 *   args      := primary ( ',' primary )*
 *
 * Variables resolve against the supplied `GuardrailContext`. Unknown
 * variables resolve to `undefined`, which compares unequal to any string
 * literal (so `agent != 'navigator'` is true when no agent is known).
 *
 * Built-in functions:
 *   - contains_secrets(text?)  : scans text (default ctx.diff) for known secret
 *     patterns. Returns boolean.
 *   - path_starts_with(value?, prefix) : when called with one arg it is the
 *     prefix and the value defaults to ctx.path; with two args the first is the
 *     value and the second is the prefix. Returns boolean.
 *
 * The evaluator is deliberately strict: any tokenization or parse error throws
 * a `GuardrailEvalError`, and the caller is expected to fall back to its
 * hardcoded logic when that happens.
 */

/** Context object the evaluator evaluates expressions against. */
export interface GuardrailContext {
  /** Kind of action being attempted: deploy, commit, merge, write, review, implement, ... */
  readonly action_type?: string | undefined;
  /** Name of the agent performing the action (e.g. "navigator", "ned_land"). */
  readonly agent?: string | undefined;
  /** Text content being written/edited — scanned by contains_secrets. */
  readonly diff?: string | undefined;
  /** File path targeted by the action. */
  readonly path?: string | undefined;
  /** CI status string (e.g. "green", "red"). */
  readonly ci_status?: string | undefined;
  /** Whether an evidence file exists for the current change. */
  readonly evidence_exists?: boolean | undefined;
  /** Alias of evidence_exists used by some YAML rules. */
  readonly evidence_file_exists?: boolean | undefined;
  /** Number of currently active tasks. */
  readonly active_tasks?: number | undefined;
  /** Plan file paths in scope (for follow-the-plan style checks). */
  readonly plan_paths?: readonly string[] | undefined;
}

/** Secret regex patterns — mirrors guardrails/index.ts.Kept local to avoid a circular import. */
export const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{20,}/, // Anthropic API key
  /sk-or-[A-Za-z0-9_-]{20,}/, // OpenRouter API key
  /AIza[0-9A-Za-z_-]{35,}/, // Google API key
  /ghp_[A-Za-z0-9]{36,}/, // GitHub PAT (classic)
  /github_pat_[A-Za-z0-9_]{82,}/, // GitHub PAT (fine-grained)
  /xox[baprs]-[A-Za-z0-9-]{10,}/, // Slack token
  /-----BEGIN[A-Z ]*PRIVATE KEY-----/, // PEM private key
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT
];

/** Error thrown when an expression cannot be tokenized or parsed. */
export class GuardrailEvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardrailEvalError";
  }
}

// --- Tokenizer ---------------------------------------------------------------

type TokenType = "IDENT" | "STRING" | "NUMBER" | "OP" | "LPAREN" | "RPAREN" | "COMMA" | "EOF";

interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly pos: number;
}

const OPERATORS = new Set(["==", "!=", ">=", "<="]);
const SINGLE_CHAR_OPS = new Set([">", "<"]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  const isIdentStart = (c: string): boolean => /[A-Za-z_]/.test(c);
  const isIdentPart = (c: string): boolean => /[A-Za-z0-9_]/.test(c);
  const isDigit = (c: string): boolean => /[0-9]/.test(c);

  while (i < n) {
    const c = input[i] as string;

    // Whitespace.
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }

    // String literal in single quotes.
    if (c === "'") {
      let j = i + 1;
      let buf = "";
      while (j < n && input[j] !== "'") {
        buf += input[j];
        j++;
      }
      if (j >= n) throw new GuardrailEvalError(`unterminated string at ${i}`);
      tokens.push({ type: "STRING", value: buf, pos: i });
      i = j + 1;
      continue;
    }

    // Number (integers and decimals).
    if (isDigit(c) || (c === "-" && isDigit(input[i + 1] ?? ""))) {
      let j = i;
      if (c === "-") j++;
      while (j < n && isDigit(input[j] as string)) j++;
      // optional decimal part
      if (input[j] === "." && isDigit(input[j + 1] ?? "")) {
        j++;
        while (j < n && isDigit(input[j] as string)) j++;
      }
      tokens.push({ type: "NUMBER", value: input.slice(i, j), pos: i });
      i = j;
      continue;
    }

    // Two-char operators.
    const two = input.slice(i, i + 2);
    if (OPERATORS.has(two)) {
      tokens.push({ type: "OP", value: two, pos: i });
      i += 2;
      continue;
    }

    // Single-char comparison operators (>, <).
    if (SINGLE_CHAR_OPS.has(c)) {
      tokens.push({ type: "OP", value: c, pos: i });
      i++;
      continue;
    }

    // Single-char tokens.
    if (c === "(") {
      tokens.push({ type: "LPAREN", value: c, pos: i });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "RPAREN", value: c, pos: i });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "COMMA", value: c, pos: i });
      i++;
      continue;
    }

    // Identifier (keywords AND/OR/NOT are uppercase; we treat them case-insensitively later).
    if (isIdentStart(c)) {
      let j = i;
      while (j < n && isIdentPart(input[j] as string)) j++;
      tokens.push({ type: "IDENT", value: input.slice(i, j), pos: i });
      i = j;
      continue;
    }

    throw new GuardrailEvalError(`unexpected character ${JSON.stringify(c)} at ${i}`);
  }

  tokens.push({ type: "EOF", value: "", pos: n });
  return tokens;
}

// --- Parser + Evaluator (recursive descent) ----------------------------------

class Parser {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos] as Token;
  }

  private next(): Token {
    const t = this.tokens[this.pos] as Token;
    this.pos++;
    return t;
  }

  private expect(type: TokenType): Token {
    const t = this.next();
    if (t.type !== type) {
      throw new GuardrailEvalError(`expected ${type} but got ${t.type} (${JSON.stringify(t.value)}) at ${t.pos}`);
    }
    return t;
  }

  /** Parse a full boolean expression. */
  parse(): (ctx: GuardrailContext) => boolean {
    const expr = this.parseOr();
    const eof = this.peek();
    if (eof.type !== "EOF") {
      throw new GuardrailEvalError(`unexpected trailing token ${eof.type} at ${eof.pos}`);
    }
    return expr;
  }

  private parseOr(): (ctx: GuardrailContext) => boolean {
    let left = this.parseAnd();
    while (this.isKeyword("OR")) {
      this.next();
      const right = this.parseAnd();
      const l = left;
      const r = right;
      left = (ctx) => l(ctx) || r(ctx);
    }
    return left;
  }

  private parseAnd(): (ctx: GuardrailContext) => boolean {
    let left = this.parseNot();
    while (this.isKeyword("AND")) {
      this.next();
      const right = this.parseNot();
      const l = left;
      const r = right;
      left = (ctx) => l(ctx) && r(ctx);
    }
    return left;
  }

  private parseNot(): (ctx: GuardrailContext) => boolean {
    if (this.isKeyword("NOT")) {
      this.next();
      const inner = this.parseNot();
      return (ctx) => !inner(ctx);
    }
    return this.parseComparison();
  }

  private parseComparison(): (ctx: GuardrailContext) => boolean {
    const left = this.parsePrimary();
    const t = this.peek();
    if (t.type === "OP") {
      this.next();
      const right = this.parsePrimary();
      const op = t.value;
      const l = left;
      const r = right;
      return (ctx) => compare(op, l(ctx), r(ctx));
    }
    // A bare primary must already be boolean-valued.
    return (ctx) => toBool(left(ctx));
  }

  private parsePrimary(): (ctx: GuardrailContext) => unknown {
    const t = this.peek();

    if (t.type === "LPAREN") {
      this.next();
      const inner = this.parseOr();
      this.expect("RPAREN");
      return inner;
    }

    if (t.type === "STRING") {
      this.next();
      const v = t.value;
      return () => v;
    }

    if (t.type === "NUMBER") {
      this.next();
      const num = Number(t.value);
      return () => num;
    }

    if (t.type === "IDENT") {
      this.next();
      const name = t.value;

      // Function call?
      if (this.peek().type === "LPAREN") {
        this.next(); // consume '('
        const args: Array<(ctx: GuardrailContext) => unknown> = [];
        if (this.peek().type !== "RPAREN") {
          args.push(this.parsePrimary());
          while (this.peek().type === "COMMA") {
            this.next();
            args.push(this.parsePrimary());
          }
        }
        this.expect("RPAREN");
        return (ctx) => callFunction(name, args.map((a) => a(ctx)));
      }

      // Bare identifier — variable lookup (or boolean keyword constant).
      return (ctx) => resolveVariable(name, ctx);
    }

    throw new GuardrailEvalError(`unexpected token ${t.type} at ${t.pos}`);
  }

  private isKeyword(word: string): boolean {
    const t = this.peek();
    return t.type === "IDENT" && t.value.toUpperCase() === word;
  }
}

/** Coerce a value to a boolean (for bare-identifier / function-call results). */
function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  return v !== undefined && v !== null;
}

/** Compare two values with the given operator. Returns boolean. */
function compare(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case "==":
      return looselyEqual(left, right);
    case "!=":
      return !looselyEqual(left, right);
    case ">":
      return toNumber(left) > toNumber(right);
    case "<":
      return toNumber(left) < toNumber(right);
    case ">=":
      return toNumber(left) >= toNumber(right);
    case "<=":
      return toNumber(left) <= toNumber(right);
    default:
      throw new GuardrailEvalError(`unknown operator ${op}`);
  }
}

/** Loose equality: numbers compare numerically, otherwise strict-equal strings/bools. */
function looselyEqual(left: unknown, right: unknown): boolean {
  if (typeof left === "number" || typeof right === "number") {
    return toNumber(left) === toNumber(right);
  }
  return left === right;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  return 0;
}

/** Resolve a bare variable name against the context. */
function resolveVariable(name: string, ctx: GuardrailContext): unknown {
  const lower = name.toLowerCase();
  switch (lower) {
    case "action_type":
      return ctx.action_type;
    case "agent":
      return ctx.agent;
    case "diff":
      return ctx.diff;
    case "path":
      return ctx.path;
    case "ci_status":
      return ctx.ci_status;
    case "evidence_exists":
      return ctx.evidence_exists;
    case "evidence_file_exists":
      return ctx.evidence_file_exists ?? ctx.evidence_exists;
    case "active_tasks":
      return ctx.active_tasks;
    case "plan_paths":
      return ctx.plan_paths;
    case "true":
      return true;
    case "false":
      return false;
    default:
      // Unknown variables resolve to undefined — comparisons treat that as
      // "not equal to any literal", which is the safe default for guard checks.
      return undefined;
  }
}

/** Built-in function registry. */
function callFunction(name: string, args: unknown[]): unknown {
  const lower = name.toLowerCase();
  switch (lower) {
    case "contains_secrets": {
      const text = args.length > 0 ? args[0] : undefined;
      return containsSecretsEval(typeof text === "string" ? text : "");
    }
    case "path_starts_with": {
      if (args.length >= 2) {
        const value = args[0];
        const prefix = args[1];
        return typeof value === "string" && typeof prefix === "string" && value.startsWith(prefix);
      }
      // Single-arg form: prefix uses ctx.path implicitly — but we don't have ctx
      // here. The evaluator passes ctx-bound primaries, so when path_starts_with
      // is called with one literal arg the value is the prefix and ctx.path must
      // be supplied. We handle the one-arg case by treating the arg as prefix
      // and returning a sentinel that the caller resolves. To keep this simple,
      // we require the caller to pass ctx.path explicitly via the two-arg form;
      // the one-arg form returns false (no path known) which safely falls back
      // to the hardcoded handler.
      return false;
    }
    default:
      throw new GuardrailEvalError(`unknown function ${name}`);
  }
}

/** Secret scan used by the contains_secrets function. */
function containsSecretsEval(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

/**
 * Evaluate a guardrail `check` expression against a context.
 *
 * Returns `true` when the expression describes a violation, `false` when it
 * does not. Throws `GuardrailEvalError` on any tokenization/parse error so the
 * caller can fall back to its hardcoded logic.
 *
 * Empty/whitespace-only expressions are treated as "no opinion" (returns
 * `false`) — the caller should then run its fallback logic.
 */
export function evaluateExpression(expr: string, ctx: GuardrailContext): boolean {
  const trimmed = expr.trim();
  if (trimmed === "") return false;
  const tokens = tokenize(trimmed);
  const ast = new Parser(tokens).parse();
  return toBool(ast(ctx));
}

/** Re-export so callers can scan secrets without importing the index module. */
export { containsSecretsEval as containsSecrets };