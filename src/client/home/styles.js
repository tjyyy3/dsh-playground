export const homeCss = `
  .pg-home { flex:1; min-width:0; overflow:auto; padding:20px clamp(16px,3.25cqw,48px) 36px; scrollbar-width:thin; }
  .pg-home h1,.pg-home h2,.pg-home h3,.pg-home dl,.pg-home p { margin:0; }
  .pg-home h2 { font-size:16px; font-weight:650; }
  .pg-home h3 { font-size:14px; font-weight:600; }
  .pg-home-top { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(330px,1fr); gap:var(--pg-s16); }
  .pg-home-hero,.pg-home-work,.pg-home-lists > section,.pg-home-contest { min-width:0; border:1px solid var(--pg-control-line); border-radius:var(--pg-r8); background:var(--pg-control); }
  .pg-home-hero { display:flex; flex-direction:column; align-items:flex-start; justify-content:center; padding:clamp(18px,1.9cqw,25px); background:var(--pg-grid),var(--pg-base); }
  .pg-home-kicker { color:var(--pg-label); font:11px/1.5 var(--pg-font-mono); letter-spacing:.14em; }
  .pg-home-hero h1 { margin-top:10px; font-size:clamp(26px,3.15cqw,46px); line-height:1.15; letter-spacing:-.035em; }
  .pg-home .pg-home-tagline { margin-top:8px; color:var(--pg-muted); font-size:clamp(14px,1.45cqw,20px); line-height:1.45; }
  .pg-home-actions { display:flex; gap:var(--pg-s8); flex-wrap:wrap; margin-top:var(--pg-s16); }
  .pg-home .pg-home-stats { width:100%; display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; border-top:1px solid var(--pg-control-line); padding-top:var(--pg-s16); margin-top:var(--pg-s24); }
  .pg-home-stats > div { display:flex; flex-direction:column-reverse; gap:3px; }
  .pg-home-stats dt,.pg-home-work-facts dt { color:var(--pg-muted); font-size:12px; }
  .pg-home-stats dd { color:var(--pg-text); margin:0; font:600 clamp(13px,1.82cqw,26px)/1.15 var(--pg-font-mono); overflow-wrap:anywhere; }
  .pg-home-work { padding:var(--pg-s16); }
  .pg-home-work > h2 { border-bottom:1px solid var(--pg-control-line); padding-bottom:10px; margin-bottom:10px; }
  .pg-home-work-facts { display:grid; }
  .pg-home-work-facts > div { display:flex; justify-content:space-between; align-items:center; gap:10px; min-height:30px; }
  .pg-home-work-facts dd { margin:0; text-align:right; font:12px/1.45 var(--pg-font-mono); overflow-wrap:anywhere; }
  .pg-home-ready::before,.pg-home-contest-meta [data-status]::before { content:''; display:inline-block; width:7px; height:7px; margin-right:6px; border:1px solid currentColor; border-radius:50%; }
  .pg-home-ready::before { color:var(--pg-info); background:currentColor; }
  .pg-home-readiness,.pg-home-contest-list,.pg-home-lists ul { margin:0; padding:0; list-style:none; }
  .pg-home-readiness { display:grid; gap:3px; margin-top:6px; }
  .pg-home-readiness li { display:grid; grid-template-columns:22px minmax(0,1fr) auto auto; align-items:center; gap:7px; min-height:38px; border-radius:var(--pg-r4); padding:3px 4px; }
  .pg-home-readiness li[data-state=next] { background:var(--pg-hover); }
  .pg-home-step { display:grid; place-items:center; width:20px; height:20px; border:1px dashed var(--pg-label); border-radius:50%; color:var(--pg-muted); font:10px var(--pg-font-mono); }
  .pg-home-readiness [data-state=done] .pg-home-step { color:var(--pg-accent); border-style:solid; }
  .pg-home-readiness [data-state=next] .pg-home-step { border-style:solid; color:var(--pg-text); }
  .pg-home-readiness strong { font-weight:550; font-size:12px; }
  .pg-home-readiness small { display:block; color:var(--pg-label); font-size:11px; }
  .pg-home-step-status { color:var(--pg-muted); font-size:10px; white-space:nowrap; }
  .pg-home-readiness .pg-button { min-height:26px; padding:0 6px; font-size:11px; }
  .pg-home-section-head { display:flex; align-items:center; gap:var(--pg-s12); margin-bottom:var(--pg-s8); }
  .pg-home-section-head small { color:var(--pg-label); font:11px var(--pg-font-mono); }
  .pg-home-section-head button { margin-inline-start:auto; }
  .pg-home-competitions,.pg-home-lists { margin-top:var(--pg-s16); }
  .pg-home-contest-list { display:grid; grid-auto-flow:column; grid-auto-columns:max(226px,calc((100% - 24px) / 3)); gap:var(--pg-s12); overflow-x:auto; padding-bottom:3px; scrollbar-width:thin; }
  .pg-home-contest { display:grid; grid-template-rows:auto 1fr; align-items:start; gap:8px; padding:var(--pg-s12) var(--pg-s16); }
  .pg-home-contest h3 { overflow-wrap:anywhere; }
  .pg-home-contest-meta { display:flex; flex-wrap:wrap; gap:5px 12px; align-items:center; font:11px/1.4 var(--pg-font-mono); color:var(--pg-muted); }
  .pg-home-contest-meta [data-status=live] { color:var(--pg-accent); }
  .pg-home-contest-meta [data-status=live]::before { background:currentColor; }
  .pg-home-contest-progress { appearance:none; width:min(180px,100%); height:3px; border:0; border-radius:3px; background:var(--pg-control-line); }
  .pg-home-contest-progress::-webkit-progress-bar { border-radius:3px; background:var(--pg-control-line); }
  .pg-home-contest-progress::-webkit-progress-value { border-radius:3px; background:var(--pg-accent); }
  .pg-home-contest-progress::-moz-progress-bar { border-radius:3px; background:var(--pg-accent); }
  .pg-home-contest .pg-button { justify-self:start; align-self:end; min-height:28px; }
  .pg-home-lists { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(0,1fr); gap:var(--pg-s16); }
  .pg-home-lists > section { padding:var(--pg-s12) var(--pg-s16); }
  .pg-home-lists h2 { padding:1px 0 var(--pg-s8); }
  .pg-home-lists li { display:flex; justify-content:space-between; align-items:baseline; gap:var(--pg-s12); border-top:1px solid var(--pg-line); padding:6px 0; font-size:13px; }
  .pg-home-lists li > :first-child { min-width:0; overflow-wrap:anywhere; }
  .pg-home-lists li > :only-child { flex:1; }
  .pg-home-latest button { padding:0; border:0; background:none; color:var(--pg-text); text-align:start; font:inherit; cursor:pointer; }
  .pg-home-latest button:hover { color:var(--pg-info); text-decoration:underline; }
  .pg-home-latest span,.pg-home-feed time { flex:none; color:var(--pg-label); font:11px/1.4 var(--pg-font-mono); }
  .pg-home-feed li > span { color:var(--pg-muted); }
  @container (max-width:820px) { .pg-home-top { grid-template-columns:minmax(0,1fr); } }
  @container (max-width:620px) { .pg-home-lists { grid-auto-flow:row; } }
  @container (max-width:345px) { .pg-home-step-status { display:none; } }
`;
