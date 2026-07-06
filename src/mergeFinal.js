import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg } from './ffmpeg.js';

/**
 * Concatena clipes de vídeo (mudos ou não), substitui o áudio pela narração,
 * e queima a legenda por cima. Saída final: 1080x1920.
 */
export async function mergeFinal({
  clipPaths,
  narrationAudioPath,
  srtPath,
  outputPath,
  tmpDir,
}) {
  let videoInput = clipPaths[0];

  if (clipPaths.length > 1) {
    const listPath = path.join(tmpDir, 'concat_list.txt');
    const listContent = clipPaths.map((p) => `file '${path.resolve(p)}'`).join('\n');
    await writeFile(listPath, listContent, 'utf-8');

    const concatenated = path.join(tmpDir, 'concatenated.mp4');
    await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', concatenated]);
    videoInput = concatenated;
  }

  const srtEscaped = srtPath.replace(/:/g, '\\:');
  const subtitleStyle =
    "FontName=Arial,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=0,Alignment=2,MarginV=120";

  await runFfmpeg([
    '-i', videoInput,
    '-i', narrationAudioPath,
    '-vf', `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,subtitles=${srtEscaped}:force_style='${subtitleStyle}'`,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-c:a', 'aac',
    '-shortest',
    outputPath,
  ]);

  return outputPath;
}
