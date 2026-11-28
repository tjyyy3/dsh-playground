export function taskEvidence({ state, liveEnd, terminalText }) {
  if (state === 'running' || liveEnd) return 'host';
  return terminalText ? 'report' : 'none';
}
