import * as React from 'react';

// What Tab can reach inside a drawer; elements without a box (a closed <details>, display:none) are skipped.
const tabbableSelector = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

function tabbables(container) {
  return [...(container.querySelectorAll?.(tabbableSelector) || [])].filter((node) => node.tabIndex !== -1 && (typeof node.getClientRects !== 'function' || node.getClientRects().length > 0));
}

// Node.compareDocumentPosition bits: the other node comes before, or after, the reference node.
const DOCUMENT_POSITION_PRECEDING = 2;

const DOCUMENT_POSITION_FOLLOWING = 4;

// Keyboard focus for a modal drawer. Mounting moves focus to the drawer's title (tabIndex -1), Tab and Shift+Tab
// cycle inside the drawer, and Escape calls the newest `focus.dismiss`. `focus.restore` gives focus back to the
// element that had it when the drawer first rendered (the button that opened it) if that is still in the page,
// else to the first connected node `fallback()` returns (one node or a list). Every close from inside the drawer
// restores first, so the workspace dialog or a navigation that follows takes focus from there. A drawer its
// parent removes restores only when focus was lost with it; when the whole panel is gone, no target is
// connected and nothing is focused.
// The keydown listener is on the document, so it acts only on keys that belong to this drawer: never on a key
// pressed inside another dialog (a host prompt above the drawer) or one a handler already took, and on Tab and
// Escape only while the drawer is displayed and focus is inside it or nowhere (body). A drawer left mounted in a
// hidden workbench, or focus the host moved elsewhere, leaves both keys to the browser and the host: no close
// and no focus move.
function useDrawerFocus(fallback) {
  const [focus] = React.useState(() => ({ opener: typeof document === 'undefined' ? null : document.activeElement, dialog: null, title: null, restored: false, dismiss: () => {} }));
  focus.fallback = fallback;
  focus.restore = () => {
    if (focus.restored) return;
    focus.restored = true;
    // `body` is not a place to return to: a drawer opened while nothing had focus uses the fallback.
    const body = typeof document === 'undefined' ? undefined : document.body;
    [focus.opener, focus.fallback?.()].flat().find((node) => node && node !== body && node.isConnected)?.focus?.();
  };
  React.useEffect(() => {
    focus.restored = false;
    focus.title?.focus?.();
    // A dialog around `target` that is not this drawer and not inside it.
    const inForeignDialog = (target) => {
      const owner = target?.closest?.('[aria-modal="true"],[role="dialog"],[role="alertdialog"],dialog');
      return Boolean(owner && owner !== focus.dialog && !focus.dialog?.contains?.(owner));
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return;
      if (event.defaultPrevented || inForeignDialog(event.target)) return;
      if (typeof focus.dialog?.getClientRects === 'function' && !focus.dialog.getClientRects().length) return;
      const active = document.activeElement;
      const inside = Boolean(active && focus.dialog?.contains?.(active));
      if (!inside && active && active !== document.body) return;
      if (event.key === 'Escape') { focus.dismiss(); return; }
      if (!focus.dialog) return;
      const items = tabbables(focus.dialog);
      // Wrap by document position, so focus on an element Tab does not stop at (the title, the history list or
      // heading at the end) wraps too: Tab when no item follows it, Shift+Tab when none precedes it.
      const bit = event.shiftKey ? DOCUMENT_POSITION_PRECEDING : DOCUMENT_POSITION_FOLLOWING;
      const wrap = !items.length || !inside || !items.some((node) => node !== active && (active.compareDocumentPosition?.(node) & bit));
      if (!wrap) return;
      event.preventDefault?.();
      (items.length ? (event.shiftKey ? items.at(-1) : items[0]) : focus.title)?.focus?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const active = document.activeElement;
      if (!active || active === document.body) focus.restore();
    };
  }, []);
  return focus;
}

export { useDrawerFocus };

