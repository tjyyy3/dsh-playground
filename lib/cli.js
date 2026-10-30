import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_CLI_CREDENTIALS_PATH = join(homedir(), '.config', 'playground', 'credentials.env');

function decodeEnvValue(value) {
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/'\"'\"'/g, "'");
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}

export async function readCliCredential(name, credentialsPath = DEFAULT_CLI_CREDENTIALS_PATH) {
  const text = await readFile(credentialsPath, 'utf8').catch(() => '');
  const match = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match?.[1] ? decodeEnvValue(match[1].trim()) : '';
}

function cliBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/api\/?$/, '');
}

export function createPlaygroundCli({
  command = 'playground',
  credentialsPath = process.env.PLAYGROUND_CREDENTIALS_PATH || DEFAULT_CLI_CREDENTIALS_PATH,
  baseUrl,
  timeoutMs = 120000,
} = {}) {
  const apiBase = cliBaseUrl(baseUrl);
  const argsWithBase = (args) => apiBase ? [...args, '--api-base', apiBase] : args;

  // Windows runs the CLI through cmd, which reports a missing command only as a locale-encoded
  // message with exit code 1. Look the command up instead of parsing that text. POSIX spawns
  // without a shell, so a missing command already fails with ENOENT.
  async function commandMissing() {
    if (process.platform !== 'win32') return false;
    if (/[\\/]/.test(command)) return !existsSync(command);
    return new Promise((resolve) => {
      const lookup = spawn('where', [command], { windowsHide: true, stdio: 'ignore' });
      lookup.once('error', () => resolve(false));
      lookup.once('close', (code) => resolve(code !== 0));
    });
  }

  async function run(args, { env = {}, cwd, signal, timeout = timeoutMs } = {}) {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => child.kill(), timeout);
      const abort = () => child.kill();
      if (signal) {
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      }
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', (code, closeSignal) => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', abort);
        resolve({ code, signal: closeSignal, stdout, stderr });
      });
    });
    if (result.code !== 0) {
      const message = result.stderr.trim() || result.stdout.trim() || `playground exited with code ${result.code ?? 'unknown'}`;
      const error = new Error(message);
      error.code = result.code === null ? 'cli_terminated' : await commandMissing() ? 'cli_not_found' : 'cli_error';
      throw error;
    }
    return result.stdout.trim();
  }

  async function json(args, options) {
    const text = await run(argsWithBase(args), options);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Playground CLI returned invalid JSON: ${text.slice(0, 500)}`);
    }
  }

  return {
    command,
    credentialsPath,
    async authLogin(email, password, options = {}) {
      return json(['auth', 'login', '--email', email], {
        ...options,
        env: { PLAYGROUND_PASSWORD: password, PLAYGROUND_CREDENTIALS_PATH: credentialsPath, ...options.env },
      });
    },
    async submit({ challengeId, bundlePath, tracePath, attemptId, model, harness, method, cwd, signal }) {
      const args = ['submit', '--challenge-id', challengeId, '--bundle', bundlePath];
      if (tracePath && !attemptId) args.push('--trace', tracePath);
      if (attemptId) args.push('--attempt-id', String(attemptId));
      if (model) args.push('--model', model);
      if (harness) args.push('--harness', harness);
      if (method) args.push('--method', method);
      return json(args, { cwd, signal, env: { PLAYGROUND_CREDENTIALS_PATH: credentialsPath } });
    },
  };
}
