import { config } from './config.js';
import { runFreepikTask, fileToBase64, downloadTo } from './freepikClient.js';

/**
 * Refina (upscale + nitidez) uma imagem antes de mandá-la pro motor de vídeo,
 * via Upscaler Precision V2 da Magnific (fiel à identidade — NÃO alucina rosto
 * nem produto, só adiciona resolução e detalhe). Serve pra imagem do Nano Banana
 * (768x1344, soft) virar ~1536x2688 nítida, que o Veo/Kling animam bem melhor.
 *
 * Endpoint: POST /image-upscaler-precision-v2 (assíncrono, polling por task_id).
 * Retorna o caminho da imagem refinada salva em disco.
 */
export async function refineImage({ imagePath, outputPath, opts = {} }) {
  const image = await fileToBase64(imagePath);

  const body = {
    image,
    scale_factor: opts.scaleFactor ?? config.refine.scaleFactor,
    sharpen: opts.sharpen ?? config.refine.sharpen,
    ultra_detail: opts.ultraDetail ?? config.refine.ultraDetail,
    smart_grain: opts.smartGrain ?? config.refine.smartGrain,
    flavor: opts.flavor ?? config.refine.flavor,
  };

  const urls = await runFreepikTask('image-upscaler-precision-v2', body, {
    intervalMs: 6_000,
    timeoutMs: 8 * 60_000,
  });
  await downloadTo(urls[0], outputPath);
  return outputPath;
}
