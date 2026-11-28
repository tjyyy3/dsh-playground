export const settingsCss = `
  .pg-settings-page { flex:1; min-width:0; min-height:0; display:flex; flex-direction:column; background:var(--pg-base); font:14px/1.55 var(--pg-font-title); container-type:inline-size }
  .pg-settings-page[hidden] { display:none }
  .pg-settings-page *, .pg-settings-page *::before, .pg-settings-page *::after { box-sizing:border-box }
  .pg-settings-page :is(button,a,summary,input):focus-visible { outline:2px solid var(--pg-accent); outline-offset:2px }
  .pg-settings-page h1,.pg-settings-page h2,.pg-settings-page h3 { margin:0; font-family:var(--pg-font-title); font-weight:600 }
  .pg-settings-page h1,.pg-settings-page h3 { font-size:15px }
  .pg-settings-page h2 { font-size:18px }
  .pg-settings-page p { margin:0 }
  .pg-settings-page .pg-button { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:36px; padding:0 12px; border-radius:var(--pg-r6); font-size:12.5px; text-decoration:none }
  .pg-settings-page .pg-primary:not(:disabled) { padding:0 14px; border-color:transparent }
  .pg-settings-page .pg-input { min-width:0; width:100%; height:38px; padding:0 12px; background:var(--pg-ink); border-color:var(--pg-control-line); border-radius:var(--pg-r6); font:12.5px/1.55 var(--pg-font-mono) }
  .pg-settings-page .pg-input::placeholder { color:var(--pg-label) }
  .pg-settings-header { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:8px 18px; min-height:56px; padding:0 16px; border-bottom:1px solid var(--pg-line); background:#0B0D10 }
  .pg-settings-header .pg-settings-back { min-height:34px; border-color:var(--pg-control-line) }
  .pg-settings-escape { margin-left:auto; color:var(--pg-label); font:11px/1.55 var(--pg-font-mono) }
  .pg-settings-scroll { flex:1; min-height:0; display:flex; overflow:auto; scrollbar-color:var(--pg-control-line) var(--pg-base) }
  .pg-settings-nav { position:sticky; top:0; flex:0 0 221px; align-self:flex-start; min-height:100%; display:flex; flex-direction:column; gap:2px; padding:22px 12px; border-right:1px solid #1A1F27; background:#0B0D10 }
  .pg-settings-nav button { display:flex; align-items:center; gap:10px; min-height:38px; padding:0 12px; border:0; border-radius:var(--pg-r6); background:transparent; color:var(--pg-muted); font:inherit; font-size:13.5px; text-align:start; cursor:pointer }
  .pg-settings-nav button:hover { background:var(--pg-hover); color:var(--pg-text) }
  .pg-settings-nav button[aria-current=true] { background:#161B22; color:var(--pg-text) }
  .pg-settings-dot { width:7px; height:7px; flex:none; margin-left:auto; border-radius:50%; background:currentColor }
  .pg-settings-dot[data-tone=warning] { color:var(--pg-warning) }
  .pg-settings-dot[data-tone=info] { color:var(--pg-info) }
  .pg-settings-main { flex:1; min-width:0 }
  .pg-settings-content { display:flex; flex-direction:column; gap:28px; max-width:860px; padding:26px 32px 60px }
  .pg-settings-section { display:flex; flex-direction:column; gap:12px; min-width:0; scroll-margin-block-start:16px }
  .pg-settings-section:focus { outline:none }
  .pg-settings-section[data-section=account],.pg-settings-auth { display:grid; gap:14px }
  .pg-settings-section[data-section=api] { gap:10px }
  .pg-settings-field { display:grid; gap:6px; color:var(--pg-muted); font-size:12.5px }
  .pg-settings-account-card { display:flex; flex-wrap:wrap; align-items:center; gap:16px; padding:18px; border:1px solid var(--pg-control-line); border-radius:12px; background:var(--pg-panel) }
  .pg-settings-avatar { flex:none; display:grid; place-items:center; width:48px; height:48px; border-radius:var(--pg-r10); background:var(--pg-accent-soft); border:1px solid #2E3A1E; color:var(--pg-accent); font:15px/1 var(--pg-font-mono) }
  .pg-settings-account-card:not([data-status=signed-in]) .pg-settings-avatar { background:var(--pg-control); border-color:var(--pg-control-line); color:var(--pg-muted) }
  .pg-settings-account-info { flex:1 1 220px; display:grid; gap:3px; min-width:0; overflow-wrap:anywhere; color:var(--pg-muted); font-size:12.5px }
  .pg-settings-account-name { display:flex; flex-wrap:wrap; align-items:center; gap:8px }
  .pg-settings-account-name strong { color:var(--pg-text); font-size:16px; font-weight:600 }
  .pg-settings-account-state,.pg-settings-cli-state { display:inline-flex; align-items:center; gap:5px; color:var(--pg-muted); font-size:12px }
  .pg-settings-account-state::before,.pg-settings-cli[data-tone=warning] .pg-settings-cli-state::before { content:""; width:7px; height:7px; flex:none; border-radius:50%; background:currentColor }
  .pg-settings-account-card[data-status=signed-in] .pg-settings-account-state { color:var(--pg-accent) }
  .pg-settings-account-card:is([data-status=invalid],[data-status=error]) .pg-settings-account-state,.pg-settings-page .pg-settings-clear { color:var(--pg-error) }
  .pg-settings-verification { color:var(--pg-label); font:11px/1.55 var(--pg-font-mono) }
  .pg-settings-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px }
  .pg-settings-switch { display:grid; gap:16px; padding:18px; border:1px solid var(--pg-line); border-radius:12px; background:#0B0E12 }
  .pg-settings-switch-head { display:flex; flex-wrap:wrap; align-items:center; gap:4px 10px }
  .pg-settings-switch-note,.pg-settings-other-caption { color:var(--pg-label); font-size:12px }
  .pg-settings-steps { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); gap:10px; margin:0; padding:0; list-style:none }
  .pg-settings-steps li { display:grid; gap:4px; padding:10px 12px; border:1px solid var(--pg-control-line); border-radius:var(--pg-r8); background:var(--pg-panel); font-size:13px }
  .pg-settings-steps small { color:var(--pg-label); font:11px/1.55 var(--pg-font-mono) }
  .pg-settings-steps li[data-state=done] { border-color:#2E3A1E; background:#10140B }
  .pg-settings-steps li[data-state=done] small { color:var(--pg-accent) }
  .pg-settings-steps li:is([data-state=active],[data-state=confirm]) { border-color:#6E8A2A }
  .pg-settings-steps li:is([data-state=active],[data-state=confirm]) small { color:var(--pg-text) }
  .pg-settings-token-row { display:flex; gap:8px }
  .pg-settings-token-row .pg-button { flex:none; min-height:38px }
  .pg-settings-confirm { display:flex; flex-wrap:wrap; align-items:center; gap:14px; padding:12px 14px; border:1px solid var(--pg-control-line); border-radius:var(--pg-r8); background:var(--pg-ink) }
  .pg-settings-confirm strong { font-weight:600; overflow-wrap:anywhere }
  .pg-settings-confirm code { flex:1; color:var(--pg-muted); font:11.5px/1.55 var(--pg-font-mono) }
  .pg-settings-other { margin:0; border:1px solid var(--pg-line); border-radius:var(--pg-r10); background:#0B0E12 }
  .pg-settings-other summary { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:12px 14px; list-style:none; cursor:pointer; font-size:13px }
  .pg-settings-other summary::-webkit-details-marker { display:none }
  .pg-settings-other summary svg { color:var(--pg-label) }
  .pg-settings-other[open] summary svg { transform:rotate(90deg) }
  .pg-settings-other-body { display:grid; gap:8px; padding:0 14px 14px }
  .pg-settings-other-body form { display:grid; gap:8px; justify-items:start }
  .pg-settings-other-body label { display:grid; gap:4px; width:100%; max-width:360px; color:var(--pg-muted); font-size:12.5px }
  .pg-settings-cli,.pg-settings-preference { display:flex; flex-wrap:wrap; align-items:center; gap:12px 14px; padding:14px 16px; border:1px solid var(--pg-line); border-radius:var(--pg-r10) }
  .pg-settings-cli .pg-button { margin-left:auto; min-height:34px }
  .pg-settings-cli[data-tone=warning] { background:#120F09; border-color:#4A3A1A }
  .pg-settings-cli[data-tone=warning] .pg-settings-cli-state { color:var(--pg-warning); font-size:12.5px }
  .pg-settings-cli[data-tone=warning] .pg-button { border-color:#3A2F18 }
  .pg-settings-cli[data-tone=warning] :is(code,.pg-button) { color:#E8D7BC }
  .pg-settings-cli code { font:12px/1.55 var(--pg-font-mono) }
  .pg-settings-preference > :first-child { display:grid; flex:1 1 200px }
  .pg-settings-preference small { color:var(--pg-label); font-size:12px }
  .pg-settings-segmented { display:flex; padding:2px; border:1px solid #222833; border-radius:var(--pg-r6); background:var(--pg-control) }
  .pg-settings-segmented button { min-height:30px; padding:0 12px; border:0; border-radius:var(--pg-r4); background:transparent; color:var(--pg-muted); font:inherit; font-size:12.5px; cursor:pointer }
  .pg-settings-segmented button[aria-pressed=true] { background:#1E242D; color:var(--pg-text) }
  .pg-settings-notice input { appearance:none; display:grid; align-items:center; width:42px; height:24px; margin:0; border-radius:12px; background:var(--pg-control-line); cursor:pointer }
  .pg-settings-notice input::before { content:""; width:18px; height:18px; margin:0 3px; border-radius:50%; background:var(--pg-muted) }
  .pg-settings-notice input:checked { background:var(--pg-accent) }
  .pg-settings-notice input:checked::before { justify-self:end; background:var(--pg-ink) }
  @media(forced-colors:active) { .pg-settings-notice input { appearance:auto } }
  @container(max-width:700px) {
    .pg-settings-scroll { flex-direction:column }
    .pg-settings-nav { position:static; flex:0 0 auto; align-self:stretch; flex-direction:row; flex-wrap:wrap; min-height:auto; padding:8px 12px; border-right:0; border-bottom:1px solid var(--pg-line) }
    .pg-settings-content { padding:20px 16px 44px }
  }
  @container(max-width:420px) {
    .pg-settings-header { padding-block:8px }
    .pg-settings-token-row { flex-wrap:wrap }
  }
`;

export const releaseSettingsCss = `
  .pg-settings-release { display:grid; gap:12px; min-width:0; overflow-wrap:anywhere }
  .pg-release-header,.pg-release-summary,.pg-release-versions,.pg-release-actions,.pg-release-pref { display:flex; flex-wrap:wrap; align-items:center; gap:12px }
  .pg-release-header,.pg-release-summary { justify-content:space-between }
  .pg-settings-release-channel { padding:4px 12px; border:1px solid var(--pg-line); border-radius:var(--pg-r6); color:var(--pg-muted); background:var(--pg-control); font-size:12.5px }
  .pg-settings-release-card { display:grid; gap:14px; padding:18px; border:1px solid var(--pg-control-line); border-radius:12px; background:var(--pg-panel) }
  .pg-settings-release-card[data-tone=info] { border-color:#23364A; background:#0B1118 }
  .pg-release-versions { gap:16px }
  .pg-release-version { display:grid; gap:2px; font-family:var(--pg-font-mono) }
  .pg-release-version small { color:var(--pg-label); font-size:10.5px; letter-spacing:.1em }
  .pg-release-version strong { font-size:22px; font-weight:400 }
  .pg-release-arrow,.pg-settings-release-card[data-tone=info] .pg-release-target :is(small,strong) { color:var(--pg-info) }
  .pg-release-verified { display:flex; flex-wrap:wrap; gap:8px; color:#C9DDF2; font-size:12px }
  .pg-release-verified span { flex:1 1 170px; padding:8px 10px; border:1px solid #1B2A3A; border-radius:var(--pg-r6) }
  .pg-release-verified span::before { content:"✓"; margin-right:8px; color:var(--pg-accent) }
  .pg-release-pref { padding:12px 16px; border:1px solid var(--pg-line); border-radius:var(--pg-r10); font-size:12.5px }
  .pg-release-pref label { display:flex; flex-wrap:wrap; align-items:center; gap:8px }
  .pg-release-pref input { width:16px; height:16px; margin:0; accent-color:var(--pg-accent) }
  .pg-release-source { flex:1 1 180px; color:var(--pg-muted) }
  .pg-release-source-value { color:var(--pg-text); font-family:var(--pg-font-mono) }
  .pg-release-pref .pg-release-check { min-height:32px }
  .pg-release-details { padding:12px 14px; border:1px solid var(--pg-line); border-radius:var(--pg-r10); color:var(--pg-muted); font-size:13px }
  .pg-release-details summary { cursor:pointer }
  .pg-settings-page .pg-release-details p { margin-block:8px }
  .pg-release-spec { display:block; margin:8px 0; user-select:all }
`;
