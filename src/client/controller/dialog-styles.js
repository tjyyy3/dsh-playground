export const controllerDialogCss = `
  .pg-task-modal.pg-controller-dialog {
    --pg-dialog-bg:#0E1115; --pg-dialog-card:#0B0E12; --pg-dialog-rule:#1A1F27; --pg-dialog-selected:#6E8A2A;
    display:flex; flex-direction:column; width:min(var(--pg-dialog-width),calc(100dvw - 32px)); max-width:none;
    max-height:calc(100dvh - var(--pg-dialog-inset)); padding:0; border:1px solid #2A313C; border-radius:var(--pg-r14);
    background:var(--pg-dialog-bg); box-shadow:0 40px 100px rgba(0,0,0,.6); line-height:1.55;
    font-family:var(--pg-font-title);
  }
  .pg-controller-dialog .pg-task-header {
    display:flex; align-items:center; justify-content:space-between; gap:12px; padding:18px 22px;
    border-bottom:1px solid var(--pg-dialog-rule);
  }
  .pg-controller-dialog .pg-task-header h2 { min-width:0; margin:0; padding:0; font-size:19px; line-height:1.55; letter-spacing:normal; overflow-wrap:anywhere }
  .pg-controller-dialog .pg-task-close {
    position:static; flex:none; width:34px; height:34px; border:1px solid var(--pg-control-line);
    border-radius:var(--pg-r8); background:transparent; color:var(--pg-muted);
  }
  .pg-controller-dialog .pg-task-close svg { width:13px; height:13px; stroke-width:1.5 }
  .pg-controller-dialog .pg-task-body { display:flex; flex:1 1 auto; flex-direction:column; min-height:0; gap:18px; padding:18px 22px }
  .pg-controller-dialog .pg-task-body > * { flex-shrink:0 }
  .pg-controller-dialog .pg-task-footer {
    display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:14px 22px;
    border-color:var(--pg-dialog-rule); background:var(--pg-dialog-card); border-radius:0 0 var(--pg-r14) var(--pg-r14);
  }
  .pg-controller-dialog .pg-task-button {
    min-width:0; height:auto; min-height:38px; padding:6px 14px; border-color:var(--pg-line-strong);
    background:transparent; font-size:13px; font-weight:400; white-space:normal; text-align:center; text-decoration:none;
  }
  .pg-controller-dialog .pg-task-button:hover:not(:disabled), .pg-controller-dialog .pg-task-close:hover:not(:disabled) {
    background:#1B2028; border-color:#353D4A; color:var(--pg-text);
  }
  .pg-controller-dialog .pg-task-create {
    padding-inline:16px; border-color:transparent; background:var(--pg-accent); color:var(--pg-ink); font-weight:600;
  }
  .pg-controller-dialog .pg-task-create:hover:not(:disabled) { background:var(--pg-accent-hover); border-color:transparent; color:var(--pg-ink) }
  .pg-controller-dialog .pg-task-create:disabled:not([data-busy=true]) { background:var(--pg-hover); color:var(--pg-label) }
  .pg-controller-dialog a:focus-visible { outline:2px solid var(--pg-accent); outline-offset:2px }
  .pg-controller-dialog h2[data-modal-autofocus]:focus { outline:none }
  .pg-dialog-label { font:10.5px/1.55 var(--pg-font-mono); letter-spacing:.1em; color:var(--pg-label) }
  .pg-controller-dialog [data-tone=ready] { color:var(--pg-accent) }
  .pg-controller-dialog [data-tone=warning] { color:var(--pg-warning) }
  .pg-controller-dialog [data-tone=error] { color:var(--pg-error) }
  .pg-controller-dialog [data-tone=muted] { color:var(--pg-muted) }
  @media(max-width:600px) {
    .pg-task-modal.pg-controller-dialog { --pg-dialog-inset:32px }
    .pg-controller-dialog :is(.pg-task-header,.pg-task-body,.pg-task-footer) { padding-inline:16px }
  }
`;

export const handoffCss = `
  .pg-controller-dialog.pg-handoff-dialog { --pg-dialog-width:620px; --pg-dialog-inset:48px }
  .pg-handoff-dialog .pg-handoff-section { display:flex; min-width:0; flex-direction:column; gap:8px; margin:0; padding:0; border:0 }
  .pg-handoff-dialog legend { padding:0 0 8px }
  .pg-handoff-target,.pg-handoff-option {
    display:flex; align-items:center; gap:14px; padding:12px 14px;
    border:1px solid var(--pg-line); border-radius:var(--pg-r10); background:var(--pg-dialog-card); line-height:1.35;
  }
  .pg-handoff-icon {
    flex:none; display:grid; place-items:center; width:36px; height:36px; border:1px solid #2E3A1E;
    border-radius:var(--pg-r8); background:var(--pg-accent-soft); color:var(--pg-accent);
  }
  .pg-handoff-icon svg { width:16px; height:16px; stroke-width:1.3 }
  .pg-handoff-target div { min-width:0; overflow-wrap:anywhere }
  .pg-handoff-target h3 { margin:0; font-size:15px; font-weight:600 }
  .pg-handoff-target p,.pg-handoff-path { margin:0; color:var(--pg-label); font:11.5px/1.35 var(--pg-font-mono) }
  .pg-handoff-option { align-items:flex-start; gap:12px; cursor:pointer }
  .pg-handoff-option:hover:not(:has(:disabled)) { border-color:#353D4A }
  .pg-handoff-option[data-selected=true],.pg-handoff-option[data-selected=true]:hover { border-color:var(--pg-dialog-selected); background:#10140B }
  .pg-handoff-option:has(:disabled) { cursor:default }
  .pg-handoff-option input { position:absolute; width:1px; height:1px; padding:0; margin:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap }
  .pg-handoff-option input:focus-visible + span { outline:2px solid var(--pg-accent); outline-offset:3px }
  .pg-handoff-radio { display:grid; place-items:center; flex:none; width:16px; height:16px; margin-top:3px; border:1.5px solid #4A5361; border-radius:50% }
  .pg-handoff-option[data-selected=true] .pg-handoff-radio { border-color:var(--pg-accent) }
  .pg-handoff-option[data-selected=true] .pg-handoff-radio::after { content:""; width:8px; height:8px; background:var(--pg-accent); border-radius:50% }
  .pg-handoff-option-body { display:flex; flex-direction:column; min-width:0; gap:3px }
  .pg-handoff-workspace { display:flex; align-items:baseline; flex-wrap:wrap; gap:2px 8px; font-weight:500; overflow-wrap:anywhere }
  .pg-handoff-path { font-size:11px }
  .pg-handoff-status { display:flex; gap:6px; font-size:12px; overflow-wrap:anywhere }
  .pg-handoff-status::before { content:""; flex:none; width:6px; height:6px; margin-top:5px; border-radius:50%; background:currentColor }
  .pg-handoff-dialog .pg-task-add {
    width:100%; height:40px; margin:0; padding:0 14px; border:1px dashed var(--pg-line-strong);
    border-radius:var(--pg-r10); background:transparent; font-size:13px;
  }
  .pg-handoff-dialog .pg-task-add svg { width:14px; height:14px }
  .pg-handoff-checks { border:1px solid var(--pg-line); border-radius:var(--pg-r10); background:#0A0D10; overflow:hidden }
  .pg-handoff-checks ol { margin:0; padding:0; list-style:none; counter-reset:pg-handoff-check }
  .pg-handoff-checks li {
    display:flex; align-items:baseline; gap:12px; padding:9px 14px; border-bottom:1px solid #13171D;
    color:#D3D9E1; font-size:12.5px; counter-increment:pg-handoff-check;
  }
  .pg-handoff-checks li::before { content:counter(pg-handoff-check,decimal-leading-zero); color:var(--pg-label) }
  .pg-handoff-checks li::before,.pg-handoff-checks li strong { font:11px/1.55 var(--pg-font-mono) }
  .pg-handoff-checks li strong { flex:1; text-align:right; overflow-wrap:anywhere }
  .pg-handoff-checks p { margin:0; padding:12px 14px; font-size:13px; overflow-wrap:anywhere }
  .pg-handoff-codex { display:flex; align-items:flex-start; gap:10px; margin:0; color:var(--pg-muted); font-size:12.5px }
  .pg-handoff-codex svg { width:15px; height:15px; margin-top:2px }
  .pg-handoff-dialog .pg-task-footer p { flex:1 1 200px; margin:0; color:var(--pg-label) }
`;

export const noticeCss = `
  .pg-controller-dialog.pg-contest-notice { --pg-dialog-width:840px; --pg-dialog-inset:64px }
  .pg-contest-notice .pg-task-header { align-items:flex-start; gap:16px; padding-block:20px 16px }
  .pg-notice-heading { display:flex; flex-direction:column; gap:6px; min-width:0 }
  .pg-contest-notice .pg-task-header h2 { font-size:22px; letter-spacing:-.01em }
  .pg-contest-notice .pg-task-header p { margin:0; color:var(--pg-muted); font-size:13px }
  .pg-contest-notice .pg-task-close { width:36px; height:36px }
  .pg-contest-notice .pg-task-body { padding-block:16px; gap:12px; overscroll-behavior:contain }
  .pg-notice-entry {
    display:flex; flex-direction:column; gap:14px; min-width:0; padding:16px;
    border:1px solid var(--pg-line); border-radius:var(--pg-r10); background:var(--pg-dialog-card); overflow-wrap:anywhere;
  }
  .pg-notice-entry-header,.pg-notice-entry-actions,.pg-notice-groups { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px }
  .pg-notice-entry h3 { flex:1 1 auto; min-width:0; font-size:17px; font-weight:600; margin:0 }
  .pg-notice-badge { padding:2px 7px; border-radius:var(--pg-r4); background:var(--pg-control-line); font:10.5px/1.55 var(--pg-font-mono); letter-spacing:.06em }
  .pg-notice-badge[data-kind=period] { background:var(--pg-accent); color:var(--pg-ink) }
  .pg-notice-badge[data-kind=competition] { background:var(--pg-info); color:var(--pg-ink) }
  .pg-notice-live { display:inline-flex; align-items:center; gap:6px; margin-inline-start:auto; font-size:12px; color:var(--pg-accent) }
  .pg-notice-live::before { content:""; width:7px; height:7px; border-radius:50%; background:currentColor; animation:pg-notice-pulse 1.8s ease-out infinite }
  @keyframes pg-notice-pulse { from { box-shadow:0 0 0 0 rgba(198,242,78,.55) } 70%,to { box-shadow:0 0 0 6px transparent } }
  @media(prefers-reduced-motion:reduce) { .pg-notice-live::before { animation:none } }
  .pg-notice-schedule { display:grid; gap:6px }
  .pg-notice-track { position:relative; height:6px; border-radius:3px; background:var(--pg-dialog-rule) }
  .pg-notice-track span { display:block; height:100%; margin:0; border-radius:inherit; background:var(--pg-accent) }
  .pg-notice-track span::after { content:""; position:absolute; top:-4px; left:clamp(0px,var(--pg-notice-progress),calc(100% - 2px)); width:2px; height:14px; background:var(--pg-text) }
  .pg-notice-times { display:flex; flex-wrap:wrap; justify-content:space-between; gap:4px 16px; font:11.5px/1.55 var(--pg-font-mono); color:var(--pg-muted) }
  .pg-notice-remaining { color:var(--pg-text) }
  .pg-notice-entry dl { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr)); gap:10px 16px; margin:0; font-size:12.5px }
  .pg-notice-entry dl > div { display:grid; align-content:start; gap:2px; min-width:0 }
  .pg-notice-entry dt { color:var(--pg-label); font-size:11.5px }
  .pg-notice-entry dd { margin:0; white-space:pre-line }
  .pg-notice-entry :is(p,dd[data-field=reward]) { color:var(--pg-muted) }
  .pg-notice-entry p { margin:0; font-size:12.5px; white-space:pre-line }
  .pg-notice-groups { gap:6px; margin:0; padding:0; list-style:none }
  .pg-notice-groups li { display:inline-flex; align-items:center; min-height:24px; padding:0 8px; border:1px solid #222833; border-radius:var(--pg-r4); color:var(--pg-muted); font-size:12px }
  .pg-notice-entry-actions { gap:8px; padding-top:12px; border-top:1px solid #161B22 }
  .pg-notice-entry-actions span { color:var(--pg-label); font-size:12px }
  .pg-contest-notice .pg-task-button { min-height:36px; border-radius:var(--pg-r6) }
  .pg-contest-notice .pg-notice-coordinate { border-color:var(--pg-dialog-selected); background:var(--pg-accent-soft); color:var(--pg-accent); font-weight:600 }
  .pg-contest-notice .pg-notice-coordinate:hover:not(:disabled) { background:#1A2210; border-color:var(--pg-dialog-selected); color:var(--pg-accent) }
  .pg-contest-notice .pg-notice-coordinate svg { width:13px; height:13px; stroke-width:1.5 }
  .pg-contest-notice .pg-task-footer { gap:10px 12px }
  .pg-contest-notice .pg-task-footer p { flex-basis:100%; margin:0; color:var(--pg-label); font-size:11.5px; line-height:1.55 }
  .pg-notice-disable { min-height:36px; padding:0 4px; margin-inline-end:auto; border:0; background:transparent; color:var(--pg-muted); font:inherit; font-size:12.5px; cursor:pointer }
  .pg-notice-disable:hover { color:var(--pg-text); text-decoration:underline }
  .pg-contest-notice .pg-notice-ack { padding-inline:16px; border-color:var(--pg-text); background:var(--pg-text); color:var(--pg-ink); font-weight:600 }
  .pg-contest-notice .pg-notice-ack:hover:not(:disabled) { border-color:#fff; background:#fff; color:var(--pg-ink) }
`;
