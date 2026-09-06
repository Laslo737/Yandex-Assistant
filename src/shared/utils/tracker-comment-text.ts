export function truncateTrackerText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export function extractTrackerAuthoredText(value?: string): string | undefined {
  if (!value) return undefined;

  const cleanedLines = value
    .replace(/\r/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/:file\[[^\]]*\]\([^)]*\)\{[^}]*\}/gi, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line)
    .filter((line) => !/^>/.test(line))
    .filter((line) => !/^\{\%\s*cut/i.test(line))
    .filter((line) => !/^\{\%\s*endcut/i.test(line))
    .filter((line) => !/^предыдущие сообщения$/i.test(line))
    .filter((line) => !/^в ответ на$/i.test(line))
    .filter((line) => !/^ответ на$/i.test(line))
    .map((line) => line.replace(/\[В ответ на\]\([^)]*\)\{[^}]*\}/gi, ' '))
    .map((line) => line.replace(/https?:\/\/\S+/gi, ' '))
    .map((line) => line.replace(/\\\./g, '.'))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && line !== '[' && line !== ']');

  if (!cleanedLines.length) return undefined;

  const text = cleanedLines.join('\n').trim();
  return text || undefined;
}

export function normalizeTrackerCommentText(value?: string, maxLength = 500): string | undefined {
  const authored = extractTrackerAuthoredText(value);
  if (!authored) return undefined;
  return truncateTrackerText(authored.replace(/\s+/g, ' ').trim(), maxLength);
}
