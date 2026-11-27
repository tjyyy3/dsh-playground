import { compact, fail, rethrowCancel, withToken } from './workflow-result.js';

export function loginFailure(error) {
  const message = String(error?.message || '');
  if (error?.code === 'cli_job_unavailable') {
    return 'Windows PowerShell、Add-Type 或临时目录不可用，Playground CLI 没有启动。请检查 Windows PowerShell、Add-Type 权限和临时目录，然后重试登录。';
  }
  if (error?.code === 'cli_unsafe_argument') {
    return '登录参数含有 Windows 命令行无法原样传递的字符。请把 cliPath 设为 Playground CLI 的 JS 入口（例如 npm 全局目录下的 node_modules\\@paper2arm\\playground-cli\\dist\\index.js），然后重试。';
  }
  if (error?.code === 'cli_node_missing') {
    return '未在 PATH 中找到 Node.js，Playground CLI 需要它才能运行。请安装 Node.js 并确认 node 命令在 PATH 中，然后重启 DSH。';
  }
  if (error?.code === 'ENOENT' || error?.code === 'cli_not_found' || /not recognized|不是内部或外部命令|command not found|no such file/i.test(message)) {
    return '未找到 Playground CLI。请先安装 CLI 并确认 playground 命令在 PATH 中，然后重启 DSH。';
  }
  if (error?.code === 'cli_terminated' || error?.name === 'AbortError') return error?.started === false
    ? 'Playground 登录在 CLI 启动前已中断或超时，请重试。' : 'Playground 登录已中断或超时，请重试。';
  return 'Playground CLI 登录失败。请检查邮箱和密码；若仍失败，请在终端运行 playground auth login 查看原因。';
}

// Where the workbench takes an API token. The word "token" is avoided: the Client hides messages with it.
const TOKEN_LOGIN = '在 Playground 工作台的“Playground 连接状态”中点击“去网站生成令牌”，在网站“我的面板 → API 与 Agent”生成 API 令牌，粘贴后保存';
const TOKEN_CARD = '请打开 Playground 工作台的“Playground 连接状态”，按其中针对令牌来源（DSH 凭据、CLI 凭据文件、环境变量或插件配置）的提示更换或清除令牌。';
// Messages for an operation that needs a login, by the `reason` of the identity check.
const AUTH_REQUIRED = {
  no_token: `请先登录 Playground：${TOKEN_LOGIN}；用 CLI 注册的账号也可以在“其他登录方式”中用邮箱和密码登录。`,
  // The card knows where the refused one came from (DSH, the CLI file, an environment variable or the
  // plugin config) and gives the step for that source, so the message sends the user there.
  rejected: `Playground 拒绝了当前的 API 令牌：令牌无效、已过期或已撤销。${TOKEN_CARD}`,
  // Under a plugin config token the card has no token form, so this, like `rejected`, defers to the
  // card's per-source step instead of asking for a save that would not take effect.
  forbidden: `Playground 拒绝了当前账号的访问（HTTP 403）。请在工作台检查登录身份；如需换用其他账号，${TOKEN_CARD}`,
};

/** Plugin-written warning for an outdated CLI; only the two version numbers come from the CLI. */
export function cliUpdateNotice(update) {
  if (!update?.current || !update?.latest) return undefined;
  return { current: update.current, latest: update.latest,
    warning: `Playground CLI 版本过旧（${update.current}，最新 ${update.latest}），可能影响评分。请用官方安装脚本 https://play.bohrium.com/install.sh 更新；Windows 上从脚本里的安装包地址下载 .tgz，核对 SHA-256 后运行 npm install -g <文件>。` };
}

// How long the login check waits for the CLI's update status before it answers without it.
const UPDATE_WAIT_MS = 1500;

export function createAuth({ ctx, client, cli, tokenStatus }) {
  async function userOrUndefined(exec, token) {
    try {
      const auth = await client.getCurrentUser(withToken({ signal: exec.signal }, token));
      return auth?.authenticated ? auth.user : undefined;
    } catch (error) { rethrowCancel(error, exec); return undefined; }
  }
  async function requireAuth(exec, token) {
    const auth = await client.getCurrentUser(withToken({ signal: exec.signal }, token));
    return auth.authenticated ? auth : fail(AUTH_REQUIRED[auth.reason] || AUTH_REQUIRED.no_token, 'authentication_required', auth.reason);
  }

  // The workbench login area also shows an outdated-CLI warning. auth starts one refresh of the
  // update status (one at a time) and waits for it for at most UPDATE_WAIT_MS, so a quick answer
  // (the first load, or the first click after the user updated the CLI) is in the same response. A
  // slower CLI never holds the login check up: the refresh goes on in the background, auth returns
  // the last known status, and the next call sees the result. A failed refresh is ignored.
  let lastUpdate = null;
  let refreshingUpdate;
  function refreshUpdate() {
    if (typeof cli?.updateStatus !== 'function') return undefined;
    refreshingUpdate ??= Promise.resolve().then(() => cli.updateStatus())
      .then((update) => { lastUpdate = update ?? null; }, () => {})
      .finally(() => { refreshingUpdate = undefined; });
    return refreshingUpdate;
  }

  // The login check never throws for a platform failure: `reason` tells a missing token
  // (`no_token`), a refused one (`rejected`, HTTP 401; `forbidden`, HTTP 403), an unreachable
  // platform (`network`) and any other failure (`unavailable`) apart.
  async function currentIdentity(exec, token) {
    try {
      return await client.getCurrentUser(withToken({ signal: exec.signal }, token));
    } catch (error) {
      if (exec.signal?.aborted || error?.code === 'cancelled') throw error;
      const reason = ['network_error', 'timeout'].includes(error?.code) ? 'network' : 'unavailable';
      return { authenticated: false, baseUrl: client.baseUrl, reason };
    }
  }

  async function auth(exec, candidateId) {
    if (candidateId) {
      const key = 'PLAYGROUND_SWITCH_' + candidateId.replaceAll('-', '').toUpperCase();
      const candidate = await ctx.get?.('credentials')?.resolve(key);
      return currentIdentity(exec, typeof candidate?.value === 'string' ? candidate.value : '');
    }
    let status;
    try { status = await tokenStatus?.(); } catch { /* The active identity can still be checked. */ }
    const user = await currentIdentity(exec, status?.value);
    const facts = compact({ tokenSource: status?.tokenSource,
      ...(status?.cliFileToken ? { cliFileToken: true, cliFilePath: status.cliFilePath } : {}),
      ...(status?.envToken ? { envToken: true } : {}) });
    const refreshing = refreshUpdate();
    if (refreshing) {
      let timer;
      const limit = new Promise((done) => { timer = setTimeout(done, UPDATE_WAIT_MS); });
      try { await Promise.race([refreshing, limit]); } finally { clearTimeout(timer); }
    }
    const cliUpdate = cliUpdateNotice(lastUpdate);
    return { ...user, ...facts, ...(cliUpdate ? { cliUpdate } : {}) };
  }

  // Workbench login; reached through the session-free service, so it records nothing in a conversation.
  async function login(rawEmail, exec) {
    const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
    if (!email) return fail('请输入 Playground 邮箱。');
    const credentialStore = typeof ctx?.get === 'function' ? ctx.get('credentials') : undefined;
    const resolved = credentialStore && typeof credentialStore.resolve === 'function'
      ? await credentialStore.resolve('PLAYGROUND_PASSWORD')
      : undefined;
    const password = resolved?.value || process.env.PLAYGROUND_PASSWORD || '';
    if (!password) return fail('请先在登录面板输入 Playground 密码。');
    // CLI output is never returned: it can echo the account or credential details.
    try { await cli.authLogin(email, password, { signal: exec.signal }); }
    catch (error) { return fail(loginFailure(error), 'login_failed'); }
    try { return { ok: true, ...await client.getCurrentUser({ signal: exec.signal }) }; }
    catch { return fail('CLI 登录已完成，但无法确认 Playground 身份。请点击“重新检测”。', 'identity_unavailable'); }
  }

  return { auth, login, requireAuth, userOrUndefined };
}
