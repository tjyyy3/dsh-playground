import { msg } from '../shared/language.js';
import { openableWebUrl } from '../shared/display.js';
import { h } from '../shared/react.js';

const button = (label, props) => h('button', { type: 'button', className: 'pg-button', ...props }, label);

function accountCard({ current, user, sourceLabel, verifiedTime, refused, refusedBadge, failedCheck,
  checking, statusRef, tokenBusy, loginBusy, check, cancelDraft, removeToken }) {
  const name = user.name || user.email;
  const status = checking ? 'checking' : current.authenticated ? 'signed-in' : refused ? 'invalid'
    : failedCheck || current.error ? 'error' : 'signed-out';
  const host = openableWebUrl(current.baseUrl);
  const platform = host ? new URL(host).host : '';
  const time = current.authenticated && verifiedTime !== undefined
    ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(verifiedTime) : '';
  const summary = {
    checking: msg('正在检测…', 'Checking…'),
    'signed-in': msg('已登录 · 这是当前账号', 'Signed in · Current account'),
    'signed-out': msg('未登录', 'Signed out'),
    invalid: refusedBadge,
    error: msg('检测失败', 'Check failed'),
  };
  const actionsBusy = tokenBusy || loginBusy;
  return h('div', { className: 'pg-settings-account-card', 'data-status': status },
    h('span', { className: 'pg-settings-avatar', 'aria-hidden': true }, name ? Array.from(name).slice(0, 2).join('').toLocaleUpperCase() : '—'),
    h('div', { className: 'pg-settings-account-info', role: 'status', tabIndex: -1, ref: (node) => { statusRef.current = node; } },
      h('div', { className: 'pg-settings-account-name' },
        current.authenticated ? h('strong', null, name || msg('Playground 用户', 'Playground user')) : null,
        h('span', { className: 'pg-settings-account-state' }, summary[status])),
      sourceLabel ? h('span', null, msg(`令牌来源：${current.tokenSource === 'dsh' ? 'DSH 凭据中保存的令牌' : sourceLabel}`,
        `Token source: ${current.tokenSource === 'dsh' ? 'Saved in DSH credentials' : sourceLabel}`)) : null,
      time || platform ? h('span', { className: 'pg-settings-verification' },
        time ? msg(`身份核实于 ${time}`, `Verified at ${time}`) : null, time && platform ? ' · ' : null, platform) : null),
    h('div', { className: 'pg-settings-actions' },
      button(checking ? msg('正在检测…', 'Checking…') : msg('重新检测', 'Check again'), {
        disabled: checking || actionsBusy, onClick: () => { cancelDraft(); return check(); },
      }),
      current.tokenSource === 'dsh' ? button(msg('清除令牌', 'Clear token'), {
        className: 'pg-button pg-settings-clear', disabled: actionsBusy, onClick: removeToken,
      }) : null));
}

function switchSteps(token, preview, applying) {
  const labels = [
    msg('粘贴目标账号令牌', 'Paste the target account token'),
    msg('验证新账号', 'Verify new account'),
    msg('使用此账号', 'Use this account'),
  ];
  const states = preview ? ['done', 'done', applying ? 'active' : 'confirm']
    : token.trim() ? ['done', 'active', 'waiting'] : ['active', 'waiting', 'waiting'];
  const status = {
    active: msg('进行中', 'In progress'),
    done: msg('完成', 'Done'),
    waiting: msg('待开始', 'Waiting'),
    confirm: msg('待确认', 'Confirm'),
  };
  return h('ol', { className: 'pg-settings-steps' },
    labels.map((label, index) => h('li', { key: index, 'data-state': states[index],
      'aria-current': ['active', 'confirm'].includes(states[index]) ? 'step' : undefined },
    h('small', null, '0' + (index + 1), ' · ', status[states[index]]), h('span', null, label))));
}

function tokenForm({ verifyFirst, preview, previewIsCurrent, token, tokenError, pageUrl, loginBusy, tokenBusy,
  writingToken, changeToken, cancelDraft, submitToken, tokenId }) {
  const title = verifyFirst ? msg('切换账号', 'Switch account') : msg('API 令牌登录', 'Sign in with an API token');
  const disabled = loginBusy || tokenBusy;
  const submit = (label) => button(label, { type: 'submit', className: 'pg-button pg-primary', disabled });
  const cancel = button(msg('取消', 'Cancel'), { disabled: writingToken || loginBusy, onClick: cancelDraft });
  const verifyLabel = tokenBusy ? msg('正在验证…', 'Verifying…') : msg('验证新账号', 'Verify new account');
  return h('form', { className: 'pg-settings-switch', 'aria-label': title, onSubmit: (event) => {
    event.preventDefault();
    if (!disabled) return submitToken();
  } },
  h('div', { className: 'pg-settings-switch-head' }, h('h3', null, title),
    verifyFirst ? h('span', { className: 'pg-settings-switch-note' }, msg('只影响之后的操作，已有任务和提交记录保留原归属',
      'Applies to future operations. Existing tasks and submissions keep their original owners.')) : null),
  verifyFirst ? switchSteps(token, preview, writingToken) : null,
  h('div', { className: 'pg-settings-field' },
    h('label', { htmlFor: tokenId }, verifyFirst ? msg('目标账号的 API 令牌', 'Target account API token') : msg('API 令牌', 'API token')),
    h('div', { className: 'pg-settings-token-row' },
      h('input', { id: tokenId, className: 'pg-input', type: 'password', value: token, autoComplete: 'off', spellCheck: false, disabled, onChange: changeToken }),
      pageUrl ? h('a', { className: 'pg-button', href: pageUrl, target: '_blank', rel: 'noopener noreferrer' },
        msg('去网站生成令牌', 'Generate token on website')) : null)),
  preview ? h('div', { className: 'pg-settings-confirm' },
    h('span', { className: 'pg-settings-switch-note' }, msg('将切换为', 'Switch to')),
    h('strong', null, preview.name || preview.email || msg('账号', 'Account')),
    h('code', null, typeof preview.userType === 'string' && preview.userType.trim().toLowerCase() === 'agent' ? msg('Agent 账号', 'Agent account') : msg('Playground 用户', 'Playground user'),
      preview.id != null ? ' · #' + preview.id : '',
      previewIsCurrent ? msg(' · 当前账号', ' · Current account') : null),
    cancel, submit(writingToken ? msg('正在保存…', 'Saving…') : msg('使用此账号', 'Use this account')))
    : h('div', { className: 'pg-settings-actions' }, token.trim() ? cancel : null,
      submit(verifyFirst ? verifyLabel : writingToken ? msg('正在保存…', 'Saving…') : msg('保存令牌', 'Save token'))),
  h('p', { className: 'pg-settings-switch-note' }, verifyFirst
    ? msg('确认后工作台会再次验证实际生效的身份。当前 DSH 令牌在确认前不会被替换。',
      'The workbench verifies the active identity again after confirmation. Your current DSH token stays active until you confirm.')
    : msg('令牌保存在 DSH 凭据中，保存后会检测登录状态。', 'The workbench saves the token in DSH credentials and then checks sign-in.')),
  tokenError ? h('p', { className: 'pg-error', role: 'alert' }, tokenError) : null);
}

export function renderSettingsAuth(props) {
  const { loading, current, user, refusedText, failedCheck, note, overridden, switchNote, fromConfig,
    configNote, tokenError, otherLogin, lastUser, agent, operator, operatorState } = props;
  const detail = refusedText || (failedCheck
    ? msg('暂时无法确认登录状态。请检查连接后点击“重新检测”。', 'Could not verify sign-in. Check the connection and select Check again.')
    : current.error);
  return h('section', { className: 'pg-settings-auth', 'aria-label': msg('Playground 登录状态', 'Playground sign-in status') },
    accountCard(props),
    detail ? h('p', { className: 'pg-error', role: 'alert' }, detail) : null,
    lastUser && !current.authenticated && !loading ? h('p', { className: 'pg-note' },
      msg(`上次核实的账号为 ${lastUser.name || lastUser.email || lastUser.id}。`, `Last verified account: ${lastUser.name || lastUser.email || lastUser.id}.`)) : null,
    overridden || switchNote ? h('p', { className: 'pg-note', role: 'status' }, overridden || switchNote) : null,
    current.tokenSource === 'dsh' && (current.cliFileToken || current.envToken)
      ? h('p', { className: 'pg-note' }, note) : null,
    !loading ? (fromConfig ? configNote : tokenForm(props)) : null,
    (loading || fromConfig) && tokenError ? h('p', { className: 'pg-error', role: 'alert' }, tokenError) : null,
    !loading ? h('details', { className: 'pg-settings-other' },
      h('summary', null, h('svg', { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3.5 2 6.5 5l-3 3', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' })),
      msg('其他登录方式', 'Other sign-in methods'),
      h('span', { className: 'pg-settings-other-caption' }, msg('邮箱和密码，通过 Playground CLI', 'Email and password via Playground CLI'))),
      h('div', { className: 'pg-settings-other-body' },
        current.authenticated && agent ? h('p', { className: 'pg-note' },
          msg(`当前身份：Agent 账号。提交会记在此身份名下。`, 'Current identity: Agent account. Submissions are attributed to this identity.')) : null,
        current.authenticated && user.id != null ? h('p', { className: 'pg-note' }, msg(`账号 ID：${user.id}`, `Account ID: ${user.id}`)) : null,
        current.authenticated && user.email ? h('p', { className: 'pg-note' }, user.email) : null,
        current.authenticated && agent && operator ? h('p', { className: 'pg-note' },
          msg(`操作人：${operator}${operatorState}`, `Operator: ${operator}${operatorState}`)) : null,
        current.authenticated && agent && user.agentFramework ? h('p', { className: 'pg-note' },
          msg(`Agent 框架：${user.agentFramework}`, `Agent framework: ${user.agentFramework}`)) : null,
        note && !current.envToken && !current.cliFileToken ? h('p', { className: 'pg-note' }, note) : null,
        ...otherLogin)) : null);
}
