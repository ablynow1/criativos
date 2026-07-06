import { writeFile } from 'node:fs/promises';

function formatSrtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const msRem = ms % 1000;
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msRem, 3)}`;
}

/**
 * Agrupa palavras (com startSeconds) em blocos curtos de legenda (estilo caption de anúncio,
 * 3-5 palavras por vez) e escreve um arquivo .srt.
 */
export async function generateSubtitles({
  wordTimings,
  totalDurationSeconds,
  outputSrtPath,
  wordsPerCaption = 4,
}) {
  const timed = wordTimings.filter((w) => w.startSeconds != null);
  if (timed.length === 0) {
    throw new Error('Nenhum timestamp de palavra disponível para gerar legendas');
  }

  const chunks = [];
  for (let i = 0; i < timed.length; i += wordsPerCaption) {
    chunks.push(timed.slice(i, i + wordsPerCaption));
  }

  const lines = [];
  chunks.forEach((chunk, idx) => {
    const start = chunk[0].startSeconds;
    const end = idx + 1 < chunks.length ? chunks[idx + 1][0].startSeconds : totalDurationSeconds;
    const text = chunk.map((w) => w.word).join(' ');
    lines.push(String(idx + 1));
    lines.push(`${formatSrtTime(start)} --> ${formatSrtTime(end)}`);
    lines.push(text);
    lines.push('');
  });

  await writeFile(outputSrtPath, lines.join('\n'), 'utf-8');
  return outputSrtPath;
}
