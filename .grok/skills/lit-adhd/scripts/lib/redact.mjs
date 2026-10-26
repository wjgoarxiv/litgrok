// Redaction for every string the lit-adhd collector emits. Credential shapes and URI userinfo
// follow the shared secret-shape set (`SECRET_SHAPE_PATTERNS`, `URI_USERINFO_PATTERN`, ported
// from the family's `lib/secret-shapes.mjs` so the guard stays identical); `NAME=value` pairs with
// a secret-like name lose their value; any substring equal to a current environment value of 8+
// characters is replaced (compared here, never printed); the home directory becomes `~`.
// Path-shaped and locale/terminal values are not credentials and stay, or every path in the brief
// would be blanked.

const MASK = "[redacted]";
// Terminal control characters and bidi overrides never survive collection: commit subjects, plan
// rows, handoff headings, session titles and herdr lines are printed raw into terminals. Tabs and
// newlines stay; carriage returns do not.
const STRIP_CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu;
const SECRET_NAME = /KEY|TOKEN|SECRET|PASS|AUTH|COOKIE/iu;
const ASSIGNMENT = /\b([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|[^\s"'`]+)/gu;
const PLAIN_ENV_NAMES = /^(?:PATH|HOME|PWD|OLDPWD|SHELL|USER|LOGNAME|LANG|LANGUAGE|TERM|TERM_PROGRAM|TERM_PROGRAM_VERSION|COLORTERM|EDITOR|VISUAL|PAGER|TMPDIR|SHLVL|LC_[A-Z]+|XPC_[A-Z_]+|__CF[A-Z_]*|COMMAND_MODE|_)$/u;
const SECRET_SHAPE_PATTERNS = Object.freeze([
  /-----BEGIN (?:RSA |EC |DSA |ED25519 |OPENSSH |ENCRYPTED |SSH2 ENCRYPTED )?PRIVATE KEY-----/iu,
  /-----BEGIN PGP PRIVATE KEY BLOCK-----/iu,
  /(?<![A-Za-z0-9_])(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}(?![A-Za-z0-9_])/u,
  /(?<![A-Za-z0-9_])(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}(?![A-Za-z0-9_])/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /(?<![A-Za-z0-9_])npm_[A-Za-z0-9]{20,}(?![A-Za-z0-9_])/u,
  /(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])/u,
  /(?<![A-Za-z0-9_])xox[baprs]-[A-Za-z0-9-]{10,}(?![A-Za-z0-9_-])/u,
  /(?<![A-Za-z0-9_])xapp-[A-Za-z0-9-]{20,}(?![A-Za-z0-9_-])/u,
  /(?<![A-Za-z0-9_])AIza[0-9A-Za-z_-]{20,}(?![A-Za-z0-9_])/u,
  /(?<![A-Za-z0-9_])hf_[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_])/u,
  /(?<![A-Za-z0-9_])whsec_[A-Za-z0-9]{24,}(?![A-Za-z0-9_])/u,
  /(?<![A-Za-z0-9_])SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}(?![A-Za-z0-9_])/u,
  /(?<![A-Za-z0-9_])(?:glpat|gldt|glrt)-[A-Za-z0-9_-]{8,}(?![A-Za-z0-9_])/u,
  /(?<![A-Za-z0-9_])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?![A-Za-z0-9_])/u,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}(?=$|[^A-Za-z0-9._~+/=-])/iu,
  /\b[Bb][Aa][Ss][Ii][Cc]\s+(?=[A-Za-z0-9+/=]{8})(?=[A-Za-z0-9+/=]*[0-9+/=]|(?=[A-Za-z0-9+/=]*[a-z])[A-Za-z0-9+/=]+[A-Z])(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?(?![A-Za-z0-9._~+/=-])/u,
  /(?<![A-Za-z0-9-])(?:proxy-)?authorization\s*:\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+\s+(?:[!#$%&'*+\-.^_`|~0-9A-Za-z]+\s*=\s*\S+|\S{12,})/iu,
  /\b(?:password|passwd|secret|token|api[_-]?key|access[_-]?token)["']?\s*[:=]\s*["']?[^\s,;"'\]}]+["'\]}]?/iu,
  /\b[A-Za-z][A-Za-z0-9]*(?:[_-][A-Za-z0-9]+)*[_-](?:token|secret|key)(?:[_-][A-Za-z0-9]+)*["']?\s*[:=]\s*["']?[^\s,;"'\]}]+["'\]}]?/iu,
  /(?<![A-Za-z0-9_])_?auth(?:[_-]?token)?["']?\s*[:=]\s*["']?[^\s,;"'\]}]{8,}["'\]}]?/iu,
]);
const URI_USERINFO_PATTERN = /(?<![A-Za-z0-9+.-])(?:[A-Za-z][A-Za-z0-9+.-]*:)?\/\/[^/?#\s]+@/u;
const globalOf = (pattern) => new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
const SHAPES = [...SECRET_SHAPE_PATTERNS.map(globalOf)];
const USERINFO = globalOf(URI_USERINFO_PATTERN);

const envSecrets = (env) => Object.entries(env ?? {})
  .filter(([name, value]) => typeof value === "string" && value.length >= 8 && !PLAIN_ENV_NAMES.test(name)
    && !/^[~/]/u.test(value) && !value.includes(":/") && !/^(?:true|false|\d+)$/iu.test(value))
  .map(([, value]) => value)
  .sort((a, b) => b.length - a.length);

/** A redactor bound to one environment and home, so the env scan happens once per run. */
export const makeRedactor = ({ env = process.env, home = env?.HOME } = {}) => {
  const values = envSecrets(env);
  return (input) => {
    if (typeof input !== "string" || input === "") return input;
    let text = input.replace(STRIP_CONTROLS, "");
    for (const value of values) if (text.includes(value)) text = text.split(value).join(MASK);
    text = text.replace(USERINFO, (match) => match.replace(/\/\/[^/?#\s]+@/u, `//${MASK}@`));
    text = text.replace(ASSIGNMENT, (match, name) => (SECRET_NAME.test(name) ? `${name}=${MASK}` : match));
    for (const pattern of SHAPES) text = text.replace(pattern, MASK);
    if (typeof home === "string" && home.length > 1) text = text.split(home).join("~");
    return text;
  };
};
