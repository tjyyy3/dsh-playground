import { msg } from '../shared/language.js';
import * as React from 'react';
import { openableWebUrl, webRootOf } from '../shared/display.js';
import { h } from '../shared/react.js';

// Where the Host found the token it uses (`tokenSource` of the auth query); the value never reaches the Client.
// `dsh_other` is a value the DSH credential store answered from an origin the Host could not confirm, so
// unsetting it might not remove it; it gets no 清除令牌.
const TOKEN_SOURCES = () => ({ dsh: msg('DSH 凭据', 'DSH credentials'), dsh_other: msg('DSH 凭据（来源未确认）', 'DSH credentials (source unconfirmed)'), cli_file: msg('CLI 凭据文件', 'CLI credentials file'), env: msg('环境变量', 'Environment variable'), config: msg('插件配置', 'Plugin configuration') });

// The sources that win over the CLI credentials file an email login writes.
const ABOVE_CLI_FILE = () => ({ dsh: msg('DSH 凭据中保存的令牌', 'the token saved in DSH credentials'), dsh_other: msg('DSH 凭据存储提供的令牌（来源未确认）', 'the token from the DSH credential store (source unconfirmed)'), env: msg('环境变量 PLAYGROUND_TOKEN 中的令牌', 'the PLAYGROUND_TOKEN environment variable'), config: msg('插件配置中的令牌', 'the token in the plugin configuration') });

const TOKEN_PAGE = () => msg('网站“我的面板 → API 与 Agent”', 'My Dashboard → API & Agent on the website');

const isAgentUser = (user) => typeof user?.userType === 'string' && user.userType.trim().toLowerCase() === 'agent';

// The website's API token page (我的面板 → API 与 Agent), on the site the plugin talks to.
function tokenPageUrl(apiBase) {
  const root = typeof apiBase === 'string' && apiBase ? webRootOf(apiBase) : '';
  return root ? openableWebUrl(`${root}/#dashboard/api`) : undefined;
}

const authCss = '.pg-auth .pg-form{display:grid;gap:8px;margin-top:10px}.pg-auth .pg-field{display:grid;gap:4px;font-size:12px}.pg-auth .pg-input{width:100%}.pg-auth-other{margin-top:12px;font-size:12px;color:var(--pg-muted)}.pg-auth-other summary{cursor:pointer}.pg-auth-other summary:focus-visible{outline:2px solid var(--pg-accent);outline-offset:2px}';

// Why a saved or found token does not log in, with the next step for where it came from.
function tokenProblem(state) {
  const source = state.tokenSource;
  const fromFile = state.cliFilePath ? msg(`CLI 凭据文件 ${state.cliFilePath}`, `CLI credentials file ${state.cliFilePath}`) : msg('CLI 凭据文件', 'the CLI credentials file');
  const next = source === 'dsh' ? msg(`请到${TOKEN_PAGE()}生成新令牌，在下方验证账号，再选择“使用此账号”。也可以点击“清除令牌”移除 DSH 保存的副本。`, `Generate a token in ${TOKEN_PAGE()}, verify its account below, then select Use this account. Clear token removes the copy saved in DSH.`)
    : source === 'cli_file' ? msg(`当前令牌来自${fromFile}。请在下方验证并确认新账号，或在终端运行 playground auth login 重新登录。`, `The current token comes from ${fromFile}. Verify and confirm the new account below, or run playground auth login in a terminal.`)
      : source === 'env' ? msg('当前令牌来自环境变量 PLAYGROUND_TOKEN。请在下方验证并确认新账号，或更新该环境变量后重启 DSH。', 'The current token comes from PLAYGROUND_TOKEN. Verify and confirm the new account below, or update the environment variable and restart DSH.')
        : source === 'config' ? msg('当前令牌来自插件配置，它优先于其他来源，在这里保存的令牌不会生效。请修改或删除插件配置中的令牌。', 'The plugin configuration supplies the current token and takes priority over other sources. Edit or remove it in the plugin configuration.')
          : source === 'dsh_other' ? msg('当前令牌由 DSH 凭据存储提供，但插件无法确认它保存在 DSH 中还是来自 DSH 的环境变量。请在下方验证并确认新账号，或检查 DSH 环境中的 PLAYGROUND_TOKEN 变量。', 'DSH supplies the current token, but its source could be either saved credentials or the environment. Verify and confirm the new account below, or check PLAYGROUND_TOKEN in the DSH environment.')
            : msg(`请到${TOKEN_PAGE()}生成新令牌，在下方验证并确认账号。`, `Generate a token in ${TOKEN_PAGE()}, then verify and confirm the account below.`);
  if (state.reason === 'rejected') return [msg('令牌无效', 'Invalid token'), msg(`令牌无效、已过期或已撤销。${next}`, `The token is invalid, expired or revoked. ${next}`)];
  return [msg('无权访问', 'Access denied'), msg(`Playground 拒绝了当前账号的访问（HTTP 403）。请确认账号状态，或换用其他账号的令牌。${next}`, `Playground denied access to this account (HTTP 403). Check the account status or use another account token. ${next}`)];
}

// What clearing the DSH copy leads to. DSH's credentials-local answers PLAYGROUND_TOKEN from its own
// environment when nothing is saved, before the plugin reads the CLI credentials file. A value DSH then
// takes from a `.env` file is not reported to the Client, so the note cannot mention it (see README).
function clearNote(state) {
  if (state.tokenSource !== 'dsh') return '';
  if (state.envToken) return msg(`DSH 的环境中还有 PLAYGROUND_TOKEN 变量。清除 DSH 中保存的令牌后，插件会改用该变量中的令牌（它优先于 CLI 凭据文件）；插件不会修改环境变量${state.cliFileToken ? '或 CLI 凭据文件' : ''}。`, `The DSH environment also contains PLAYGROUND_TOKEN. Clearing the saved token switches to the environment token, which overrides the CLI credentials file. The environment variable${state.cliFileToken ? " and CLI credentials file remain unchanged" : " remains unchanged"}.`);
  if (state.cliFileToken) return msg(`CLI 凭据文件 ${state.cliFilePath || ''} 中也有令牌。清除 DSH 中的令牌后，若 DSH 没有提供其他凭据，工作台将使用该文件。请核对重新检测到的账号。`, `The CLI credentials file ${state.cliFilePath || ''} also contains a token. After the saved DSH token is cleared, the workbench uses that file if DSH supplies no other credential. Check the account shown after the refresh.`);
  return msg('清除令牌只移除 DSH 保存的副本。网站会话和 API 令牌仍由 Playground 管理。', 'Clear token removes the copy saved in DSH. Playground manages the website session and the API token.');
}

// After a successful email login: the CLI wrote its credentials file, but a higher source still wins.
function loginOverridden(state) {
  const what = ABOVE_CLI_FILE()[state.tokenSource];
  if (!what) return '';
  const next = state.tokenSource === 'dsh'
    ? (state.envToken
      ? msg('清除令牌后，插件会改用 DSH 环境变量 PLAYGROUND_TOKEN 中的令牌，它可能不是刚登录的账号；如需改用该账号，还需移除这个环境变量并重启 DSH。', 'Clearing the token will switch to PLAYGROUND_TOKEN in the DSH environment. To use the account you just signed in to, remove that variable and restart DSH.')
      : msg('点击“清除令牌”后，请核对工作台重新检测到的账号。', 'Select Clear token, then check which account the workbench verifies.'))
    : state.tokenSource === 'config' ? msg('如需改用刚登录的账号，请删除插件配置中的令牌。', 'Remove the token from the plugin configuration to use the account you just signed in to.')
      : state.tokenSource === 'env' ? msg('如需改用刚登录的账号，请移除 DSH 环境中的 PLAYGROUND_TOKEN 变量后重启 DSH。', 'Remove PLAYGROUND_TOKEN from the DSH environment and restart DSH to use the account you just signed in to.')
        : msg('如需改用刚登录的账号，请移除 DSH 凭据中的 PLAYGROUND_TOKEN，以及 DSH 环境中的同名变量，然后重启 DSH。', 'Remove PLAYGROUND_TOKEN from both DSH credentials and the DSH environment, then restart DSH to use the account you just signed in to.');
  return msg(`CLI 登录成功，但插件仍在使用${what}，它优先于 CLI 凭据文件。${next}`, `CLI sign-in succeeded. The plugin still uses ${what}, which takes priority over the CLI credentials file. ${next}`);
}

function sameAccount(left, right) {
  if (left?.id != null && right?.id != null) return String(left.id) === String(right.id);
  if (left?.email && right?.email) return left.email.toLowerCase() === right.email.toLowerCase();
  return undefined;
}

function accountLabel(user) {
  const name = user.name || user.email || msg('账号', 'Account');
  return user.id == null ? user.email || name : `${name} (#${user.id})`;
}

function savedSwitchNote(attempt, current) {
  const target = accountLabel(attempt.expected);
  const saved = msg(`已把 ${target} 的令牌保存到 DSH。`, `DSH saved the token for ${target}. `);
  const source = TOKEN_SOURCES()[current.tokenSource];
  if (source && current.tokenSource !== 'dsh') {
    const next = current.tokenSource === 'config' ? msg('请在插件配置中更新或移除令牌，然后重新检测。', 'Update or remove the configured token, then select Check again.')
      : current.tokenSource === 'env' ? msg('请检查 DSH 凭据和 DSH 环境中的 PLAYGROUND_TOKEN，调整后重启 DSH 并重新检测。', 'Check DSH credentials and PLAYGROUND_TOKEN in the DSH environment. After changing the environment, restart DSH and check again.')
        : msg('请检查 DSH 中保存的 PLAYGROUND_TOKEN，然后重新检测。', 'Check PLAYGROUND_TOKEN in DSH credentials, then select Check again.');
    return saved + msg(`工作台目前使用的令牌来自${source}。`, `The workbench currently uses a token from ${source}. `) + next;
  }
  const actual = current.authenticated ? current.user : undefined;
  const matches = sameAccount(attempt.expected, actual);
  if (current.tokenSource !== 'dsh' || matches !== true) {
    return saved + (matches === false ? msg(`工作台实际使用 ${accountLabel(actual)}。`, `The workbench is using ${accountLabel(actual)}. `)
      : msg('尚未核实工作台的当前账号。', 'The active workbench account is still unverified. '))
      + msg('请重新检测。要恢复原账号，请重新保存原账号的令牌。', 'Select Check again. To restore the previous account, save its token again.');
  }
  const same = sameAccount(attempt.previous, actual);
  if (same === true) return msg(`已更新令牌，当前账号仍为 ${target}。`, `Token updated. The current account is still ${target}.`);
  if (same === false) return msg(`已切换到 ${target}。`, `Switched to ${target}.`);
  return msg(`已验证当前账号 ${target}。`, `Verified the current account as ${target}.`);
}

function AuthStatusPanel({ query, login, previewToken, saveToken, clearToken, onStatusChange }) {
  // `state` is the last auth answer (null until the first one). It stays rendered while a re-check runs,
  // so the controls keep their place; `checking` only marks the re-check.
  const [state, setState] = React.useState(null);
  const [checking, setChecking] = React.useState(true);
  // `seq` numbers the checks so only the latest answer is shown; `status` is the status line, which takes
  // focus after a save, clear or login (`refocus`) because the control that was used may be gone.
  const [latest] = React.useState(() => ({ seq: 0, status: null, refocus: false }));
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loginBusy, setLoginBusy] = React.useState(false);
  const [loginError, setLoginError] = React.useState('');
  const [loginDone, setLoginDone] = React.useState(false);
  const [token, setToken] = React.useState('');
  const [tokenBusy, setTokenBusy] = React.useState(false);
  const [tokenError, setTokenError] = React.useState('');
  const [accountSwitch, setAccountSwitch] = React.useState(null);
  const editing = accountSwitch?.phase === 'editing' || accountSwitch?.phase === 'preview';
  const preview = accountSwitch?.phase === 'preview' ? accountSwitch.expected : null;
  const firstSignIn = state?.reason === 'no_token' && !latest.credential
    && (!state.tokenSource || state.tokenSource === 'none');
  const verifyFirst = editing || (!state?.authenticated && !firstSignIn);
  const writingToken = tokenBusy && !latest.previewRequest;
  const check = async () => {
    const seq = ++latest.seq;
    setChecking(true);
    let next;
    try { next = await query({ action: 'auth' }); } catch (failure) { next = { error: failure.message }; }
    // A check started later is still running or has answered; its answer is the current one.
    if (seq !== latest.seq) return;
    if (next?.authenticated || (next?.tokenSource && next.tokenSource !== 'none') || ['rejected', 'forbidden'].includes(next?.reason)) {
      latest.credential = { user: next.authenticated ? next.user : latest.credential?.user, source: next.tokenSource || latest.credential?.source };
    }
    setState(next && typeof next === 'object' ? next : {});
    setChecking(false);
    if (latest.refocus) { latest.refocus = false; latest.status?.focus?.(); }
  };
  React.useEffect(() => { check(); }, [query]);
  React.useEffect(() => {
    onStatusChange?.(!state || checking ? 'checking' : state.authenticated ? 'authenticated'
      : state.error || ['network', 'unavailable'].includes(state.reason) ? 'unavailable' : 'unauthenticated', state?.user, state?.baseUrl);
  }, [state, checking, onStatusChange]);
  const submitLogin = async () => {
    if (latest.previewRequest) {
      latest.previewRequest = undefined;
      setTokenBusy(false);
    }
    setLoginBusy(true); setLoginError(''); setLoginDone(false); setAccountSwitch(null);
    setToken(''); setTokenError('');
    try {
      await login(email, password);
      setPassword('');
      setLoginDone(true);
      latest.refocus = true;
      await check();
    } catch (failure) { setLoginError(failure.message); }
    finally { setLoginBusy(false); }
  };
  const submitToken = async () => {
    if (!token.trim()) { setTokenError('请先粘贴 API 令牌。'); return; }
    const request = verifyFirst && !preview ? Symbol() : undefined;
    latest.previewRequest = request;
    const obsolete = () => request && request !== latest.previewRequest;
    setTokenBusy(true); setTokenError(''); setLoginDone(false);
    try {
      if (request) {
        const identity = await previewToken(token);
        if (obsolete()) return;
        if (!identity?.authenticated || (identity.user?.id == null && !identity.user?.email)) {
          setTokenError(['rejected', 'forbidden'].includes(identity?.reason)
            ? msg('Playground 拒绝了新令牌。请核对令牌后重试。当前 DSH 令牌未被替换。', 'Playground rejected the new token. Check the token and try again. The current DSH token was kept.')
            : msg('暂时无法核实新令牌的账号。请稍后重试。当前 DSH 令牌未被替换。', 'Could not verify the account for the new token. Try again later. The current DSH token was kept.'));
          return;
        }
        setAccountSwitch({ phase: 'preview', previous: accountSwitch?.previous ?? latest.credential?.user, expected: identity.user });
        return;
      }
      await saveToken(token);
      setAccountSwitch(preview ? { ...accountSwitch, phase: 'saved' } : null);
      setToken('');
      latest.refocus = true;
      await check();
    } catch (failure) { if (!obsolete()) setTokenError(failure.message); }
    finally {
      if (!obsolete()) {
        latest.previewRequest = undefined;
        setTokenBusy(false);
      }
    }
  };
  const removeToken = async () => {
    setTokenBusy(true); setTokenError(''); setLoginDone(false); setAccountSwitch(null); setToken('');
    try {
      await clearToken();
      latest.credential = undefined;
      latest.refocus = true;
      await check();
    } catch (failure) { setTokenError(failure.message); }
    finally { setTokenBusy(false); }
  };
  const loading = !state;
  const current = state || {};
  const user = current.user || {};
  const agent = isAgentUser(user);
  const operator = user.operatorName || (user.operatorId !== undefined && user.operatorId !== null && user.operatorId !== '' ? `#${user.operatorId}` : '');
  const operatorState = user.operatorConfirmed === true ? msg('（已确认）', ' (confirmed)') : user.operatorConfirmed === false ? msg('（未确认）', ' (unconfirmed)') : '';
  const sourceLabel = TOKEN_SOURCES()[current.tokenSource];
  const stored = current.tokenSource === 'dsh';
  // A plugin-config token wins over everything, so a token saved here would never be used.
  const fromConfig = (current.tokenSource || latest.credential?.source) === 'config';
  const pageUrl = tokenPageUrl(current.baseUrl);
  const refused = current.reason === 'rejected' || current.reason === 'forbidden';
  const [refusedBadge, refusedText] = refused ? tokenProblem(current) : [];
  const failedCheck = current.reason === 'network' || current.reason === 'unavailable';
  const note = clearNote(current);
  const overridden = loginDone && !loading ? loginOverridden(current) : '';
  const switchNote = accountSwitch?.phase !== 'saved' ? '' : tokenBusy || checking
    ? msg(`正在核实工作台是否已使用 ${accountLabel(accountSwitch.expected)}…`, `Checking whether the workbench is using ${accountLabel(accountSwitch.expected)}…`)
    : savedSwitchNote(accountSwitch, current);
  const badge = (tone, label) => h('span', { className: 'pg-badge', 'data-tone': tone }, label);
  const sourceTail = sourceLabel ? msg(` 令牌来源：${sourceLabel}`, ` Token source: ${sourceLabel}`) : '';
  const summary = loading ? msg('正在检查当前 DSH 是否已配置 Playground 凭据…', 'Checking DSH for Playground credentials…')
    : current.authenticated ? h(React.Fragment, null, badge('success', msg('已登录', 'Signed in')), ' ', user.name || user.email || msg('Playground 用户', 'Playground user'))
      : refused ? h(React.Fragment, null, badge('error', refusedBadge), sourceTail)
        : failedCheck ? h(React.Fragment, null, badge('error', msg('检测失败', 'Check failed')), sourceTail)
          : h(React.Fragment, null, badge(current.error ? 'error' : 'warning', current.error ? msg('检测失败', 'Check failed') : msg('未登录', 'Signed out')), msg(' 公开赛题仍可浏览；查询个人提交和上传评测包需要登录。', ' You can browse public challenges. Sign in to view your submissions and upload evaluation packages.'));
  const clearButton = stored ? h('button', { type: 'button', className: 'pg-button', disabled: tokenBusy || loginBusy, onClick: removeToken }, msg('清除令牌', 'Clear token')) : null;
  const tokenForm = h('form', { className: 'pg-form pg-auth-token', 'aria-label': verifyFirst ? msg('切换账号', 'Switch account') : msg('API 令牌登录', 'Sign in with an API token'), onSubmit: (event) => { event.preventDefault(); if (!tokenBusy && !loginBusy) return submitToken(); } },
    h('p', { className: 'pg-note' }, verifyFirst
      ? msg('粘贴目标账号的 API 令牌。核实账号后，再决定是否替换 DSH 保存的令牌。已有任务和提交记录保留原归属。', 'Paste the API token for the account you want to use. Check the account before replacing the token saved in DSH. Existing tasks and submissions keep their original owners.')
      : msg(`在${TOKEN_PAGE()}登录后生成个人令牌或 Agent 账号令牌，粘贴到这里保存。令牌只保存在 DSH 凭据存储中，不会写入对话、命令或日志；保存后自动检测登录状态。`, `Sign in to ${TOKEN_PAGE()} and generate a personal or agent account token. Paste it here to save it in DSH credentials and check sign-in automatically. The token stays out of chats, commands and logs.`)),
    pageUrl ? h('div', { className: 'pg-actions' }, h('button', { type: 'button', className: 'pg-button', onClick: () => { window.open(pageUrl, '_blank', 'noopener,noreferrer'); } }, msg('去网站生成令牌', 'Generate token on website'))) : null,
    h('label', { className: 'pg-field' }, msg('API 令牌', 'API token'), h('input', { className: 'pg-input', type: 'password', value: token, autoComplete: 'off', spellCheck: false, disabled: tokenBusy || loginBusy, onChange: (event) => {
      setToken(event.target.value); setTokenError('');
      if (preview) setAccountSwitch({ phase: 'editing', previous: accountSwitch.previous });
    } })),
    preview ? h('p', { className: 'pg-note' }, msg(`新令牌属于 ${accountLabel(preview)}。`, `This token belongs to ${accountLabel(preview)}.`),
      sameAccount(accountSwitch.previous, preview) === true ? msg(' 这是当前账号。', ' This is your current account.') : null) : null,
    // Enabled while the field is empty, so a click explains what is missing instead of doing nothing.
    h('div', { className: 'pg-actions' }, h('button', { type: 'submit', className: 'pg-button pg-primary', disabled: tokenBusy || loginBusy },
      verifyFirst && !preview ? (tokenBusy ? msg('正在验证…', 'Verifying…') : msg('验证新账号', 'Verify new account'))
        : tokenBusy ? msg('正在保存…', 'Saving…') : preview ? msg('使用此账号', 'Use this account') : msg('保存令牌', 'Save token')),
      editing ? h('button', { type: 'button', className: 'pg-button', disabled: tokenBusy, onClick: () => { setAccountSwitch(null); setToken(''); setTokenError(''); } }, msg('取消', 'Cancel')) : null),
    tokenError ? h('p', { className: 'pg-error', role: 'alert' }, tokenError === '请先粘贴 API 令牌。' ? msg(tokenError, 'Paste your API token first.') : tokenError) : null);
  const configNote = fromConfig ? h('p', { className: 'pg-note pg-auth-config' }, current.tokenSource === 'config'
    ? msg('令牌来自插件配置，它优先于在工作台保存的令牌，所以这里不提供保存或更换令牌。如需更换，请修改或删除插件配置中的令牌。', 'The configured plugin token takes priority over tokens saved in the workbench. Edit or remove it in the plugin configuration to change tokens.')
    : msg('上次检测到的令牌来自插件配置。请重新检测当前来源后再切换账号。', 'The last token came from plugin configuration. Check the current source again before switching accounts.')) : null;
  // Only the status line is a live region; the forms and longer notes are not re-announced on every check.
  return h('section', { className: 'pg-guide pg-auth', 'aria-label': msg('Playground 登录状态', 'Playground sign-in status'), 'aria-busy': checking || loginBusy || tokenBusy },
    h('style', null, authCss),
    h('div', { className: 'pg-head' }, h('h2', { className: 'pg-brand' }, msg('Playground 连接状态', 'Playground connection status')),
      h('button', { className: 'pg-button', disabled: checking, onClick: check }, checking ? msg('正在检测…', 'Checking…') : msg('重新检测', 'Check again'))),
    h('div', { className: 'pg-auth-status', role: 'status', 'aria-live': 'polite', tabIndex: -1, ref: (node) => { latest.status = node; } },
      h('p', { className: 'pg-note' }, summary),
      !loading && checking ? h('p', { className: 'pg-note' }, msg('正在重新检测登录状态…', 'Checking sign-in status again…')) : null,
      overridden ? h('p', { className: 'pg-note pg-auth-login-note' }, badge('warning', msg('仍在使用原令牌', 'Still using the previous token')), ' ', overridden) : null,
      switchNote ? h('p', { className: 'pg-note pg-auth-switch-note' }, switchNote) : null),
    !loading && current.cliUpdate?.warning ? h('p', { className: 'pg-note pg-cli-update' }, badge('warning', msg('CLI 需更新', 'CLI update needed')), ' ', msg(current.cliUpdate.warning, `Playground CLI ${current.cliUpdate.current} is outdated. Version ${current.cliUpdate.latest} is available. This may affect scoring. Update using the official script at https://play.bohrium.com/install.sh. On Windows, download the .tgz linked in the script, verify its SHA-256, then run npm install -g <file>.`)) : null,
    loading ? null : current.authenticated ? h(React.Fragment, null,
      h('p', { className: 'pg-note pg-auth-identity' }, msg(`当前身份：${agent ? 'Agent 账号' : '本人'}。提交会记在这个身份名下。`, `Current identity: ${agent ? "Agent account" : "Personal account"}. Submissions are attributed to this identity.`)),
      user.id != null ? h('p', { className: 'pg-note' }, msg(`账号 ID：${user.id}`, `Account ID: ${user.id}`)) : null,
      agent && operator ? h('p', { className: 'pg-note' }, msg(`操作人：${operator}${operatorState}`, `Operator: ${operator}${operatorState}`)) : null,
      agent && user.agentFramework ? h('p', { className: 'pg-note' }, msg(`Agent 框架：${user.agentFramework}`, `Agent framework: ${user.agentFramework}`)) : null,
      user.email ? h('p', { className: 'pg-note' }, user.email) : null,
      sourceLabel ? h('p', { className: 'pg-note' }, msg(`令牌来源：${sourceLabel}`, `Token source: ${sourceLabel}`)) : null,
      !editing && note ? h('p', { className: 'pg-note pg-auth-file' }, note) : null,
      current.baseUrl ? h('p', { className: 'pg-note pg-path' }, msg(`API：${current.baseUrl}`, `API: ${current.baseUrl}`)) : null,
      !editing ? h('div', { className: 'pg-actions' }, h('button', { type: 'button', className: 'pg-button pg-primary', disabled: fromConfig || tokenBusy || loginBusy, onClick: () => {
        setAccountSwitch({ phase: 'editing', previous: user }); setToken(''); setTokenError(''); setLoginDone(false);
      } }, msg('切换账号', 'Switch account')), clearButton) : null,
      !editing && tokenError ? h('p', { className: 'pg-error', role: 'alert' }, tokenError) : null,
      fromConfig ? configNote : editing ? h(React.Fragment, null, h('h3', null, msg('切换账号', 'Switch account')), tokenForm) : null)
      : h(React.Fragment, null,
        refused ? h('p', { className: 'pg-error', role: 'alert' }, refusedText)
          : failedCheck ? h('p', { className: 'pg-error', role: 'alert' }, current.reason === 'network'
            ? msg('无法连接 Playground 平台，暂时无法确认登录状态。请检查网络后点击“重新检测”。', 'Could not connect to Playground to verify sign-in. Check the network and select Check again.')
            : msg('Playground 平台暂时无法确认登录状态，请稍后点击“重新检测”。', 'Playground could not verify sign-in. Select Check again later.'))
            : current.error ? h('p', { className: 'pg-error', role: 'alert' }, current.error) : null,
        note ? h('p', { className: 'pg-note pg-auth-file' }, note) : null,
        clearButton ? h('div', { className: 'pg-actions' }, clearButton) : null,
        latest.credential?.user ? h('p', { className: 'pg-note' }, msg(`上次核实的账号为 ${accountLabel(latest.credential.user)}。`, `Last verified account: ${accountLabel(latest.credential.user)}.`)) : null,
        fromConfig ? configNote : tokenForm,
        h('details', { className: 'pg-auth-other' }, h('summary', null, msg('其他登录方式', 'Other sign-in methods')),
          h('p', { className: 'pg-note' }, msg('用 Playground CLI 注册、设有密码的账号可以用邮箱和密码登录。插件会调用已安装的 Playground CLI；密码只通过 DSH 凭据通道传给 CLI，不会写入对话，登录结束后即从 DSH 凭据中删除。登录写入 CLI 凭据文件，而 DSH 凭据、DSH 环境变量或插件配置中的令牌都优先于这个文件。也可以在 DSH 启动前完成 playground auth login，再点击“重新检测”。', 'Accounts registered with the Playground CLI and a password can sign in with email and password. The plugin passes the password to the installed CLI through DSH credentials and removes it after sign-in. The password stays out of the chat. Sign-in writes to the CLI credentials file. DSH credentials, environment tokens and plugin configuration take priority over that file. You can also run playground auth login before starting DSH, then select Check again.')),
          h('form', { className: 'pg-form', onSubmit: (event) => { event.preventDefault(); if (!loginBusy && !writingToken && email.trim() && password) submitLogin(); } },
            h('label', { className: 'pg-field' }, msg('Playground 邮箱', 'Playground email'), h('input', { className: 'pg-input', type: 'email', value: email, autoComplete: 'username', onChange: (event) => setEmail(event.target.value) })),
            h('label', { className: 'pg-field' }, msg('Playground 密码', 'Playground password'), h('input', { className: 'pg-input', type: 'password', value: password, autoComplete: 'current-password', onChange: (event) => setPassword(event.target.value) })),
            h('button', { type: 'submit', className: 'pg-button pg-primary', disabled: loginBusy || writingToken || !email.trim() || !password }, loginBusy ? msg('正在登录…', 'Signing in…') : msg('登录 Playground', 'Sign in to Playground')),
            loginError ? h('p', { className: 'pg-error', role: 'alert' }, loginError) : null))));
}

export { AuthStatusPanel };

