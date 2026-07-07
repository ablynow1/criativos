import { config } from './config.js';
import { generateVideoClip } from './generateVideoClip.js';
import { generateVideoClipFreepik } from './generateVideoClipFreepik.js';

/**
 * Dispatcher do motor de vídeo — deixa ESCOLHER qual usar por clipe.
 *
 * `engine` pode ser:
 *   - "veo"                 → Veo 3.1 na Vertex AI (default; fatura no Cloud)
 *   - "freepik:<model>"     → motor da Freepik, ex "freepik:kling-v2",
 *                             "freepik:seedance-pro-1080p" (fatura na conta Freepik)
 *
 * Ordem de precedência: cena.motor > project.motor > VIDEO_ENGINE (.env) > "veo".
 */
export async function generateClip({
  engine,
  imagePath,
  prompt,
  outputPath,
  aspectRatio = '9:16',
  resolution = '1080p',
  durationSeconds = 8,
}) {
  const chosen = (engine || config.videoEngine || 'veo').trim();

  if (chosen === 'veo') {
    return generateVideoClip({ imagePath, prompt, outputPath, aspectRatio, resolution, durationSeconds });
  }

  if (chosen.startsWith('freepik:')) {
    const model = chosen.slice('freepik:'.length);
    if (!model) {
      throw new Error(`Motor "freepik:" sem modelo. Use ex: "freepik:kling-v2".`);
    }
    return generateVideoClipFreepik({ model, imagePath, prompt, outputPath, durationSeconds });
  }

  throw new Error(`Motor de vídeo desconhecido: "${chosen}". Use "veo" ou "freepik:<model>" (ex: "freepik:kling-v2").`);
}
