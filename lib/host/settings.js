import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_MS } from '../api.js';
import { DEFAULT_CLI_CREDENTIALS_PATH, displayCredentialsPath, readCliCredential } from '../cli.js';

// Node's setTimeout fires after 1 ms for delays above 2^31 - 1 ms.
const MAX_TIMER_MS = 2147483647;

export function normalizeSettings(config) {
  const source = config !== null && typeof config === 'object' ? config : {};
  const baseUrl = typeof source.baseUrl === 'string' && source.baseUrl.trim().length > 0
    ? source.baseUrl.trim()
    : (process.env.PLAYGROUND_API_BASE || DEFAULT_BASE_URL);
  const token = typeof source.token === 'string' && source.token.trim().length > 0
    ? source.token.trim()
    : '';
  const timeoutMs = Number.isFinite(Number(source.timeoutMs)) && Number(source.timeoutMs) > 0
    ? Number(source.timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const cliPath = typeof source.cliPath === 'string' && source.cliPath.trim().length > 0
    ? source.cliPath.trim()
    : (process.env.PLAYGROUND_CLI || 'playground');
  const credentialsPath = typeof source.credentialsPath === 'string' && source.credentialsPath.trim().length > 0
    ? source.credentialsPath.trim()
    : (process.env.PLAYGROUND_CREDENTIALS_PATH || DEFAULT_CLI_CREDENTIALS_PATH);
  const cliTimeoutMs = Number.isFinite(Number(source.cliTimeoutMs)) && Number(source.cliTimeoutMs) > 0
    ? Math.min(Number(source.cliTimeoutMs), MAX_TIMER_MS)
    : 120000;
  const releaseChannel = source.releaseChannel === 'beta' ? 'beta' : 'stable';
  return { baseUrl, token, timeoutMs, cliPath, credentialsPath, cliTimeoutMs, releaseChannel };
}

/**
 * Resolve the Playground token per operation: config override, then the
 * Harness credential store (which also reads the ambient environment), then
 * the CLI credentials file, then the process environment directly.
 *
 * The returned function yields the token only for authenticated API reads.
 * `resolveToken.status()` reports where the token came from and whether the
 * CLI credentials file holds one, never the value itself.
 * Sources: `config`, `dsh` (saved in the DSH credential store), `dsh_other`,
 * `cli_file`, `env`, `none`. DSH's local credential provider (credentials-local,
 * read in the installed DSH bundle) answers `resolve()` from its saved values
 * first (`source: 'file'`), then from the variable DSH inherited (`'env'`),
 * then from `.env` files (`'project-env'`, `'user-env'`). Any source other than
 * `file` and `env` becomes `dsh_other`: the workbench then offers no 清除令牌,
 * because `unset()` removes only a saved value.
 * `envToken` says whether this process inherited a PLAYGROUND_TOKEN variable,
 * which DSH answers when nothing is saved, so the workbench can say what a
 * clear leads to.
 */
export function createTokenResolver(settings, ctx) {
  const credentialStore = typeof ctx?.get === 'function' ? ctx.get('credentials') : undefined;
  async function lookup() {
    if (settings.token.length > 0) return { value: settings.token, source: 'config' };
    if (credentialStore !== null && typeof credentialStore === 'object' && typeof credentialStore.resolve === 'function') {
      try {
        const resolved = await credentialStore.resolve('PLAYGROUND_TOKEN');
        if (resolved !== null && typeof resolved === 'object' && typeof resolved.value === 'string' && resolved.value.trim().length > 0) {
          const source = resolved.source === 'file' ? 'dsh' : resolved.source === 'env' ? 'env' : 'dsh_other';
          return { value: resolved.value.trim(), source };
        }
      } catch {
        // Fall through to the ambient environment.
      }
    }
    const cliToken = await readCliCredential('PLAYGROUND_TOKEN', settings.credentialsPath);
    if (cliToken.length > 0) return { value: cliToken, source: 'cli_file' };
    const ambient = typeof process.env.PLAYGROUND_TOKEN === 'string' ? process.env.PLAYGROUND_TOKEN.trim() : '';
    return ambient.length > 0 ? { value: ambient, source: 'env' } : { value: '', source: 'none' };
  }
  const resolveToken = async () => (await lookup()).value;
  resolveToken.inspect = async () => {
    const [{ value, source }, fileToken] = await Promise.all([lookup(), readCliCredential('PLAYGROUND_TOKEN', settings.credentialsPath)]);
    const envToken = typeof process.env.PLAYGROUND_TOKEN === 'string' && process.env.PLAYGROUND_TOKEN.trim().length > 0;
    return { value, tokenSource: source, cliFileToken: fileToken.length > 0, cliFilePath: displayCredentialsPath(settings.credentialsPath), envToken };
  };
  resolveToken.status = async () => {
    const { value, ...facts } = await resolveToken.inspect();
    return facts;
  };
  return resolveToken;
}
