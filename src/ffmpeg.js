import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// A legenda queimada (filtro "subtitles", via libass) só existe no build ffmpeg-full.
// O formula padrão "ffmpeg" do Homebrew não inclui libass/freetype.
const FFMPEG_FULL_BIN = '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg';
const FFMPEG_BIN = existsSync(FFMPEG_FULL_BIN) ? FFMPEG_FULL_BIN : 'ffmpeg';
const FFPROBE_BIN = existsSync(FFMPEG_FULL_BIN)
  ? '/opt/homebrew/opt/ffmpeg-full/bin/ffprobe'
  : 'ffprobe';

export async function runFfmpeg(args) {
  try {
    return await execFileAsync(FFMPEG_BIN, ['-y', ...args], { maxBuffer: 1024 * 1024 * 64 });
  } catch (err) {
    throw new Error(`ffmpeg falhou: ${err.stderr || err.message}`);
  }
}

export async function getDurationSeconds(filePath) {
  const { stdout } = await execFileAsync(FFPROBE_BIN, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

/** Largura x altura de uma imagem/vídeo, em pixels. */
export async function probeWH(filePath) {
  const { stdout } = await execFileAsync(FFPROBE_BIN, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0',
    filePath,
  ]);
  const [w, h] = stdout.trim().split(',').map(Number);
  return { w, h };
}

/** True se o arquivo tem pelo menos uma faixa de áudio. */
export async function hasAudioStream(filePath) {
  const { stdout } = await execFileAsync(FFPROBE_BIN, [
    '-v', 'error',
    '-select_streams', 'a',
    '-show_entries', 'stream=codec_type',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return stdout.trim().length > 0;
}
