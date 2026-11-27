export const controllerPanelCss = `
  .pg-controller { height:100%; min-height:0; display:flex; flex-direction:column; background:var(--pg-base); }
  .pg-controller-bar { box-sizing:border-box; flex:none; display:flex; align-items:center; flex-wrap:wrap; gap:8px 18px; min-height:56px; padding:0 var(--pg-s16); border-bottom:1px solid var(--pg-line); background:#0B0D10; }
  .pg-controller-brand { display:flex; align-items:center; gap:10px; }
  .pg-controller-brand svg { color:var(--pg-accent); flex:none; }
  .pg-controller-brand h1 { margin:0; font-size:15px; font-weight:600; letter-spacing:-.01em; }
  .pg-controller-brand small { font:10.5px/1.55 var(--pg-font-mono); color:var(--pg-label); border:1px solid var(--pg-control-line); border-radius:var(--pg-r4); padding:1px 5px; }
  .pg-controller-workspace { position:relative; box-sizing:border-box; display:flex; align-items:center; gap:10px; height:var(--pg-h36); min-width:min(100%, 230px); max-width:min(100%, 280px); padding:0 10px 0 12px; border:1px solid var(--pg-control-line); border-radius:var(--pg-r6); background:var(--pg-control); }
  .pg-controller-workspace:not(:has(select:disabled)):hover { background:var(--pg-hover); border-color:#353D4A; }
  .pg-controller-workspace > svg { color:var(--pg-muted); flex:none; }
  .pg-controller-workspace-text { display:grid; flex:1; min-width:0; line-height:1.2; }
  .pg-controller-workspace-text > span { font-size:13px; font-weight:500; }
  .pg-controller-workspace-text small { font:10.5px/1.2 var(--pg-font-mono); color:var(--pg-label); }
  .pg-controller-workspace-text > * { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pg-controller-workspace select { position:absolute; inset:0; width:100%; height:100%; opacity:0; color-scheme:dark; cursor:pointer; }
  .pg-controller-workspace select:disabled { cursor:default; }
  .pg-controller-workspace:has(select:disabled) { color:var(--pg-label); }
  .pg-controller-bar button { font-family:inherit; }
  .pg-controller-account-mark { display:grid; place-items:center; width:24px; height:24px; margin-left:-4px; border-radius:5px; background:#1B2028; color:var(--pg-accent); font:10.5px/1 var(--pg-font-mono); }
  .pg-controller :is(.pg-controller-workspace:focus-within,.pg-controller-tab:focus-visible,.pg-controller-icon:focus-visible,.pg-controller-connection:focus-visible,.pg-release-indicator:focus-visible,.pg-language-menu button:focus-visible,.pg-controller-resize:focus-visible,.pg-controller-tasks summary:focus-visible,.pg-controller-row:focus-visible) { outline:2px solid var(--pg-accent); outline-offset:-2px; }
  .pg-controller-tabs { display:flex; align-self:stretch; min-height:54px; gap:2px; }
  .pg-controller-tab { padding:0 12px; border:0; border-bottom:2px solid transparent; background:transparent; color:var(--pg-muted); font-size:14px; font-weight:500; cursor:pointer; }
  .pg-controller-tab:hover,.pg-controller-tab[aria-selected=true] { color:var(--pg-text); }
  .pg-controller-tab[aria-selected=true] { border-bottom-color:var(--pg-accent); font-weight:600; }
  .pg-controller-account { display:flex; align-items:center; flex-wrap:wrap; gap:var(--pg-s8); margin-left:auto; }
  .pg-controller-account :is(.pg-controller-icon,.pg-controller-connection,.pg-release-indicator) { box-sizing:border-box; height:var(--pg-h36); border:1px solid #222833; border-radius:var(--pg-r6); background:var(--pg-control); color:var(--pg-muted); cursor:pointer; }
  .pg-controller-account :is(.pg-controller-icon,.pg-controller-connection,.pg-release-indicator):hover { background:#1B2028; border-color:#353D4A; color:var(--pg-text); }
  .pg-controller-account .pg-release-indicator { display:inline-flex; align-items:center; gap:6px; padding:0 10px; font-size:12.5px; color:var(--pg-info); border-color:#23364A; background:#0F1620; white-space:nowrap; }
  .pg-controller-account .pg-controller-connection { display:flex; align-items:center; gap:8px; padding:0 10px; font-size:13px; color:var(--pg-text); white-space:nowrap; }
  .pg-controller-connection-dot { width:7px; height:7px; flex:none; border-radius:50%; background:var(--pg-label); }
  .pg-controller-connection[data-status=authenticated] .pg-controller-connection-dot { background:var(--pg-accent); }
  .pg-controller-connection:is([data-status=unavailable],[data-status=unauthenticated]) .pg-controller-connection-dot { background:var(--pg-error); }
  .pg-controller-icon { display:grid; place-items:center; flex:none; width:var(--pg-h36); padding:0; }
  .pg-controller-account .pg-controller-icon[aria-expanded=true] { background:var(--pg-hover); }
  .pg-language { position:relative; flex:none; }
  .pg-language-menu,.pg-language-tip { position:absolute; z-index:20; top:calc(100% + 4px); right:0; width:max-content; max-width:calc(100vw - 16px); box-sizing:border-box; background:var(--pg-control); border:1px solid var(--pg-control-line); border-radius:var(--pg-r6); box-shadow:0 4px 12px rgba(0,0,0,.24); }
  .pg-language-menu { padding:var(--pg-s4); }
  .pg-language-menu button { display:flex; align-items:center; justify-content:space-between; gap:var(--pg-s12); width:100%; min-height:var(--pg-h30); padding:4px 8px; text-align:start; border:0; border-radius:var(--pg-r4); background:transparent; color:inherit; cursor:pointer; }
  .pg-language-menu button:hover { background:var(--pg-hover); }
  .pg-language-tip { visibility:hidden; padding:5px 8px; font-size:12px; pointer-events:none; }
  .pg-language:hover .pg-language-tip,.pg-language button:focus-visible + .pg-language-tip { visibility:visible; }
  .pg-controller-body { flex:1; min-height:0; display:flex; position:relative; container-type:inline-size; }
  .pg-controller-chat { flex:1; min-width:0; min-height:0; display:flex; flex-direction:column; background:var(--pg-grid),var(--pg-base); }
  .pg-controller-chat-head { display:flex; flex:none; flex-wrap:wrap; align-items:center; gap:10px 14px; box-sizing:border-box; min-height:50px; padding:7px var(--pg-s24); border-bottom:1px solid #161B22; background:rgba(9,11,14,.86); }
  .pg-controller-chat-head h2 { font-weight:600; font-size:14px; margin:0; }
  .pg-controller-chat-head .pg-badge { height:22px; padding:0 8px; border-color:#2E3A1E; background:var(--pg-accent-soft); }
  .pg-controller-chat-head .pg-badge::before { content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }
  .pg-controller-session { font:11px/1.55 var(--pg-font-mono); color:var(--pg-label); }
  .pg-controller-view-switch { display:flex; margin-left:auto; padding:2px; border:1px solid #222833; border-radius:var(--pg-r6); background:var(--pg-control); }
  .pg-controller-view-switch .pg-button { min-height:28px; padding:0 12px; border:0; border-radius:var(--pg-r4); font-size:12.5px; color:var(--pg-muted); }
  .pg-controller-view-switch .pg-button[aria-pressed=true] { background:#1E242D; color:var(--pg-text); }
  .pg-controller-placeholder { margin:auto; max-width:440px; padding:var(--pg-s24); line-height:1.6; }
  .pg-controller-resize { box-sizing:border-box; position:relative; z-index:1; flex:none; width:5px; margin-right:-5px; cursor:col-resize; touch-action:none; }
  .pg-controller-resize:hover { background:var(--pg-hover); }
  .pg-controller-tasks { box-sizing:border-box; flex:none; min-width:0; display:flex; flex-direction:column; border-left:1px solid var(--pg-line); background:#0C0F13; }
  .pg-controller-task-head { display:flex; align-items:center; gap:10px; padding:14px var(--pg-s16) 10px; }
  .pg-controller-tasks h2 { font-size:15px; font-weight:600; margin:0; }
  .pg-controller-task-count { color:var(--pg-label); font:11px/1.5 var(--pg-font-mono); }
  .pg-button.pg-controller-refresh { margin-left:auto; display:grid; place-items:center; width:var(--pg-h30); min-height:var(--pg-h30); padding:0; border-color:#222833; border-radius:var(--pg-r6); color:var(--pg-muted); }
  .pg-controller-task-status { display:flex; align-items:center; flex-wrap:wrap; gap:var(--pg-s8); padding:0 var(--pg-s16) 10px; color:var(--pg-label); font:10.5px/1.5 var(--pg-font-mono); }
  .pg-controller-rule { flex:1; height:1px; background:#1A1F27; }
  .pg-controller-evidence { display:inline-flex; align-items:center; gap:var(--pg-s4); }
  .pg-controller-evidence::before { content:""; box-sizing:border-box; width:8px; height:8px; border:1px solid var(--pg-muted); }
  .pg-controller-evidence[data-evidence=host]::before { background:linear-gradient(135deg,var(--pg-muted) 50%,transparent 50%); }
  .pg-controller-evidence[data-evidence=receipt]::before { background:var(--pg-text); border-color:var(--pg-text); }
  .pg-controller-evidence[data-evidence=none]::before { border:1px dashed var(--pg-label); }
  .pg-controller-task-content { overflow:auto; min-height:0; padding:0 10px 12px; scrollbar-width:thin; scrollbar-color:var(--pg-control-line) transparent; }
  .pg-controller-tasks p { color:var(--pg-muted); font-size:13px; line-height:1.5; }
  .pg-controller-challenge,.pg-controller-maintenance { margin-bottom:6px; }
  .pg-controller-group { display:flex; align-items:center; gap:var(--pg-s8); padding:var(--pg-s8); border-radius:var(--pg-r6); cursor:pointer; }
  .pg-controller-group::-webkit-details-marker,.pg-controller-external-chats > summary::-webkit-details-marker { display:none; }
  .pg-controller-group:hover,.pg-controller-external-chats > summary:hover { background:var(--pg-hover); }
  .pg-controller-group > svg { color:var(--pg-label); flex:none; }
  details[open] > .pg-controller-group > svg { transform:rotate(90deg); }
  .pg-controller-group-label { display:grid; flex:1; min-width:0; font-size:12.5px; font-weight:600; line-height:1.3; }
  .pg-controller-group-label > span,.pg-controller-group-label > small { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pg-controller-group-label > small { color:var(--pg-label); font:10.5px/1.3 var(--pg-font-mono); }
  .pg-controller-maintenance .pg-controller-group-label { color:var(--pg-label); font-weight:400; }
  .pg-controller-group-rows { display:grid; gap:2px; padding:2px 0 6px 18px; }
  .pg-controller-row { display:grid; gap:6px; width:100%; padding:10px 12px; border:1px solid #1A1F27; border-radius:var(--pg-r8); background:var(--pg-control); color:var(--pg-text); text-align:left; font:inherit; cursor:pointer; }
  .pg-controller-row:hover:not(:disabled) { background:var(--pg-hover); }
  .pg-controller-row:disabled { color:var(--pg-label); cursor:default; }
  .pg-controller-row strong { font-size:13.5px; line-height:1.35; font-weight:500; overflow-wrap:anywhere; }
  .pg-controller-row-meta { display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; font-size:11.5px; color:var(--pg-muted); }
  .pg-controller-row-meta .pg-badge { min-height:0; border:0; padding:0; font-size:inherit; }
  .pg-controller-row-meta .pg-badge::before { width:8px; height:8px; }
  .pg-controller-row-time { font:10.5px/1.4 var(--pg-font-mono); color:var(--pg-label); overflow-wrap:anywhere; }
  .pg-controller-back { margin:4px 0; }
  .pg-controller-detail h3 { margin:4px 0; font-size:15px; overflow-wrap:anywhere; }
  .pg-controller-markdown { min-width:0; overflow-wrap:anywhere; line-height:1.55; }
  .pg-controller-markdown pre,.pg-controller-markdown table,.pg-controller-raw pre { max-width:100%; overflow:auto; }
  .pg-controller-raw { margin-top:var(--pg-s16); font-size:12px; }
  .pg-controller-raw pre { white-space:pre-wrap; overflow-wrap:anywhere; font:12px/1.55 var(--pg-font-mono); }
  .pg-controller-error,.pg-controller-tasks .pg-controller-error { color:var(--pg-error); }
  @media (max-width:600px) {
    .pg-controller-bar { gap:4px 8px; padding:4px 8px; }
    .pg-controller-tabs { min-height:36px; }
    .pg-controller-workspace { min-width:0; }
    .pg-controller-chat-head { padding-inline:var(--pg-s12); }
    .pg-controller-tasks { width:min(380px,90%); }
  }
  @container (max-width:720px) {
    .pg-controller-resize { display:none; }
    .pg-controller-tasks { position:absolute; right:0; top:0; bottom:0; max-width:90%; z-index:10; box-shadow:-8px 0 24px rgba(0,0,0,.24); }
  }
`;
