import { runFreepikTask, fileToBase64, downloadTo } from './freepikClient.js';

/**
 * Gera um clipe de vídeo (imagem→vídeo) via um motor da Freepik (Kling, Seedance,
 * etc), como ALTERNATIVA ao Veo (Vertex). O motor é o slug do endpoint, ex:
 * "kling-v2", "kling-v2-1-master", "seedance-pro-1080p". A imagem vai em base64;
 * a proporção 9:16 é herdada da própria imagem (retrato).
 *
 * Endpoint: POST /image-to-video/{model} — assíncrono, polling por task_id.
 * Kling aceita duração '5' ou '10' segundos apenas (mapeado aqui).
 */
export async function generateVideoClipFreepik({
  model,
  imagePath,
  prompt,
  outputPath,
  durationSeconds = 8,
}) {
  const image = await fileToBase64(imagePath);
  // Kling (e a maioria dos motores) só aceita 5 ou 10s: pega o mais próximo.
  const duration = durationSeconds <= 7 ? '5' : '10';

  const body = {
    image,
    duration,
    ...(prompt ? { prompt } : {}),
  };

  const urls = await runFreepikTask(`image-to-video/${model}`, body, {
    intervalMs: 8_000,
    timeoutMs: 12 * 60_000,
  });
  await downloadTo(urls[0], outputPath);
  return outputPath;
}
