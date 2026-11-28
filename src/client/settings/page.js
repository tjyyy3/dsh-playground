import * as React from 'react';
import { languagePreference, msg, setLanguage } from '../shared/language.js';
import { h } from '../shared/react.js';
import { settingsCss, releaseSettingsCss } from './styles.js';

const cliGuide = 'https://github.com/tjyyy3/dsh-playground/blob/main/guide/reference.md#install-or-update-the-playground-cli';

function LanguageSetting() {
  const selected = languagePreference();
  const label = msg('界面语言', 'Interface language');
  return h('div', { className: 'pg-settings-preference' },
    h('div', null, h('span', null, label), h('small', null,
      msg('题面正文、聊天记录和你的输入保留原文', 'Challenge text, chats, and your input keep their original language'))),
    h('div', { className: 'pg-settings-segmented', role: 'group', 'aria-label': label },
      [[null, msg('跟随 DSH', 'Follow DSH')], ['zh', '中文'], ['en', 'English']].map(([value, label]) =>
        h('button', { key: value ?? 'follow', type: 'button', lang: value ?? undefined,
          'aria-pressed': selected === value, onClick: () => setLanguage(value) }, label))));
}

export function SettingsPage({ active, brand, onBack, checks, cliUpdate, configuredBase, authStatus, releaseAvailable, releaseVisit, children }) {
  const id = React.useId();
  const root = React.useRef(null);
  const back = React.useRef(null);
  const sections = React.useRef(new Map());
  const [selected, setSelected] = React.useState('account');
  const { version } = React.useSyncExternalStore(checks.subscribe, checks.getSnapshot);
  const [auth, notices, release] = children;
  const cliWarning = Boolean(cliUpdate?.current && cliUpdate?.latest);
  const labels = {
    account: msg('账号与令牌', 'Account and token'),
    cli: msg('Playground CLI', 'Playground CLI'),
    api: msg('API 地址', 'API address'),
    prefs: msg('语言与提醒', 'Language and alerts'),
    updates: msg('版本与更新', 'Version and updates'),
  };
  const attention = {
    cli: cliWarning ? ['warning', msg('CLI 需更新', 'CLI update needed')] : null,
    updates: releaseAvailable || version ? ['info', msg('有新版本', 'Update available')] : null,
  };
  React.useLayoutEffect(() => {
    if (!active) { setSelected('account'); return; }
    if (releaseVisit) setSelected('updates');
    else back.current?.focus({ preventScroll: true });
  }, [active, releaseVisit]);
  const closeOnEscape = (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    onBack();
  };
  React.useEffect(() => {
    if (!active || !globalThis.document) return;
    const onBodyKey = (event) => {
      if (event.target === document.body && root.current?.getClientRects().length) closeOnEscape(event);
    };
    document.addEventListener('keydown', onBodyKey);
    return () => document.removeEventListener('keydown', onBodyKey);
  }, [active, onBack]);

  const section = (key, ...content) => h('section', {
    id: id + '-' + key, 'data-section': key, className: 'pg-settings-section', tabIndex: -1,
    'aria-labelledby': key === 'updates' ? undefined : id + '-' + key + '-heading',
    'aria-label': key === 'updates' ? labels[key] : undefined,
    ref: (node) => { if (node) sections.current.set(key, node); else sections.current.delete(key); },
  }, key !== 'updates' ? h('h2', { id: id + '-' + key + '-heading' }, labels[key]) : null, ...content);

  return h('div', { className: 'pg-settings-page', ref: root, hidden: !active, onKeyDown: closeOnEscape },
  h('style', null, settingsCss + releaseSettingsCss),
  active ? h('header', { className: 'pg-settings-header' }, brand,
    h('button', { type: 'button', className: 'pg-button pg-settings-back', ref: back, onClick: onBack },
      h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M7.5 2.5 4 6l3.5 3.5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' })),
      msg('返回工作台', 'Back to workbench')),
    h('h1', null, msg('连接设置', 'Connection settings')),
    h('span', { className: 'pg-settings-escape' }, msg('Esc 返回', 'Esc to go back'))) : null,
  h('div', { className: 'pg-settings-scroll' },
    active ? h('nav', { className: 'pg-settings-nav', 'aria-label': msg('设置分区', 'Settings sections') },
      Object.entries(labels).map(([key, label]) => h('button', { key, type: 'button', 'aria-controls': id + '-' + key,
        'aria-current': key === selected ? 'true' : undefined,
        onClick: () => {
          const target = sections.current.get(key);
          if (!target) return;
          setSelected(key);
          target.focus({ preventScroll: true });
          target.scrollIntoView({ block: 'start' });
        },
      }, label, attention[key] ? h('span', { className: 'pg-settings-dot', 'data-tone': attention[key][0], title: attention[key][1], role: 'img',
        'aria-label': attention[key][1] }) : null))) : null,
    h('main', { className: 'pg-settings-main' },
      h('div', { className: 'pg-settings-content' },
        section('account', auth),
        active ? h(React.Fragment, null,
          section('cli',
            h('div', { className: 'pg-settings-cli', 'data-tone': cliWarning ? 'warning' : undefined },
              h('span', { className: 'pg-settings-cli-state' }, cliWarning
                ? msg('CLI 需更新', 'CLI update needed')
                : authStatus === 'checking' ? msg('正在检测…', 'Checking…')
                  : msg('暂无 CLI 版本信息', 'CLI version not reported')),
              cliWarning ? h('code', null, cliUpdate.current, ' → ', cliUpdate.latest) : null,
              h('a', { className: 'pg-button', href: cliGuide, target: '_blank', rel: 'noopener noreferrer' },
                msg('查看安装或更新说明', 'Installation and update instructions'))),
          ),
          section('api',
            h('label', { className: 'pg-settings-field' },
              msg('远程 API 必须使用 HTTPS；本机 HTTP 仅用于调试。', 'Remote APIs require HTTPS. Local HTTP is for debugging.'),
              h('input', { className: 'pg-input', type: 'url', value: configuredBase ?? '', readOnly: true,
                placeholder: msg('地址暂不可用', 'Address unavailable') }))),
          section('prefs', h(LanguageSetting), notices),
          section('updates', release)) : null))));
}
