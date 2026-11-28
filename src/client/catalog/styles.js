const catalogCss = `
  .pg-workbench.pg-workbench-catalog{padding:0;overflow:hidden}
  .pg-workbench-catalog .pg-workbench-inner,.pg-workbench-catalog .pg-workbench-grid,.pg-workbench-catalog .pg-workbench-column{height:100%;max-width:none;margin:0;min-height:0}
  .pg-workbench-catalog .pg-workbench-grid{align-items:stretch}
  .pg-workbench .pg-guide.pg-catalog{container-type:inline-size;display:grid;grid-template-columns:minmax(0,248px) minmax(0,1fr);margin:0;padding:0;border:0;border-radius:0;background:var(--pg-base);height:100%;min-height:0}
  .pg-catalog-sidebar,.pg-catalog-main{overflow:auto;scrollbar-width:thin;scrollbar-color:var(--pg-line) transparent;min-width:0}
  .pg-catalog-sidebar{padding:18px 12px;background:#0B0D10;border-right:1px solid var(--pg-line)}
  .pg-catalog-caption{margin:0 10px 12px;font:10.5px/1.5 var(--pg-font-mono);color:var(--pg-label);letter-spacing:.08em}
  .pg-catalog-competitions{display:grid;gap:4px}
  .pg-catalog-mobile-select{display:none}
  .pg-catalog-competition{display:flex;align-items:center;gap:10px;min-width:0;padding:9px 10px;min-height:52px;border:1px solid transparent;border-radius:var(--pg-r6);background:none;color:var(--pg-text);font:inherit;text-align:start;cursor:pointer}
  .pg-catalog-competition:hover,.pg-catalog-competition[aria-pressed=true]{background:var(--pg-hover);border-color:var(--pg-control-line)}
  .pg-catalog-competition:focus-visible{outline:2px solid var(--pg-accent);outline-offset:-2px}
  .pg-catalog-competition strong,.pg-catalog-competition small{display:block;line-height:1.3;overflow-wrap:anywhere}
  .pg-catalog-competition strong{font-size:13px;font-weight:500}
  .pg-catalog-competition small{color:var(--pg-label);font-size:11.5px}
  .pg-catalog-dot{box-sizing:border-box;width:7px;height:7px;flex:none;border:1px solid var(--pg-label);border-radius:100%}
  .pg-catalog-dot[data-state=live]{background:var(--pg-accent);border-color:var(--pg-accent)}
  .pg-catalog-dot[data-state=upcoming]{background:var(--pg-info);border-color:var(--pg-info)}
  .pg-catalog-main{box-sizing:border-box;width:100%;max-width:1192px;margin:0 auto;padding:22px 44px 40px}
  .pg-catalog .pg-competition-info{gap:14px 24px;margin:0 0 18px;padding:18px 20px;min-height:57px;border:1px solid var(--pg-line);border-radius:12px;background:var(--pg-panel)}
  .pg-competition-summary{flex:1 1 250px;min-width:0}
  .pg-competition-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .pg-competition-title h2{font-size:22px;letter-spacing:-.01em}
  .pg-competition-title .pg-badge{border:0;padding:0;font-size:12px}
  .pg-competition-title .pg-badge[data-tone=success]::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
  .pg-catalog .pg-competition-time{margin:3px 0 0;font:12px/1.5 var(--pg-font-mono)}
  .pg-catalog-period-select{min-width:0;max-width:100%}
  .pg-catalog-periods{display:flex;flex-wrap:wrap;padding:2px;border:1px solid var(--pg-control-line);border-radius:var(--pg-r6);background:var(--pg-base)}
  .pg-catalog-periods .pg-button{min-height:var(--pg-h30);padding:0 12px;border:0;border-radius:var(--pg-r4);color:var(--pg-muted);font-size:12.5px}
  .pg-catalog-periods .pg-button[aria-pressed=true]{background:var(--pg-control-line);color:var(--pg-text)}
  .pg-catalog-deadline{display:flex;align-items:baseline;gap:6px;font-size:12px;color:var(--pg-muted)}
  .pg-catalog-deadline strong{font-family:var(--pg-font-mono);font-size:26px;font-weight:500;color:var(--pg-accent)}
  .pg-catalog-incomplete{display:flex;flex:1 0 100%;align-items:center;gap:8px}
  .pg-catalog-open.pg-button{min-height:34px;padding:4px 12px;border-radius:var(--pg-r6);font-size:12.5px}
  .pg-catalog-open::after,.pg-detail-web::after{content:' ↗'}
  .pg-catalog-toolbar{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;margin-bottom:18px}
  .pg-catalog-search{position:relative;flex:1 1 300px;min-width:0}
  .pg-catalog-search::before{content:"";position:absolute;left:14px;top:14px;width:8px;height:8px;border:1px solid var(--pg-label);border-radius:50%;pointer-events:none}
  .pg-catalog-search::after{content:"";position:absolute;left:22px;top:23px;width:5px;height:1px;background:var(--pg-label);transform:rotate(45deg);pointer-events:none}
  .pg-catalog-search .pg-input{width:100%;min-height:40px;padding-inline-start:36px;font-size:14px}
  .pg-catalog .pg-catalog-filters{margin:0;gap:10px;flex:0 1 auto}
  .pg-catalog .pg-filter{position:relative;flex:0 0 auto;min-width:0;display:flex;align-items:center}
  .pg-catalog .pg-filter:has(select)>span{position:absolute;left:12px;pointer-events:none}
  .pg-catalog .pg-filter select{min-height:40px;min-width:132px;padding-inline-start:47px;font-size:12.5px}
  .pg-catalog .pg-filter-discipline select{min-width:184px;max-width:220px}
  .pg-catalog .pg-filter-other{display:grid;flex:1 0 100%;order:1}
  .pg-catalog .pg-filter-check{min-height:38px;flex:0 0 auto;padding:0 12px;gap:8px;background:var(--pg-control);border:1px solid var(--pg-control-line);border-radius:var(--pg-r8);cursor:pointer}
  .pg-catalog .pg-filter-check input{appearance:none;position:relative;width:28px;height:16px;margin:0;background:var(--pg-control-line);border-radius:999px;cursor:pointer}
  .pg-catalog .pg-filter-check input::before{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:100%;background:var(--pg-muted)}
  .pg-catalog .pg-filter-check input:checked{background:var(--pg-accent)}
  .pg-catalog .pg-filter-check input:checked::before{left:14px;background:var(--pg-ink)}
  .pg-catalog .pg-filter-check input:focus-visible{outline:2px solid var(--pg-accent);outline-offset:2px}
  .pg-catalog .pg-catalog-groups{margin:0;gap:6px}
  .pg-catalog .pg-group-chip{min-height:30px;border-radius:var(--pg-r6);background:var(--pg-control);color:var(--pg-muted);padding:4px 11px;font-size:12.5px}
  .pg-catalog .pg-group-chip[aria-pressed=true]{background:var(--pg-accent);color:var(--pg-ink)}
  .pg-catalog .pg-group-count{font-family:var(--pg-font-mono);font-size:10.5px}
  .pg-catalog-stats{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:16px 0 18px;color:var(--pg-label);font:11px/1.5 var(--pg-font-mono)}
  .pg-catalog .pg-catalog-count{margin:0;font:inherit;color:inherit}
  .pg-catalog-stats-line{flex:1;border-top:1px solid var(--pg-line)}
  .pg-catalog .pg-catalog-refresh{min-height:20px;padding:1px 6px;font-size:11px;color:var(--pg-muted)}
  .pg-catalog .pg-challenge-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .pg-catalog .pg-challenge{min-width:0;min-height:240px;display:flex;flex-direction:column;margin:0;padding:16px}
  .pg-catalog .pg-challenge h3{font-size:16px;margin:10px 0 0}
  .pg-challenge-id{overflow-wrap:anywhere;color:var(--pg-label);font:11px/1.5 var(--pg-font-mono)}
  .pg-challenge-id .pg-button{min-height:0;padding:0;border:0;font:inherit;color:inherit;overflow-wrap:anywhere;text-align:start}
  .pg-catalog .pg-challenge-meta{margin:2px 0 10px;font-size:12.5px;color:var(--pg-muted)}
  .pg-challenge-facts,.pg-challenge-facts>span{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
  .pg-challenge-facts{gap:16px;font-size:12px;color:var(--pg-muted)}
  .pg-challenge-facts strong{font-weight:500;color:var(--pg-text)}
  .pg-challenge-meter{display:flex;gap:2px}
  .pg-challenge-meter i{width:5px;height:12px;border-radius:1px;background:var(--pg-control-line)}
  .pg-challenge-meter i[data-filled=true]{background:var(--pg-text)}
  .pg-catalog .pg-challenge-progress{display:flex;align-items:center;gap:8px;margin:12px 0 10px;padding:8px 10px;border:1px solid var(--pg-control-line);border-radius:var(--pg-r6);background:var(--pg-base);color:var(--pg-text)}
  .pg-challenge-progress::before{content:"";width:7px;height:7px;flex:none;border-radius:50%;background:var(--pg-label)}
  .pg-challenge-progress[data-tone=running]::before{background:var(--pg-accent)}
  .pg-challenge-progress[data-tone=result]::before{background:var(--pg-text)}
  .pg-catalog .pg-challenge .pg-actions{margin-top:auto;padding-top:6px}
  .pg-catalog .pg-actions .pg-button{min-height:34px;padding:4px 12px;border-radius:var(--pg-r6);font-size:12.5px}
  .pg-catalog .pg-badge[data-tone=open]{border-color:#2E3A1E}
  @container (max-width:1230px){
    .pg-catalog-main{padding-inline:24px}
    .pg-catalog .pg-challenge-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  }
  @container (max-width:790px){
    .pg-catalog-sidebar{padding:12px 8px}
    .pg-catalog .pg-challenge-grid{grid-template-columns:1fr}
    .pg-catalog-main{padding-inline:16px}
  }
  @media(max-width:760px){
    .pg-workbench .pg-guide.pg-catalog{display:block;overflow:auto;height:100%}
    .pg-catalog .pg-catalog-main{overflow:visible}
    .pg-catalog-sidebar{border:0;border-bottom:1px solid var(--pg-line)}
    .pg-catalog-caption,.pg-catalog-competitions,.pg-catalog-periods{display:none}
    .pg-catalog-mobile-select{display:block;max-width:100%}
    .pg-catalog .pg-catalog-filters{flex-wrap:wrap}
  }
`;

const challengeDetailCss = `
  .pg-drawer-backdrop[data-drawer=challenge]{background:rgba(4,5,7,.66);padding:8px}
  .pg-challenge-drawer.pg-drawer{width:min(640px,100%);height:100%;padding:0;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--pg-line-strong);border-radius:var(--pg-r14);background:var(--pg-control);box-shadow:-12px 0 42px #0006}
  .pg-detail-top{display:flex;flex:none;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--pg-line)}
  .pg-detail-id,.pg-detail-copy-status{font:12px/1.5 var(--pg-font-mono);color:var(--pg-muted);overflow-wrap:anywhere}
  .pg-detail-copy-status{flex:1}
  .pg-detail-copy.pg-button{min-height:28px;width:28px;padding:0;border-color:transparent;color:var(--pg-label)}
  .pg-detail-copy-icon{display:inline-block;position:relative;width:8px;height:8px;border:1px solid currentColor;border-radius:2px}
  .pg-detail-copy-icon::before{content:"";position:absolute;top:-4px;left:-4px;width:7px;height:7px;border:solid currentColor;border-width:1px 0 0 1px;border-radius:2px}
  .pg-challenge-drawer .pg-drawer-close{min-width:66px;min-height:32px;font-size:12.5px;flex:none}
  .pg-detail-heading{display:grid;gap:12px;padding:18px 22px 0}
  .pg-challenge-drawer .pg-drawer-title{font-size:24px;font-weight:600;letter-spacing:-.015em;line-height:1.3}
  .pg-detail-facts,.pg-detail-tags{display:flex;flex-wrap:wrap;gap:6px}
  .pg-detail-facts .pg-badge{min-height:22px;padding:0 8px;font-size:12px}
  .pg-detail-facts .pg-badge[data-tone=open]{border-color:#2E3A1E}
  .pg-detail-tabs{display:flex;gap:2px;flex:none;margin-top:15px;padding:0 14px;overflow-x:auto;border-bottom:1px solid var(--pg-line)}
  .pg-detail-tabs .pg-button{min-height:40px;padding:0 10px;border:0;border-bottom:2px solid transparent;border-radius:0;white-space:nowrap;color:var(--pg-muted)}
  .pg-detail-tabs .pg-button[aria-selected=true]{border-color:var(--pg-accent);color:var(--pg-text);font-weight:600}
  .pg-detail-tabs .pg-button:focus-visible{outline-offset:-3px}
  .pg-detail-body{box-sizing:border-box;flex:1;min-height:0;overflow:auto;padding:18px 22px 22px;scrollbar-width:thin;scrollbar-color:var(--pg-line) transparent}
  .pg-detail-body:focus-visible{outline:2px solid var(--pg-accent);outline-offset:-3px}
  .pg-challenge-drawer .pg-detail-summary{margin:0 0 18px;color:var(--pg-text);font-size:14.5px;line-height:1.55}
  .pg-detail-section{margin:0 0 18px}
  .pg-detail-rule{display:flex;align-items:center;gap:8px;margin:0 0 10px;color:var(--pg-label);font:10.5px/1.5 var(--pg-font-mono);letter-spacing:.08em}
  .pg-detail-rule::after{content:"";flex:1;border-top:1px solid var(--pg-line)}
  .pg-detail-note{display:flex;align-items:flex-start;gap:9px;margin:0 0 10px;padding:10px 12px;border:1px dashed var(--pg-line-strong);border-radius:var(--pg-r8);color:var(--pg-muted);font-size:12.5px;line-height:1.5;overflow-wrap:anywhere}
  .pg-detail-note>span{color:var(--pg-label)}
  .pg-detail-progress{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0}
  .pg-detail-progress>div{display:flex;flex-direction:column;gap:3px;padding:12px;border:1px solid var(--pg-line);border-radius:var(--pg-r8)}
  .pg-detail-progress dt{order:1;color:var(--pg-muted);font-size:12px}
  .pg-detail-progress dd{margin:0;font:20px/1.35 var(--pg-font-mono)}
  .pg-detail-tags,.pg-detail-resources{margin:0;padding:0;list-style:none}
  .pg-detail-resources{display:grid;gap:8px}
  .pg-detail-resources li{padding:10px 12px;border:1px solid var(--pg-line);border-radius:var(--pg-r8);font-size:13px;overflow-wrap:anywhere}
  .pg-statement{box-sizing:border-box;margin:8px 0;padding:10px 12px;border:1px solid var(--pg-line);border-radius:var(--pg-r8);white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:13px;line-height:1.7}
  .pg-detail-footer{display:flex;flex:none;flex-wrap:wrap;align-items:center;gap:8px;padding:14px 18px;border-top:1px solid var(--pg-line);background:var(--pg-panel)}
  .pg-detail-footer .pg-button{min-height:var(--pg-h42);white-space:normal}
  .pg-detail-footer .pg-primary{flex:1 1 200px}
  .pg-detail-dispatch:not(:is(:disabled,[aria-disabled=true]))::after{content:' →'}
  .pg-detail-footer .pg-detail-web{min-width:122px;border-color:transparent}
  .pg-detail-footer .pg-button:last-child:not(.pg-primary){color:var(--pg-muted)}
  @media(max-width:600px){
    .pg-detail-body,.pg-detail-heading{padding-inline:16px}
    .pg-detail-progress{gap:6px}
    .pg-detail-progress>div{padding:8px}
  }
`;

export { catalogCss, challengeDetailCss };
