const DETAIL_CHARS = 200;
// Bound error text before applying the credential and path filters.
const DETAIL_INPUT_CHARS = DETAIL_CHARS * 4;
const HIDDEN = '<已隐藏>';
// The last segment of an absolute path, or a placeholder when it has none.
const pathLeaf = (path) => {
  const leaf = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
  return leaf && !/^[A-Za-z]:$/.test(leaf) && leaf !== '~' ? leaf : '<路径>';
};

// Characters of one Windows path segment in running text: no whitespace, quotes, separators, the
// characters Windows forbids in names, or the punctuation that ends a clause.
const WIN_SEGMENT = '[^\\s\'"`<>|*?:,;)\\]}，。；：、）\\\\/]';
// A drive or UNC root, then segments. A segment may hold spaces only when another backslash follows
// it, so `C:\Users\Zhang San\Desktop\bundle.zip now` ends after `bundle.zip`, and `x.zip and ~/a`
// does not run on into a later POSIX path.
const WINDOWS_PATH = new RegExp(`(?:\\b[A-Za-z]:(?=[\\\\/])|\\\\\\\\${WIN_SEGMENT}+)(?:[\\\\/](?:${WIN_SEGMENT}+(?: +${WIN_SEGMENT}+)*(?=\\\\)|${WIN_SEGMENT}*))*`, 'g');
// A POSIX absolute or home path after a space, a quote, a backtick, a colon or an opening bracket.
// `https://host/a` never matches: its `//` gives an empty first segment.
const POSIX_PATH = /(^|[\s'"`(=,[{:：（])(~?\/(?:[^\s'"`<>/,;)\]}，。；：、）]+\/)+[^\s'"`<>/,;)\]}，。；：、）]*)/g;
// Credential shapes with a known prefix: OpenAI / Stripe-style `sk-`, GitHub, AWS access key ids,
// Slack and GitLab tokens, Google API keys (`AIza` and 35 more characters; 30 are enough to match),
// Hugging Face tokens (`hf_` and 34 letters and digits; 30 are enough).
const KNOWN_SECRET = /(?<![A-Za-z0-9])(?:sk-[A-Za-z0-9_-]{16,}|[sr]k_(?:live|test)_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Za-z0-9])|xox[abpr]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|hf_[A-Za-z0-9]{30,})/g;
// A PEM private key: the BEGIN line, the base64 lines after it (a short last line only right before
// the END line) and the END line. Without an END line (a cut reply) every following base64 line goes.
// Every part after the BEGIN line is optional, so the pattern never backtracks.
const PEM_PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]{0,40}?PRIVATE KEY-----(?:\s*[A-Za-z0-9+/=]{16,})*(?:\s*[A-Za-z0-9+/=]{1,15}(?=\s*-----END))?(?:\s*-----END [A-Z0-9 ]{0,40}?PRIVATE KEY-----)?/g;
// Scheme words written before a credential in an `Authorization` header or a credential pair
// (`Token abc`, `ApiKey abc`, `Digest username=…`). The scheme is kept and the value after it hidden.
const AUTH_SCHEMES = 'basic|bearer|token|digest|negotiate|ntlm|apikey|api-key|ssws|hmac|hoba|vapid|dpop|gsskey|jwt|oauth|splunk|sharedkey|aws4-hmac-sha256|scram-sha-1|scram-sha-256';
// A scheme word as a whole word: `token-abc123` is a value, not the scheme `token`.
const SCHEME_WORD = `(?:${AUTH_SCHEMES})(?=[\\s,;'"]|$)`;
const isScheme = (word) => new RegExp(`^(?:${AUTH_SCHEMES})$`, 'i').test(word);
// An `Authorization` (or `Proxy-Authorization`) value in quotes, also escaped ones: everything up to the
// closing quote is the credential.
const AUTH_QUOTED = /\b((?:proxy-)?authorization)(\\?["']?\s*[:=]\s*)(\\?["'])(?!<)((?:(?!\3)[^])*)(\3|$)/gi;
// An unquoted `Authorization` value: its first word, then optionally the word after it or a
// `name=value, …` parameter list (Digest, AWS4-HMAC-SHA256). authHeader decides what goes.
const AUTH_PARAM = `[\\w-]+=(?:\\\\?"[^"\\\\]*(?:\\\\?"|$)|[^\\s,;'"\\\\]*)`;
const AUTH_HEADER = new RegExp(`\\b((?:proxy-)?authorization)(\\\\?["']?\\s*[:=]\\s*)(?!<)([^\\s,;'"\\\\]+)`
  + `(?:(\\s+)(${AUTH_PARAM}(?:\\s*,\\s*${AUTH_PARAM})*|[^\\s,;'"\\\\]+))?`, 'gi');
// A known scheme (`Token abc`, `Digest username=…`) is kept and what follows it hidden; a scheme word
// alone ("Authorization: Basic") stays. A first word of
// letters only may be a scheme this list lacks (`Splunk abc`), so it goes together with the word after
// it. Any other first word is the credential itself (`Authorization: abc123 was rejected`).
function authHeader(match, key, separator, first, space, rest) {
  if (isScheme(first)) return rest && !rest.startsWith('<') ? `${key}${separator}${first} ${HIDDEN}` : match;
  if (rest && /^[A-Za-z][A-Za-z-]*$/.test(first)) return `${key}${separator}${HIDDEN}`;
  return `${key}${separator}${HIDDEN}${space || ''}${rest || ''}`;
}
// A quoted value keeps a known scheme word at its start and loses the rest.
function authQuoted(match, key, separator, quote, content, close) {
  const scheme = /^([^\s]+)\s+\S/.exec(content);
  return `${key}${separator}${quote}${scheme && isScheme(scheme[1]) ? `${scheme[1]} ` : ''}${HIDDEN}${close}`;
}
// A key that may name a credential, also with a prefix (`client_secret`, `aws_secret_access_key`,
// `x-api-key`, camelCase `accessToken`) or a plural or id suffix, or a header-style `x-…` name holding
// token / key / secret / signature / auth anywhere (`x-hub-signature-256`, `x-csrftoken`). It may sit in
// quotes, also escaped ones (`\"accessToken\": \"…\"`), and is followed by `=` or `:`, an optional
// scheme word (`Token`, `ApiKey`) and its value: a quoted string, also with spaces and also cut off, or
// one unquoted word. The lookbehind replaces `\b`, which `_` defeats. Whether the value is hidden
// depends on the key (secretPair).
const SECRET_PAIR = new RegExp(`(?<![\\w-])(x-[\\w-]*?(?:token|key|secret|signature|auth)[\\w-]*|[\\w-]*(?:token|secret|key|password|passwd|pwd|passphrase|session|cookie|signature|credential)s?(?:[_-]?id)?)`
  + `(\\\\?["']?\\s*[:=]\\s*)(?:(${AUTH_SCHEMES})\\s+)?(?!<|${SCHEME_WORD})`
  + `(\\\\"(?:[^\\\\]|\\\\(?!"))*(?:\\\\"|$)|"(?:[^"\\\\]|\\\\.)*(?:"|$)|'[^']*(?:'|$)|[^\\s,;'"&]+)`, 'gi');
// Keys whose value is always hidden, matched without regard to case: any name ending in password /
// passwd / pwd / passphrase / secret / credential / cookie; compound key names (`api_key`, `apiKey`,
// `access_key`, `privateKey`, `secret_key`, `sessionKey`, `session_key`, `x-api-key`, `OPENAI_API_KEY`, `Ocp-Apim-Subscription-Key`);
// any `_`- or `-`-joined `*_token` (`refresh_token`, `x-access-token`); credential tokens written as
// one word (`authtoken`, `csrftoken`); and header-style `x-…` names holding token / key / secret /
// signature / auth. Bare `key`, `token`, `session` and `signature`, plurals such as `max_tokens` and
// words that merely end in them (`monkey`, `primary_key`, `session_id`) are ordinary validator words:
// their value is hidden only after `=` or when it looks encoded (secretValue), so
// "Missing key: README.md" keeps its file name.
const ALWAYS_SECRET_KEY = /^(?:[\w-]*(?:password|passwd|pwd|passphrase|secret|credential|cookie)s?(?:[_-]?id)?|[\w-]*(?:api|access|private|secret|auth|signing|encryption|master|client|app|subscription|functions|license|ssh|deploy|webhook|hmac|session)[_-]?keys?(?:[_-]?id)?|[\w-]+[_-]token|(?:[\w-]*[_-])?(?:auth|access|refresh|id|session|csrf|xsrf|api|bearer|oauth|jwt|security)token|x-[\w-]*(?:token|key|secret|signature|auth)[\w-]*)$/i;
// camelCase and PascalCase credential names: a lower-case letter or digit, then `Token` or `Secret`
// (in any case after the capital: `authToken`, `idTOKEN`, `clientSecret`), an optional `Id`. The plural
// `Tokens` (`maxTokens`) is a count, and `…Key` is a credential only with one of the prefixes above,
// so `primaryKey` and `sortKey` keep their value.
const CAMEL_SECRET_KEY = /[a-z\d](?:T[oO][kK][eE][nN]|S[eE][cC][rR][eE][tT][sS]?)(?:Id|ID)?$/;
// Tokenizer settings and token counts are not credentials, although they end in `_token`: the special
// tokens (`pad_token`, `eos_token`, `stop_token`, camelCase `padToken`) and `max_*` / `num_*` / `min_*`
// counts (`max_input_token`, `maxInputToken`). Their value is treated like a bare `token:` value.
const TOKENIZER_SETTING = /^(?:(?:pad|eos|bos|unk|sep|cls|mask|stop|start|end)[_-]?token|(?:max|num|min)[_-][\w-]*token)$/i;
const CAMEL_TOKENIZER_SETTING = /^(?:pad|eos|bos|unk|sep|cls|mask|stop|start|end|(?:max|num|min)[A-Z\d]\w*)T[oO][kK][eE][nN]$/;
const alwaysSecretKey = (key) => !TOKENIZER_SETTING.test(key) && !CAMEL_TOKENIZER_SETTING.test(key)
  && (ALWAYS_SECRET_KEY.test(key) || CAMEL_SECRET_KEY.test(key));
// Validator words that say a credential is absent or wrong, not what it is. After `:` and unquoted, such a
// word keeps its place as the value of a credential key ("auth_key: missing in arm_manifest.json"), so the
// reason stays readable. Only this closed list is kept, never another lower-case word (a real key or
// password can be one), and never for password-like keys, after `=` or in quotes.
const STATUS_WORD = /^(?:missing|required|empty|absent|invalid|expired|revoked|malformed|unset|undefined|null|none)$/;
const PASSWORD_KEY = /(?:password|passwd|pwd|passphrase)s?(?:[_-]?id)?$/i;
const statusValue = (key, separator, quote, value) => !quote && !separator.includes('=') && STATUS_WORD.test(value) && !PASSWORD_KEY.test(key);
// A file name or relative path ending in a lower-case extension, such as `skills/key.json` or `run_v2.py`.
// The file name before the last dot must not itself look encoded (16 or more characters with upper case,
// lower case and digits), so `AbCdEf0123456789.prod` and `s%3Aabc123def456.XyZ` are not file names.
function hasExtension(value) {
  const dot = value.lastIndexOf('.');
  if (dot < 0 || !/^\.[a-z][a-z0-9]{0,7}$/.test(value.slice(dot))) return false;
  const stem = value.slice(0, dot).split(/[\\/]/).pop();
  return !(stem.length >= 16 && /[A-Z]/.test(stem) && /[a-z]/.test(stem) && /\d/.test(stem));
}
// A lower-case snake- or kebab-case identifier below 16 characters, such as `step1_output`, `model_v2`
// or `v2_config`: every `_`/`-`-separated part is lower-case letters and digits, with at least one
// separator. Validator messages name such keys ("Missing key: step1_output"); `s3cr3tvalue` has no separator.
const snakeIdentifier = (value) => value.length < 16 && /^[a-z\d]+(?:[_-][a-z\d]+)+$/.test(value);
// A long run of base64-like characters is a secret when it holds a 20-character alphanumeric stretch
// with upper case, lower case and digits; bundle paths such as `examples/minimal_demo/input` do not.
const looksEncoded = (run) => (run.match(/[A-Za-z0-9]{20,}/g) || []).some((part) => /[A-Z]/.test(part) && /[a-z]/.test(part) && /\d/.test(part));
// A `/`- or `\`-separated run is a path only when one of its segments is a plain lower-case word, such as
// `skills`, `scripts` or `run_all.py` (an extension only in the last segment). Base64 rarely has one, so
// any other run with separators is tested whole.
const PLAIN_SEGMENT = /^[a-z][a-z0-9_-]*$/;
const PLAIN_LAST_SEGMENT = /^[a-z][a-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9]{0,7})?$/;
function plainPath(value) {
  const segments = value.split(/[\\/]/);
  return segments.length > 1 && segments.some((segment, index) => (index === segments.length - 1 ? PLAIN_LAST_SEGMENT : PLAIN_SEGMENT).test(segment));
}
// The value of a bare `key: …`-style pair looks like a secret: 8 or more characters without spaces, with
// letters and digits, and not a short snake-case identifier, a file name or a path (one with a plain
// segment and no encoded one).
const secretValue = (value) => value.length >= 8 && !/\s/.test(value) && /[A-Za-z]/.test(value) && /\d/.test(value)
  && !snakeIdentifier(value) && !hasExtension(value) && !(plainPath(value) && !value.split(/[\\/]/).some(looksEncoded));
// A long run is tested whole unless it is a path (plainPath). A path is tested per segment, so a bundle
// path with a long CamelCase folder stays; it is a secret as a whole only when it also has base64's `+`
// or `=` padding. A path ending in a file extension (the run stops before the dot) is never one.
function encodedRun(run, after) {
  if (!/[\\/]/.test(run)) return looksEncoded(run);
  const extension = /^\.[A-Za-z][A-Za-z0-9]{0,7}(?![A-Za-z0-9])/.exec(after)?.[0] || '';
  if (!plainPath(`${run}${extension}`)) return looksEncoded(run.replace(/[\\/]/g, ''));
  if (extension) return false;
  return run.split(/[\\/]/).some((segment) => segment.length >= 40 && looksEncoded(segment))
    || (/\+|=$/.test(run) && looksEncoded(run.replace(/[\\/]/g, '')));
}
// One credential pair: the value is hidden, a quoted one whole, or kept with its own pairs cleaned.
// A scheme word before the value (`access_token: Token abc`) is kept, and the value after it hidden.
function secretPair(match, key, separator, scheme, secret) {
  const quote = /^(?:\\"|"|')/.exec(secret)?.[0] || '';
  const inner = quote && secret.endsWith(quote) && secret.length >= quote.length * 2
    ? secret.slice(quote.length, -quote.length) : secret.slice(quote.length);
  const lead = `${key}${separator}${scheme ? `${scheme} ` : ''}`;
  // After a bare key a scheme word may be prose ("session: digest mismatch"): a value of lower-case
  // letters only is then kept.
  if ((scheme && !/^[a-z]+$/.test(inner)) || (alwaysSecretKey(key) && (scheme || !statusValue(key, separator, quote, inner)))
    || separator.includes('=') || secretValue(inner)
    || new RegExp(`^${SCHEME_WORD}\\s`, 'i').test(inner)) return `${lead}${quote ? `${quote}${HIDDEN}${quote}` : HIDDEN}`;
  // The kept value is shorter than the match, so this ends; a fresh pattern keeps the outer one's state.
  return `${lead}${quote ? secret : secret.replace(new RegExp(SECRET_PAIR.source, 'gi'), secretPair)}`;
}
// A 64-digit hex run is a file digest, which the agent can compare with bundleSha256, only when a digest
// word directly precedes it, with nothing but punctuation, spaces and "expected" / "got" / "actual" /
// "mismatch" between ("sha256 mismatch: expected …", "SHA-256 digest: …"), and its clause (up to
// DIGEST_CONTEXT characters back, after the last `;`, `!`, `?` or sentence end) names no credential:
// "password hash: …" and "HMAC key (sha256): …" are hidden. Every other run of 32 or more hex digits is hidden.
const DIGEST_CONTEXT = 48;
const DIGEST_LEAD = /(?:sha-?256|digest|hash|checksum)(?:[^\p{L}\p{N}]|expected|got|actual|mismatch(?:ed)?)*$/iu;
const CREDENTIAL_WORD = /password|passwd|secret|key|token|hmac|signature/i;
function digestKept(whole, offset) {
  const clause = whole.slice(Math.max(0, offset - DIGEST_CONTEXT), offset).split(/[;；。!?！？]|\.\s/).pop();
  return DIGEST_LEAD.test(clause) && !CREDENTIAL_WORD.test(clause);
}

/**
 * One reason from the platform or the Worker, safe to show and record. The input is cut to
 * DETAIL_INPUT_CHARS characters at a word end first. Then control characters are dropped and removed
 * are: PEM private key blocks, `Authorization` values (keeping a known scheme word such as Basic,
 * Bearer, Token or Digest; a quoted value whole), `Cookie`/`Set-Cookie` values, bearer values, JWT-like
 * and `asp_` tokens, keys with a known prefix (`sk-`, `ghp_`, `github_pat_`, `AKIA`, `xoxb-`, `glpat-`,
 * `AIza` …), the values of credential keys (ALWAYS_SECRET_KEY and camelCase `accessToken`-style
 * names, also as JSON keys; quoted values whole) and of bare `key`/`token`/`session`/`signature`-style keys
 * after `=` or when the value looks encoded, Hugging Face `hf_` tokens, emails, URL query strings, hex
 * runs of 32 or more (except a 64-digit digest directly after `sha256`/`digest`/`hash`/`checksum` in a
 * clause without a credential word, see digestKept) and long base64-like runs (per segment only in a path
 * with a plain lower-case segment). Prose such as "password is hunter2", without `:` or `=`, is not recognised. Absolute Windows paths (quoted, or with spaces inside), UNC paths, `file://` URLs and POSIX
 * absolute or home paths are cut to their last segment. Paths relative to the bundle, such as
 * `examples/input/paper.pdf`, are kept: they say which file the Worker means. At most DETAIL_CHARS
 * characters.
 */
export function cleanDetail(value) {
  if (typeof value !== 'string') return '';
  // A cut drops the ASCII word it lands in, so no part of a secret is left without the rest that
  // identifies it; text without spaces, such as Chinese, keeps everything before the cut.
  const input = value.length > DETAIL_INPUT_CHARS ? `${value.slice(0, DETAIL_INPUT_CHARS).replace(/[\w+/=.-]*$/, '')} …` : value;
  const text = input
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, ' ')
    .replace(PEM_PRIVATE_KEY, HIDDEN)
    .replace(AUTH_QUOTED, authQuoted)
    .replace(AUTH_HEADER, authHeader)
    .replace(/\b((?:set-)?cookie)(["']?\s*[:=]\s*)(?!<)[^\s;,'"]+(?:;\s?[^\s;,'"]+)*;?/gi, `$1$2${HIDDEN}`)
    .replace(/\bbearer\s+(?!<)[^\s,;'"]+/gi, `Bearer ${HIDDEN}`)
    .replace(/\beyJ[\w-]{4,}\.[\w-]{4,}(?:\.[\w-]*)?/g, HIDDEN)
    .replace(/\basp_[\w-]+/gi, HIDDEN)
    .replace(KNOWN_SECRET, HIDDEN)
    .replace(/\b((?:https?|wss?|ftp):\/\/[^\s?#'"<>]*)[?#][^\s'"<>]*/gi, '$1')
    .replace(SECRET_PAIR, secretPair)
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<邮箱>')
    .replace(/\bfile:\/\/[^\s'"`<>]*/gi, (url) => pathLeaf(url.replace(/^file:\/\//i, '')))
    .replace(/(["'`])((?:[A-Za-z]:[\\/]|\\\\)[^"'`]*)\1/g, (_, quote, path) => `${quote}${pathLeaf(path)}${quote}`)
    .replace(WINDOWS_PATH, pathLeaf)
    .replace(POSIX_PATH, (_, lead, path) => `${lead}${pathLeaf(path)}`)
    .replace(/(?<![A-Za-z0-9])[0-9a-f]{32,}(?![A-Za-z0-9])/gi, (run, offset, whole) => (run.length === 64 && digestKept(whole, offset) ? run : HIDDEN))
    .replace(/(?<![A-Za-z0-9+/\\_=-])[A-Za-z0-9+/\\_-]{40,}={0,2}/g, (run, offset, whole) => (encodedRun(run, whole.slice(offset + run.length)) ? HIDDEN : run))
    .replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  return chars.length > DETAIL_CHARS ? `${chars.slice(0, DETAIL_CHARS - 1).join('')}…` : text;
}
