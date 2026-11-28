const instrumentCss = `
  :where(.pg-controller,.pg-workbench,.pg-guide,.pg-card,.pg-task-modal,.pg-codex-chats) {
    --pg-base:#090B0E; --pg-panel:#0D1014; --pg-hover:#141920;
    --pg-line:#1E232C; --pg-line-strong:#2C3340;
    --pg-accent:#C6F24E; --pg-accent-hover:#DAFF73;
    --pg-info:#7CC0FF; --pg-warning:#FFB04A; --pg-error:#FF8E7A;
    --pg-text:#E6EAF0; --pg-muted:#A3ADBB; --pg-label:#808B9B; --pg-ink:#0A0C0F;
    --pg-accent-strong:var(--pg-accent); --pg-accent-soft:#12170C;
    --pg-control:#0F1216; --pg-control-line:#262C36;
    --pg-r4:4px; --pg-r6:6px; --pg-r8:8px; --pg-r10:10px; --pg-r14:14px;
    --pg-s4:4px; --pg-s8:8px; --pg-s12:12px; --pg-s16:16px; --pg-s24:24px;
    --pg-h30:30px; --pg-h36:36px; --pg-h42:42px;
    --pg-font-body:"Noto Sans SC",system-ui,sans-serif;
    --pg-font-title:"Space Grotesk",var(--pg-font-body);
    --pg-font-mono:"JetBrains Mono",ui-monospace,monospace;
    --pg-grid:radial-gradient(rgba(230,234,240,0.05) 1px,transparent 1px) 0 0 / 22px 22px;
    color:var(--pg-text);
    font-family:var(--pg-font-body);
  }
  :where(.pg-controller-brand,.pg-controller-chat-head,.pg-controller-tasks,.pg-workbench,.pg-guide,.pg-card,.pg-task-modal) :is(h1,h2,h3) {
    font-family:var(--pg-font-title);
  }
`;

const css = instrumentCss + `

  .pg-guide,.pg-card{box-sizing:border-box;max-width:100%;line-height:1.55;color:var(--pg-text);border:1px solid var(--pg-line);border-radius:var(--pg-r10);background:var(--pg-panel);padding:12px 14px}
  .pg-guide{margin:4px 0 8px}
  .pg-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
  .pg-brand{display:flex;align-items:center;gap:8px;min-width:0;overflow-wrap:anywhere;font-weight:600;font-size:14px;line-height:1.4;margin:0}
  .pg-column-heading h2{margin:0}
  .pg-confirm-title{margin:0;font:inherit;font-size:14px;line-height:1.4}
  .pg-mark{color:var(--pg-accent);font-weight:700}
  .pg-guide p,.pg-note{font-size:12px;line-height:1.6;color:var(--pg-muted);margin:8px 0}
  .pg-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .pg-button{min-height:var(--pg-h36);font:inherit;font-size:13px;line-height:1.4;padding:6px 14px;border-radius:var(--pg-r8);border:1px solid var(--pg-line-strong);background:transparent;color:var(--pg-text);cursor:pointer}
  .pg-button:hover:not(:disabled){background:var(--pg-hover);border-color:#353D4A}
  .pg-button:focus-visible,.pg-input:focus-visible,.pg-session-picker:focus-visible,.pg-split-control input:focus-visible,.pg-raw summary:focus-visible{outline:2px solid var(--pg-accent);outline-offset:2px}
  .pg-button:is(:disabled,[aria-disabled="true"]){background:var(--pg-hover);border-color:var(--pg-control-line);color:var(--pg-label);cursor:default}
  .pg-toggle{border:0;background:transparent;padding:3px 0;color:var(--pg-muted)}
  .pg-card h3{font-family:var(--pg-font-title);font-weight:600;font-size:14px;line-height:1.5;margin:0;overflow-wrap:anywhere}
  .pg-badge{display:inline-flex;align-items:center;gap:6px;min-height:20px;font-size:11.5px;border:1px solid var(--pg-control-line);border-radius:var(--pg-r4);padding:0 6px;color:var(--pg-muted);white-space:nowrap}
  .pg-badge:is([data-tone=running],[data-tone=result],[data-tone=evaluating],[data-tone=warning],[data-tone=scored],[data-tone=error],[data-tone=unknown])::before {content:"";width:7px;height:7px;box-sizing:border-box;border-radius:50%;background:currentColor;flex:none}
  .pg-badge:is([data-tone=running],[data-tone=open],[data-tone=success]){color:var(--pg-accent)}
  .pg-badge:is([data-tone=result],[data-tone=scored]){color:var(--pg-text)}
  .pg-badge[data-tone=scored]::before{border-radius:0}
  .pg-badge[data-tone=evaluating]{color:var(--pg-info)}
  .pg-badge[data-tone=warning]{color:var(--pg-warning)}
  .pg-badge[data-tone=error],.pg-error{color:var(--pg-error)}
  .pg-badge[data-tone=error]::before{border:1.5px solid currentColor;background:none}
  .pg-badge[data-tone=unknown]::before{width:9px;height:9px;border:1px solid var(--pg-label);border-radius:2px;background:repeating-linear-gradient(135deg,var(--pg-label) 0 1.5px,transparent 1.5px 3.5px)}
  .pg-badge[data-tone=running]::before{animation:pg-signal-pulse 1.8s ease-out infinite}
  @keyframes pg-signal-pulse{0%{box-shadow:0 0 0 0 rgba(198,242,78,.55)}70%,100%{box-shadow:0 0 0 6px rgba(198,242,78,0)}}
  @media(prefers-reduced-motion:reduce){.pg-badge[data-tone=running]::before{animation:none}}
  .pg-facts{display:flex;gap:8px 16px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--pg-muted)}
  .pg-score{font-family:var(--pg-font-mono);font-size:15px;font-weight:600;margin:12px 0 8px}
  .pg-list{list-style:none;padding:0;margin:10px 0 0}
  .pg-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:9px 0;border-top:1px solid var(--pg-line);font-size:12px}
  .pg-row .pg-badge{align-self:start}
  .pg-row-main{min-width:0;overflow-wrap:anywhere}
  .pg-row-sub{margin-top:4px;color:var(--pg-muted)}
  .pg-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:8px;margin:8px 0}
  .pg-metric{padding:8px 10px;border:1px solid var(--pg-line);border-radius:8px}
  .pg-metric dt{font-size:11px;color:var(--pg-muted);overflow-wrap:anywhere}
  .pg-metric dd{margin:5px 0 0;font-size:17px;font-weight:600}
  .pg-raw{font-size:12px;margin-top:10px;color:var(--pg-muted)}
  .pg-raw summary{cursor:pointer}
  .pg-raw pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font:inherit;font-size:12px;line-height:1.6}
  .pg-error{font-size:12px;line-height:1.6;overflow-wrap:anywhere;white-space:pre-line}
  .pg-card footer{margin-top:10px;font-size:11px;color:var(--pg-muted)}
  .pg-primary{background:var(--pg-accent);border-color:transparent;color:var(--pg-ink);font-weight:600}
  .pg-primary:hover:not(:disabled):not([aria-disabled="true"]){background:var(--pg-accent-hover);border-color:transparent}
  .pg-list-action{background:var(--pg-accent-soft);border-color:#6E8A2A;color:var(--pg-accent);font-weight:600}
  .pg-risk{background:var(--pg-warning);border-color:transparent;color:#1A1208;font-weight:600}
  .pg-risk:hover:not(:disabled){background:#FFC276;border-color:transparent}
  .pg-input{box-sizing:border-box;min-height:var(--pg-h36);padding:6px 10px;font:inherit;color:var(--pg-text);color-scheme:dark;background:var(--pg-control);border:1px solid var(--pg-control-line);border-radius:var(--pg-r8)}
  .pg-input:disabled{background:var(--pg-hover);color:var(--pg-label)}
  .pg-input::placeholder,.pg-codex-chats textarea::placeholder{color:var(--pg-label)}
  .pg-confirm-impact{display:flex;align-items:flex-start;gap:8px;margin:10px 0;padding:10px;border:1px solid var(--pg-warning);border-radius:8px;color:var(--pg-warning);font-size:12px;line-height:1.5}.pg-readonly{box-sizing:border-box;padding:8px 10px;border:1px solid var(--pg-line);border-radius:7px;background:var(--pg-panel);color:var(--pg-muted);font-size:12px}.pg-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`;

const taskModalCss = instrumentCss + `
    .pg-task-modal{--pg-task-accent:var(--pg-accent);--pg-task-text:var(--pg-text);--pg-task-secondary:var(--pg-muted);--pg-task-base:var(--pg-base);--pg-task-subtle:color-mix(in srgb,var(--pg-task-text) 3%,var(--pg-task-base));--pg-task-border:var(--pg-line);--pg-task-error:var(--pg-error);box-sizing:border-box;width:544px;max-width:100%;max-height:calc(100dvh - 96px);gap:0;padding:0;border-radius:var(--pg-r14);background:var(--pg-task-base);color:var(--pg-task-text);font-size:14px;overflow:hidden}
    .pg-task-modal *{box-sizing:border-box}.pg-task-modal ::selection{background:color-mix(in srgb,var(--pg-task-accent) 25%,var(--pg-task-base));color:var(--pg-task-text)}
    .pg-task-modal svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex:none}
    .pg-task-header{position:relative;flex:none;padding:24px 24px 0}.pg-task-header h2{padding-right:36px;margin:0;font-size:20px;line-height:28px;font-weight:600;letter-spacing:-.2px}.pg-task-subtitle{margin:6px 0 0;color:var(--pg-task-secondary);font-size:13px;line-height:20px}
    .pg-task-close{position:absolute;top:20px;right:20px;display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--pg-task-secondary);cursor:pointer}.pg-task-close:hover:not(:disabled){background:var(--pg-task-subtle);color:var(--pg-task-text)}
    .pg-task-body{display:grid;gap:24px;min-height:0;padding:24px;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--pg-task-border) transparent}
    .pg-task-summary{padding:16px;border-radius:10px;background:var(--pg-task-subtle)}.pg-task-summary-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.pg-task-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;margin:0;font-size:16px;line-height:25px;font-weight:500}.pg-task-mode{flex:none;margin-top:2px;padding:1px 7px;border:1px solid var(--pg-task-border);border-radius:5px;color:var(--pg-task-secondary);font-size:11px;line-height:18px;white-space:nowrap}.pg-task-id{margin:7px 0 0;color:var(--pg-task-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
    .pg-task-field{display:grid;gap:8px}.pg-task-field label{font-size:14px;font-weight:500;line-height:21px}.pg-task-select-wrap{position:relative;min-width:0}.pg-task-select-wrap>svg{position:absolute;top:13px;left:13px;pointer-events:none;color:var(--pg-task-secondary)}.pg-task-select-wrap>.pg-task-chevron{top:14px;right:13px;left:auto;width:15px;height:15px}
    .pg-task-select{appearance:none;display:block;width:100%;height:var(--pg-h42);padding:0 40px;border:1px solid var(--pg-task-border);border-radius:8px;background:var(--pg-task-base);color:var(--pg-task-text);font:inherit;font-size:14px;line-height:22px}.pg-task-select[data-empty=true]{color:var(--pg-task-secondary)}.pg-task-select:hover:not(:disabled){border-color:var(--pg-task-secondary)}.pg-task-select:disabled{background:var(--pg-task-subtle);color:var(--pg-task-secondary)}.pg-task-select[aria-invalid=true]{border-color:var(--pg-task-error)}
    .pg-task-path{margin:0;padding:10px 12px;border:1px solid var(--pg-line);border-radius:7px;background:var(--pg-task-subtle);color:var(--pg-task-secondary);font-size:12px;line-height:20px;overflow-wrap:anywhere;white-space:pre-wrap}.pg-task-hint{margin:0;color:var(--pg-task-secondary);font-size:12px;line-height:19px}
    .pg-task-add{justify-self:start;display:flex;align-items:center;gap:7px;height:36px;margin-top:4px;padding:0 10px 0 8px;border:1px solid var(--pg-task-border);border-radius:7px;background:var(--pg-task-base);color:var(--pg-task-secondary);font:inherit;font-size:12px;cursor:pointer}.pg-task-add svg{width:15px;height:15px}.pg-task-add:hover:not(:disabled){background:var(--pg-task-subtle);border-color:var(--pg-task-secondary)}.pg-task-error{margin:2px 0 0;color:var(--pg-task-error);font-size:12px;line-height:20px;overflow-wrap:anywhere}
    .pg-task-footer{flex:none;padding:16px 24px 20px;border-top:1px solid var(--pg-line)}.pg-task-footer p{margin:0 0 16px;color:var(--pg-task-secondary);font-size:12px;line-height:19px}.pg-task-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}
    .pg-task-button{display:flex;align-items:center;justify-content:center;gap:8px;min-width:76px;height:var(--pg-h42);padding:0 16px;border:1px solid var(--pg-task-border);border-radius:8px;background:var(--pg-task-base);color:var(--pg-task-text);font:inherit;font-size:14px;font-weight:500;line-height:20px;white-space:nowrap;cursor:pointer}
    .pg-task-button:hover:not(:disabled){background:var(--pg-task-subtle);border-color:var(--pg-task-secondary)}
    .pg-task-create{min-width:144px;border-color:transparent;background:var(--pg-accent);color:var(--pg-ink)}
    .pg-task-create:hover:not(:disabled){background:var(--pg-accent-hover);border-color:transparent}
    .pg-task-button:disabled,.pg-task-add:disabled,.pg-task-close:disabled{cursor:default;color:var(--pg-label)}
    .pg-task-create:disabled{border-color:transparent;background:color-mix(in srgb,var(--pg-task-text) 8%,var(--pg-task-base))}
    .pg-task-create[data-busy=true]{background:var(--pg-accent);color:var(--pg-ink)}
    .pg-task-create svg{width:15px;height:15px;animation:pg-task-spin 1s linear infinite}
    .pg-task-modal button:focus-visible,.pg-task-select:focus-visible{outline:2px solid var(--pg-task-accent);outline-offset:3px}.pg-task-select:focus-visible{border-color:var(--pg-task-accent);outline-offset:2px}
    @keyframes pg-task-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.pg-task-create svg{animation:none}}
    @media(max-width:600px){.pg-task-header{padding:22px 20px 0}.pg-task-header h2{font-size:19px}.pg-task-body{padding:20px;gap:20px}.pg-task-footer{padding:16px 20px 20px}.pg-task-summary{padding:14px}}
  `;

export { css, taskModalCss };

