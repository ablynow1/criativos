import { spawn } from 'node:child_process';
import path from 'node:path';
import { runFfmpeg } from './ffmpeg.js';

/**
 * Baixa um trecho de uma trilha do YouTube já cortado na duração do vídeo.
 *
 * Baixa SÓ a janela pedida (+2s de folga) em vez do áudio inteiro — numa
 * música de 4 minutos isso é a diferença entre 2s e 40s de espera.
 *
 * Usado pelo Ermos e pelo UGC. Devolve o caminho do arquivo, ou null se
 * falhou (o vídeo segue sem trilha — nunca derruba o render por causa de som).
 */
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} código ${code}`))));
    p.on('error', reject);
  });
}

export async function baixaTrilhaYoutube({ ytId, inicio = 0, duracao, tmpDir, nome = 'trilha.m4a' }) {
  if (!ytId) return null;
  const ini = Math.max(0, Number(inicio) || 0);
  const bruto = path.join(tmpDir, 'yt-bruto.m4a');
  const saida = path.join(tmpDir, nome);
  try {
    console.log(`  baixando a trilha do YouTube (${ytId}) a partir de ${ini}s…`);
    await run('yt-dlp', ['-f', 'bestaudio', '-o', bruto, '--no-playlist', '--quiet', '--no-warnings',
      '--download-sections', `*${ini}-${ini + Math.ceil(duracao) + 2}`, '--force-keyframes-at-cuts',
      `https://www.youtube.com/watch?v=${ytId}`]);
    await runFfmpeg(['-i', bruto, '-t', String(duracao),
      '-af', `afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, duracao - 1.5)}:d=1.5`,
      '-c:a', 'aac', '-b:a', '192k', saida]);
    console.log(`  trilha pronta (${duracao}s a partir de ${ini}s)`);
    return saida;
  } catch (e) {
    console.error(`  trilha do YouTube falhou (seguindo sem): ${String(e.message).slice(0, 140)}`);
    return null;
  }
}
