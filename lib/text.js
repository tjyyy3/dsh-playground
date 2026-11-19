export function oneLine(value, max = 120) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}
