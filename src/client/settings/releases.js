import * as React from 'react';
import { openableWebUrl } from '../shared/display.js';
import { h } from '../shared/react.js';

const RELEASE_CHANNEL_LABELS = { stable: '正式版', beta: 'Beta' };

const releaseCss = `
  .pg-release{margin-top:12px;overflow-wrap:anywhere}.pg-release-version strong{color:var(--dsw-alias-label-primary)}.pg-release .pg-error{color:var(--pg-error)}
  .pg-release-controls{align-items:flex-end;justify-content:flex-start;margin-top:10px}
  .pg-release-link{box-sizing:border-box;display:inline-flex;align-items:center;text-decoration:none}.pg-release-spec{display:block;user-select:all;margin:8px 0}
`;

function ReleaseStatusPanel({ query }) {
  const [info, setInfo] = React.useState(null);
  const [release, setRelease] = React.useState({ status: 'loading' });
  const [copyStatus, setCopyStatus] = React.useState('');
  const [latest] = React.useState(() => ({ controller: null }));
  const cancel = () => { latest.controller?.abort(); latest.controller = null; };
  const load = async (check) => {
    setCopyStatus('');
    cancel();
    const controller = new AbortController();
    latest.controller = controller;
    setRelease({ ...release, status: check ? 'checking' : 'loading' });
    const timer = setTimeout(() => controller.abort(new Error('release_rpc_timeout')), check ? 120000 : 10000);
    try {
      const next = await Promise.race([
        query({ action: 'releases', check }, controller.signal),
        new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })),
      ]);
      if (latest.controller !== controller) return;
      if (!['ready', 'unchecked', 'unavailable'].includes(next?.status)) {
        setRelease({ ...release, status: 'unavailable', error: 'failed' });
        return;
      }
      if (next.channel) setInfo(next);
      setRelease(next.status === 'ready' || !release.target ? next : { ...release, ...next,
        target: next.target ?? release.target, comparison: next.comparison ?? release.comparison,
        warnings: next.warnings ?? release.warnings });
    } catch (error) {
      if (latest.controller === controller) setRelease({ ...release, status: 'unavailable',
        error: error?.message === 'release_rpc_timeout' ? check ? 'timeout' : 'info_timeout' : 'failed' });
    } finally {
      clearTimeout(timer);
    }
  };
  React.useEffect(() => { load(false); return cancel; }, [query]);
  React.useEffect(() => {
    if (release.error !== 'rate_limited' || !release.resetAt) return;
    const timer = setTimeout(() => setRelease({ ...release, status: release.target ? 'ready' : 'unchecked',
      error: undefined, resetAt: undefined }), Math.max(0, Date.parse(release.resetAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [release.error, release.resetAt]);
  const { status, comparison } = release;
  const target = release.target;
  const runningChannel = RELEASE_CHANNEL_LABELS[info?.currentChannel];
  const targetChannel = target?.prerelease ? RELEASE_CHANNEL_LABELS.beta : RELEASE_CHANNEL_LABELS.stable;
  const targetLabel = target ? `${target.version}（${targetChannel}）` : '';
  const notesUrl = openableWebUrl(target?.notesUrl);
  const canReadNotes = notesUrl?.startsWith('https://');
  const gitSource = ['git_pinned', 'git_unpinned'].includes(info?.source);
  const gitSpec = /^github:tjyyy3\/dsh-playground#[0-9a-f]{40}$/.test(target?.gitSpec) ? target.gitSpec : null;
  const registrySource = info?.source === 'registry';
  const installSpec = gitSource ? gitSpec : registrySource && target ? `dsh-playground@${target.version}` : null;
  const specLabel = gitSource ? 'Git spec' : 'npm spec';
  const rateLimited = release.error === 'rate_limited';
  const errorText = {
    info_timeout: '读取本地版本信息超时。请稍后重试。',
    timeout: '检查发布版本超时。请稍后检查。',
    rate_limited: `GitHub 请求额度已用完。额度恢复时间为 ${release.resetAt || '未知'}，恢复前不会再次请求。`,
    failed: '无法读取发布版本。请检查网络后稍后检查。',
    incomplete: '发布列表超过读取上限，未找到此渠道的版本。请查看 GitHub Releases。',
    version_unavailable: '无法读取本地插件版本，请在 DSH 插件管理器核对安装。',
    user_action_required: '无法核实浏览器检查操作。请重新打开 DSH 工作台。',
  }[release.error] || '无法读取发布版本。';
  const statusText = {
    unchecked: '尚未检查更新。',
    checking: '正在检查发布版本…',
    unavailable: errorText,
    ready: target ? {
      current: `当前已运行此版本（${targetChannel}）。`,
      upgrade: `可升级至 ${targetLabel}。`,
      downgrade: `此渠道最新版本 ${targetLabel} 早于运行版本。降级前请核对兼容性；DSH 更新操作不接受旧版本。`,
    }[comparison] || `已发布 ${targetLabel}。` : info?.channel === 'beta' ? 'Beta 渠道暂无发布。' : '暂无稳定版发布。',
  }[status];

  return h('section', { className: 'pg-guide pg-release', 'aria-label': 'Playground 版本与更新' },
    h('style', null, releaseCss),
    h('h2', { className: 'pg-brand' }, 'Playground 版本与更新'),
    h('p', { className: 'pg-note pg-release-version' }, info?.currentVersion
      ? h(React.Fragment, null, '当前运行版本 ', h('strong', null, info.currentVersion), runningChannel ? ` · ${runningChannel}` : '')
      : status === 'loading' ? '正在读取运行版本…' : '无法读取运行版本。'),
    info?.installedVersion ? h('p', { className: 'pg-note' }, `磁盘版本 ${info.installedVersion}。${info.restartRequired ? '磁盘版本较新，需要重启 DSH。' : ''}`) : null,
    info?.sourceHint ? h('p', { className: 'pg-note' }, info.sourceHint) : null,
    h('div', { className: 'pg-head pg-release-controls' },
      h('span', { className: 'pg-note' }, `更新渠道 ${RELEASE_CHANNEL_LABELS[info?.channel] || '读取中'}。在插件配置 releaseChannel 中修改。`),
      h('button', { type: 'button', className: 'pg-button', disabled: status === 'loading' || status === 'checking' || rateLimited, onClick: () => load(true) },
        status === 'checking' ? '正在检查…' : rateLimited ? '等待额度恢复' : '检查更新')),
    info?.channel === 'beta' ? h('p', { className: 'pg-note' }, 'Beta 提供抢先功能，可能不稳定。') : null,
    h('p', { className: status === 'unavailable' ? 'pg-note pg-error' : 'pg-note', role: 'status' }, statusText),
    release.warnings?.includes('prerelease_mismatch') ? h('p', { className: 'pg-note' }, '部分 Release 的预发布标志与 tag 不一致，已跳过。请在 GitHub Releases 核对。') : null,
    target ? h(React.Fragment, null,
      release.incomplete ? h('p', { className: 'pg-note' }, '发布列表超过读取上限，以上为已读取发布中的最高版本。请在 GitHub Releases 核对完整列表。') : null,
      canReadNotes ? h('a', { className: 'pg-button pg-release-link', href: notesUrl, target: '_blank', rel: 'noopener noreferrer' }, '发布说明') : null,
      installSpec ? h(React.Fragment, null,
        h('code', { className: 'pg-release-spec' }, installSpec),
        h('button', { type: 'button', className: 'pg-button', onClick: async () => {
          try { await navigator.clipboard.writeText(installSpec); setCopyStatus(`已复制 ${specLabel}`); }
          catch { setCopyStatus(`无法复制，请选择上方 ${specLabel} 后复制。`); }
        } }, `复制 ${specLabel}`), h('span', { role: 'status', className: 'pg-note' }, copyStatus)) : null,
      registrySource ? h('p', { className: 'pg-note' }, `也可填 ${target.prerelease ? 'dsh-playground@beta' : 'dsh-playground'} 安装此渠道当前最新版本。`) : null,
      gitSource && !gitSpec ? h('p', { className: 'pg-note' }, '此 Release 未提供完整 commit SHA，无法生成固定 Git spec。') : null) : null);
}

export { ReleaseStatusPanel };

