import { readFile, writeFile } from 'node:fs/promises';
import { config } from './config.js';

/**
 * Client REST genérico da API da Freepik/Magnific (motores Kling, Seedance,
 * upscaler Magnific, etc). Padrão da API: POST cria uma task assíncrona e
 * devolve { task_id, status }; o resultado sai por polling num GET
 * `{base}/{endpoint}/{task_id}` até status COMPLETED, no campo `generated`.
 *
 * Autentica por API KEY (header configurável) — é uma chave DIFERENTE do OAuth
 * (service account) usado na Vertex AI. Pega em freepik.com/api ou magnific.com.
 */

function requireApiKey() {
  if (!config.freepikApiKey) {
    throw new Error(
      'Falta FREEPIK_API_KEY no .env — necessária para refino de imagem e motores de vídeo da Freepik ' +
      '(Kling/Seedance). Gere a chave em freepik.com (Dashboard > API) ou magnific.com e cole no .env. ' +
      'Não é o mesmo que a service account do Google (essa é só pra Vertex/Veo/TTS).'
    );
  }
  return config.freepikApiKey;
}

function apiUrl(endpoint, taskId) {
  const base = config.freepikApiBase.replace(/\/$/, '');
  const clean = endpoint.replace(/^\//, '');
  return taskId ? `${base}/${clean}/${taskId}` : `${base}/${clean}`;
}

function headers() {
  return {
    [config.freepikApiKeyHeader]: requireApiKey(),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// A resposta pode vir "crua" ({...}) ou embrulhada em { data: {...} } — normaliza.
function unwrap(json) {
  return json && json.data !== undefined ? json.data : json;
}

async function createTask(endpoint, body) {
  const res = await fetch(apiUrl(endpoint), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Freepik POST ${endpoint} ${res.status}: ${errBody}`);
  }
  return unwrap(await res.json());
}

async function fetchTask(endpoint, taskId) {
  const res = await fetch(apiUrl(endpoint, taskId), { headers: headers() });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Freepik GET ${endpoint}/${taskId} ${res.status}: ${errBody}`);
  }
  return unwrap(await res.json());
}

/**
 * Cria a task e faz polling até terminar. Devolve o array `generated`
 * (URLs dos assets prontos). Lança se FAILED ou se estourar o timeout.
 */
export async function runFreepikTask(endpoint, body, {
  intervalMs = 6_000,
  timeoutMs = 10 * 60_000,
} = {}) {
  const created = await createTask(endpoint, body);
  const taskId = created.task_id || created.taskId || created.id;
  if (!taskId) {
    throw new Error(`Freepik ${endpoint}: resposta sem task_id: ${JSON.stringify(created).slice(0, 400)}`);
  }

  const started = Date.now();
  let task = created;
  let status = String(task.status || 'CREATED').toUpperCase();

  while (status !== 'COMPLETED' && status !== 'FAILED') {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Freepik ${endpoint}/${taskId}: timeout após ${Math.round(timeoutMs / 1000)}s (status ${status})`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    task = await fetchTask(endpoint, taskId);
    status = String(task.status || status).toUpperCase();
  }

  if (status === 'FAILED') {
    throw new Error(`Freepik ${endpoint}/${taskId} falhou: ${JSON.stringify(task).slice(0, 400)}`);
  }

  const generated = task.generated || task.result || task.output || [];
  const urls = (Array.isArray(generated) ? generated : [generated])
    .map((g) => (typeof g === 'string' ? g : g?.url))
    .filter(Boolean);
  if (urls.length === 0) {
    throw new Error(`Freepik ${endpoint}/${taskId} completou sem asset: ${JSON.stringify(task).slice(0, 400)}`);
  }
  return urls;
}

/** Lê um arquivo local e devolve o base64 puro (sem prefixo data:), como a API espera. */
export async function fileToBase64(filePath) {
  const buffer = await readFile(filePath);
  return buffer.toString('base64');
}

/** Baixa uma URL de asset (imagem/vídeo) pro disco. */
export async function downloadTo(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download ${res.status} de ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(outputPath, buffer);
  return outputPath;
}
