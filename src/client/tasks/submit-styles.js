export const submitCss = `
  .pg-submit-page { height:100%; width:100%; min-width:0; display:flex; flex-direction:column; overflow:auto; background:var(--pg-base); font-size:13px; container-type:inline-size; }
  .pg-submit-page * { box-sizing:border-box; }
  .pg-submit-page :is(h1,h2,h3,p,dl,dd) { margin:0; }
  .pg-submit-page h2 { font-size:15px; font-weight:600; }
  .pg-submit-page small { font-size:11.5px; color:var(--pg-muted); }
  .pg-submit-page :is(button,summary,select,input):focus-visible { outline:2px solid var(--pg-accent); outline-offset:2px; }
  .pg-submit-page .pg-submit-kicker,.pg-submit-page time,.pg-submit-page code { font:11px/1.5 var(--pg-font-mono); color:var(--pg-label); }
  .pg-submit-page time { white-space:nowrap; }
  .pg-submit-page .pg-button { border-radius:6px; padding-inline:12px; }
  .pg-submit-bar { min-height:48px; display:flex; align-items:center; flex-wrap:wrap; gap:8px 16px; padding:6px 20px; background:var(--pg-ink); border-bottom:1px solid #161B22; }
  .pg-submit-tabs { display:flex; padding:2px; gap:2px; border:1px solid #222833; border-radius:6px; background:var(--pg-control); }
  .pg-submit-tabs .pg-button { display:flex; align-items:center; gap:6px; min-height:28px; padding:0 12px; font-size:12.5px; border:0; border-radius:4px; color:var(--pg-muted); }
  .pg-submit-tabs .pg-button[aria-pressed=true] { background:#1E242D; color:var(--pg-text); }
  .pg-submit-account { margin-inline-start:auto; }
  .pg-submit-filters { display:flex; flex-wrap:wrap; gap:16px; margin-inline-start:auto; }
  .pg-submit-filters label { display:flex; align-items:center; padding:0 9px; gap:6px; min-height:32px; border:1px solid var(--pg-control-line); border-radius:6px; background:var(--pg-control); color:var(--pg-muted); }
  .pg-submit-filters select { max-width:145px; width:100%; border:0; font:inherit; color:var(--pg-text); background:var(--pg-control); color-scheme:dark; }
  .pg-submit-filters label:first-child { width:198px; }
  .pg-submit-filters label { white-space:nowrap; }
  .pg-submit-filters label:last-child { width:122px; }
  .pg-submit-task-grid { flex:1; display:grid; grid-template-columns:minmax(215px,300px) minmax(0,1fr) minmax(270px,340px); min-height:0; }
  .pg-submit-rail,.pg-submit-access { min-width:0; background:#0B0D10; overflow:auto; scrollbar-width:thin; }
  .pg-submit-rail { padding:14px 10px; border-inline-end:1px solid #1A1F27; }
  .pg-submit-task { width:100%; display:grid; min-width:0; text-align:start; gap:8px; margin:0 0 7px; padding:11px 12px 13px; border:1px solid transparent; border-radius:8px; background:transparent; font:inherit; color:inherit; cursor:pointer; }
  .pg-submit-task:is(:hover,[aria-pressed=true]) { background:var(--pg-hover); border-color:var(--pg-control-line); }
  .pg-submit-task strong { font-size:13.5px; font-weight:500; overflow-wrap:anywhere; }
  .pg-submit-ticks { display:grid; grid-template-columns:repeat(6,1fr); gap:3px; }
  .pg-submit-ticks i { display:block; height:4px; border-radius:1px; background:var(--pg-control-line); }
  .pg-submit-ticks i[data-stage=done] { background:var(--pg-accent); }
  .pg-submit-ticks i[data-stage=current] { background:var(--pg-warning); }
  .pg-submit-rail-meta { display:flex; justify-content:space-between; gap:8px; font-size:11.5px; color:var(--pg-muted); }
  .pg-submit-rail-meta [data-tone=warning] { color:var(--pg-warning); }
  .pg-submit-rail-meta [data-tone=active] { color:var(--pg-accent); }
  .pg-submit-rail-meta [data-tone=evaluating] { color:var(--pg-info); }
  .pg-submit-rail-meta small { font:10px/1.5 var(--pg-font-mono); color:var(--pg-label); text-align:end; }
  .pg-submit-rail .pg-archived-toggle { padding:6px 12px; background:none; border:0; color:var(--pg-label); font:inherit; cursor:pointer; }
  .pg-submit-rail .pg-archived-row { display:flex; justify-content:space-between; align-items:center; min-width:0; gap:8px; padding:6px; }
  .pg-submit-rail .pg-task-row-open { color:var(--pg-text); background:var(--pg-panel); border:1px solid var(--pg-line); border-radius:6px; cursor:pointer; }
  .pg-submit-task-detail { min-width:0; overflow:auto; scrollbar-width:thin; }
  .pg-submit-task-inner { max-width:860px; padding:22px 28px 40px; margin:auto; display:grid; gap:20px; }
  .pg-submit-task-header { display:flex; justify-content:space-between; align-items:start; gap:8px 16px; flex-wrap:wrap; }
  .pg-submit-task-header h1 { margin:7px 0 5px; font-size:24px; font-weight:600; letter-spacing:-.015em; overflow-wrap:anywhere; }
  .pg-submit-task-header p { color:var(--pg-muted); font-size:12.5px; overflow-wrap:anywhere; }
  .pg-submit-task-actions { display:flex; align-items:start; gap:8px; flex-wrap:wrap; }
  .pg-submit-task-actions .pg-archive { margin:0; display:grid; }
  .pg-submit-lifecycle { position:relative; padding:18px 18px 18px; border:1px solid #222833; border-radius:12px; background:var(--pg-panel); }
  .pg-submit-lifecycle::before,.pg-submit-lifecycle::after { position:absolute; content:''; width:12px; height:12px; border:solid var(--pg-accent); pointer-events:none; }
  .pg-submit-lifecycle::before { inset:-1px auto auto -1px; border-width:2px 0 0 2px; border-top-left-radius:12px; }
  .pg-submit-lifecycle::after { inset:auto -1px -1px auto; border-width:0 2px 2px 0; border-bottom-right-radius:12px; }
  .pg-submit-lifecycle header { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
  .pg-submit-lifecycle header div { display:flex; gap:14px; flex-wrap:wrap; color:var(--pg-muted); font-size:11px; }
  .pg-submit-lifecycle [data-source]::before { content:''; display:inline-block; width:8px; height:8px; border:1px solid currentColor; margin-inline-end:5px; }
  .pg-submit-lifecycle [data-source=host]::before { background:linear-gradient(135deg, currentColor 50%, transparent 50%); }
  .pg-submit-lifecycle [data-source=platform]::before { background:currentColor; }
  .pg-submit-lifecycle ol { display:grid; grid-template-columns:repeat(6,minmax(104px,1fr)); margin:0; padding:0; overflow:auto; list-style:none; }
  .pg-submit-lifecycle li { display:grid; gap:8px; color:var(--pg-text); }
  .pg-submit-lifecycle li[data-stage=pending] { color:var(--pg-label); }
  .pg-submit-lifecycle li[data-stage=current] { color:var(--pg-warning); }
  .pg-submit-lifecycle li strong { font-weight:500; }
  .pg-submit-lifecycle li small { color:var(--pg-label); font-size:11px; }
  .pg-submit-node { display:flex; align-items:center; }
  .pg-submit-node span { display:grid; place-items:center; width:22px; height:22px; flex:none; border:1px solid currentColor; border-radius:50%; color:var(--pg-accent); font:10px var(--pg-font-mono); }
  [data-stage=current] > .pg-submit-node span { color:var(--pg-warning); }
  [data-stage=pending] > .pg-submit-node span { color:var(--pg-label); border-style:dashed; }
  .pg-submit-lifecycle li:not(:last-child) .pg-submit-node::after { content:''; flex:1; height:2px; margin:0 6px; background:var(--pg-accent); }
  .pg-submit-lifecycle li[data-stage=current] .pg-submit-node::after,.pg-submit-lifecycle li[data-stage=pending] .pg-submit-node::after { background:repeating-linear-gradient(90deg,var(--pg-line-strong) 0 4px,transparent 4px 8px); }
  .pg-submit-risk { display:grid; gap:14px; padding:18px; border:1px solid #4A3A1A; border-radius:12px; background:#120F09; color:#E8D7BC; }
  .pg-submit-risk header { display:flex; gap:12px; }
  .pg-submit-risk header small { display:block; margin-top:3px; }
  .pg-submit-risk header > span { color:var(--pg-warning); font-size:20px; line-height:1.2; }
  .pg-submit-risk h2 { color:#FFD9A0; font-size:16px; margin-bottom:4px; }
  .pg-submit-risk p { font-size:13.5px; }
  .pg-submit-risk small,.pg-submit-risk dt { color:#B9A27F; }
  .pg-submit-risk dl { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1px; border:1px solid #2F2614; border-radius:8px; background:#2F2614; overflow:hidden; }
  .pg-submit-risk dl div { display:grid; gap:4px; background:#15110A; padding:11px 12px; }
  .pg-submit-risk dd { font:18px/1.3 var(--pg-font-mono); color:var(--pg-text); }
  .pg-submit-risk dt { font-size:11px; }
  .pg-submit-references { border:1px solid var(--pg-line); border-radius:8px; }
  .pg-submit-risk .pg-submit-references { border-color:#2F2614; }
  .pg-submit-references summary { padding:10px 12px; cursor:pointer; }
  .pg-submit-references summary small { margin-inline-start:12px; }
  .pg-submit-references > div { padding:4px 12px 12px; display:grid; grid-template-columns:repeat(auto-fit,minmax(185px,1fr)); gap:8px; }
  .pg-submit-references label { display:grid; gap:4px; }
  .pg-submit-references input { min-width:0; }
  .pg-submit-risk-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .pg-submit-risk-actions small { flex:1 1 220px; }
  .pg-submit-risk-actions .pg-button { min-height:38px; padding-inline:14px; border-color:#3A2F18; }
  .pg-submit-risk-actions .pg-risk { padding-inline:16px; }
  .pg-submit-link { padding:0; background:none; border:0; color:var(--pg-accent); cursor:pointer; font:inherit; }
  .pg-submit-link:hover { text-decoration:underline; }
  .pg-submit-task-history { display:grid; gap:10px; }
  .pg-submit-task-history header,.pg-submit-table-card header { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
  .pg-submit-task-history header small,.pg-submit-table-card header small { color:var(--pg-label); }
  .pg-submit-task-history header button,.pg-submit-table-card header .pg-submit-kicker { margin-inline-start:auto; }
  .pg-submit-history-row { display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding:12px 14px; min-height:54px; border:1px solid var(--pg-line); border-radius:10px; background:var(--pg-panel); }
  .pg-submit-history-row > span:not(.pg-submit-status) { color:var(--pg-muted); font-size:12px; }
  .pg-submit-history-row time { margin-inline-start:auto; }
  .pg-submit-history-row strong { font:500 18px var(--pg-font-mono); }
  .pg-submit-history-row button { color:var(--pg-text); font:12.5px var(--pg-font-mono); }
  .pg-submit-access { display:flex; flex-direction:column; gap:14px; padding:18px 16px; border-inline-start:1px solid #1A1F27; }
  .pg-submit-access header { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .pg-submit-access header h2 { display:flex; align-items:center; gap:10px; }
  .pg-submit-lock { display:inline-block; position:relative; width:11px; height:8px; border:1.5px solid currentColor; border-radius:2px; margin-top:3px; }
  .pg-submit-lock::before { content:''; position:absolute; width:7px; height:6px; inset:-6px 0 auto 0; margin:auto; border:1.5px solid currentColor; border-bottom:0; border-radius:6px 6px 0 0; }
  .pg-submit-access p { font-size:12px; color:var(--pg-muted); }
  .pg-submit-access-card,.pg-submit-grants { display:grid; gap:10px; }
  .pg-submit-access-card { padding:13px; border:1px solid #2A313C; border-radius:10px; background:var(--pg-control); }
  .pg-submit-access-card > button,.pg-submit-access > button,.pg-submit-grants > button { justify-self:start; align-self:start; }
  .pg-submit-pending { padding:1px 6px; border-radius:3px; background:var(--pg-warning); color:var(--pg-ink); font:11px/1.5 var(--pg-font-mono); }
  .pg-submit-path { display:grid; gap:4px; padding:9px 10px; border:1px solid var(--pg-line); border-radius:6px; background:var(--pg-ink); }
  .pg-submit-path code { color:var(--pg-text); font-size:12px; overflow-wrap:anywhere; }
  .pg-submit-path small { color:var(--pg-label); }
  .pg-submit-access fieldset { display:grid; gap:6px; margin:0; padding:0; border:0; }
  .pg-submit-access legend { color:var(--pg-muted); font-size:12px; padding:0 0 6px; }
  .pg-submit-radio { display:flex; align-items:flex-start; gap:9px; padding:9px; border:1px solid var(--pg-line); border-radius:8px; }
  .pg-submit-radio[data-selected=true] { background:var(--pg-accent-soft); border-color:#657D27; }
  .pg-submit-radio small { display:block; color:var(--pg-label); }
  .pg-submit-page input:is([type=radio],[type=checkbox]) { accent-color:var(--pg-accent); }
  .pg-submit-recursive { font-size:11px; color:var(--pg-muted); }
  .pg-submit-revoke { color:var(--pg-error); font-size:12px; }
  .pg-submit-access footer { margin-top:auto; padding-top:12px; border-top:1px solid #1A1F27; }
  .pg-submit-access footer > div { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:6px; }
  .pg-submit-access footer button { font-size:11px; }
  .pg-submit-access footer small { color:var(--pg-label); }
  .pg-submit-empty { padding:24px; }

  .pg-submit-scoring { width:100%; max-width:1440px; margin:0 auto; padding:20px clamp(18px,4.45cqw,64px) 40px; overflow:auto; scrollbar-width:thin; }
  .pg-submit-totals { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border:1px solid var(--pg-line); border-radius:12px; background:var(--pg-panel); }
  .pg-submit-totals > div { display:grid; gap:3px; padding:16px 18px; min-height:108px; align-content:center; }
  .pg-submit-totals > div + div { border-inline-start:1px solid var(--pg-line); }
  .pg-submit-totals dt { font-size:11px; color:var(--pg-label); }
  .pg-submit-totals dd { font:30px/1.12 var(--pg-font-mono); }
  .pg-submit-totals > div:last-child dd { color:var(--pg-warning); }
  .pg-submit-scoring-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(295px,400px); gap:18px; align-items:start; margin-top:18px; }
  .pg-submit-table-card,.pg-submit-scorecard { min-width:0; border:1px solid var(--pg-line); border-radius:12px; background:var(--pg-panel); overflow:hidden; }
  .pg-submit-table-card header { padding:12px 16px; border-bottom:1px solid #161B22; }
  .pg-submit-table-card header .pg-submit-kicker { white-space:nowrap; }
  .pg-submit-table-card > p { padding:8px 16px; }
  .pg-submit-table-scroll { overflow:auto; scrollbar-width:thin; }
  .pg-submit-table-card table { width:100%; border-collapse:collapse; min-width:650px; }
  .pg-submit-table-card :is(td,th) { padding:0 8px; text-align:start; }
  .pg-submit-table-card :is(td,th):first-child { padding-inline-start:16px; width:42px; white-space:nowrap; }
  .pg-submit-table-card :is(td,th):last-child { padding-inline-end:16px; text-align:end; }
  .pg-submit-table-card :is(td,th):nth-child(2) { min-width:82px; }
  .pg-submit-table-card :is(td,th):nth-child(4) { min-width:183px; }
  .pg-submit-table-card th { height:36px; color:var(--pg-label); font-size:11px; font-weight:400; }
  .pg-submit-table-card td { height:48px; border-bottom:1px solid #161B22; overflow-wrap:anywhere; }
  .pg-submit-table-card td:nth-child(5) { font-size:12px; color:var(--pg-muted); }
  .pg-submit-table-card td:last-child { font:16px var(--pg-font-mono); }
  .pg-submit-reference-score { color:var(--pg-info); }
  .pg-submit-table-card td input { appearance:none; display:grid; place-items:center; width:18px; height:18px; margin:0; border:1px solid #495568; border-radius:4px; cursor:pointer; }
  .pg-submit-table-card td input:checked { background:var(--pg-accent); border-color:var(--pg-accent); color:var(--pg-ink); }
  .pg-submit-table-card td input:checked::after { content:'✓'; font-size:11px; }
  .pg-submit-table-card td button { color:var(--pg-text); font:12.5px var(--pg-font-mono); }
  .pg-submit-table-card tr[data-selected=true] { background:var(--pg-hover); }
  .pg-submit-table-card tr[data-selected=true] td button { color:var(--pg-accent); }
  .pg-submit-status[data-shape=striped]::before { border:1px solid currentColor; border-radius:2px; background:repeating-linear-gradient(135deg,currentColor 0 1px,transparent 1px 3px); }
  .pg-submit-table-card .pg-submit-status { border:0; padding:0; }
  .pg-submit-table-card footer { padding:12px; text-align:center; }
  .pg-submit-scorecard { padding:16px 18px 18px; }
  .pg-submit-scorecard header { display:flex; justify-content:space-between; align-items:start; gap:12px; }
  .pg-submit-scorecard header > div:last-child { display:grid; text-align:end; }
  .pg-submit-scorecard header strong { font:40px/1.1 var(--pg-font-mono); letter-spacing:-.03em; }
  .pg-submit-compared { display:flex; flex-wrap:wrap; gap:8px 12px; padding:11px 12px; margin:14px 0; border:1px solid #222833; border-radius:8px; background:var(--pg-ink); font:12px var(--pg-font-mono); }
  .pg-submit-compared span::before { content:''; display:inline-block; width:10px; height:4px; margin-inline-end:5px; background:var(--pg-accent); vertical-align:middle; }
  .pg-submit-compared span:nth-child(2) { color:var(--pg-muted); }
  .pg-submit-compared span:nth-child(2)::before { background:var(--pg-label); }
  .pg-submit-compared strong { margin-inline-start:auto; color:var(--pg-accent); font-weight:500; }
  .pg-submit-scorecard dl { margin-top:14px; padding-top:12px; border-top:1px solid #161B22; display:grid; gap:5px; }
  .pg-submit-scorecard dl > div { display:grid; grid-template-columns:80px minmax(0,1fr); gap:12px; }
  .pg-submit-scorecard dt { color:var(--pg-label); }
  .pg-submit-scorecard dd { overflow-wrap:anywhere; }
  .pg-submit-dimensions { list-style:none; padding:0; display:grid; gap:7px; }
  .pg-submit-dimensions li { display:grid; grid-template-columns:minmax(80px,1fr) 2fr auto; gap:12px; align-items:center; }
  .pg-submit-dimensions meter { width:100%; accent-color:var(--pg-accent); }
  .pg-submit-dimensions strong { grid-column:3; }
  @container (max-width:1120px) {
    .pg-submit-task-grid { grid-template-columns:215px minmax(0,1fr) 270px; }
    .pg-submit-task-inner { padding-inline:18px; }
    .pg-submit-scoring-grid { grid-template-columns:minmax(0,1fr) minmax(270px,32%); }
  }
  @container (max-width:900px) {
    .pg-submit-task-grid { grid-template-columns:200px minmax(0,1fr); min-height:max-content; }
    .pg-submit-access { grid-column:2; border-top:1px solid var(--pg-line); }
    .pg-submit-rail { grid-row:span 2; }
    .pg-submit-scoring-grid { grid-template-columns:minmax(0,1fr); }
  }
  @container (max-width:620px) {
    .pg-submit-task-grid { grid-template-columns:minmax(0,1fr); }
    .pg-submit-rail { grid-row:auto; border-bottom:1px solid var(--pg-line); }
    .pg-submit-access { grid-column:auto; }
    .pg-submit-totals { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .pg-submit-totals > div:nth-child(n+3) { border-top:1px solid var(--pg-line); }
  }
`;
