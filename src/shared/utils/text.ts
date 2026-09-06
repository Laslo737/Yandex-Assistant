export function truncateText(value: string, max = 6000): string {
  if (!value) return '';
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
