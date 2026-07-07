# criativos

Pipeline pra gerar criativos em vídeo pro Meta Ads a partir de uma imagem de cena + roteiro + narração.

Saída: MP4 1080x1920 (9:16), com narração em áudio e legenda queimada, pronto pra subir no Ads Manager.

## Como funciona

1. **Veo (Vertex AI)** anima a(s) imagem(ns) de cena — cada clipe dura até 8s.
2. **Cloud Text-to-Speech** narra o texto que você mandar, com timestamp por palavra.
3. Os timestamps viram um arquivo **.srt** (legenda sincronizada).
4. **ffmpeg** concatena os clipes, troca o áudio pela narração e queima a legenda — tudo em 1080x1920.

Vertex AI e Cloud TTS autenticam com o **mesmo service account (OAuth2)** — um credential
só, faturando direto na conta de billing normal do projeto GCP (sem API key, sem prepay separado).

## Setup

**Requisito:** o filtro de legenda queimada precisa de `ffmpeg` compilado com `libass`.
O formula padrão do Homebrew (`brew install ffmpeg`) **não** inclui isso — use o `ffmpeg-full`:

```bash
brew install ffmpeg-full
```

O código já detecta e usa automaticamente `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg` se existir
(veja `src/ffmpeg.js`), sem precisar mexer no PATH do sistema.

```bash
cp .env.example .env
# preencha GOOGLE_CLOUD_PROJECT com o project ID certo (ex: atelier-usemalta)
```

Precisa de uma service account (autentica Vertex AI + Cloud TTS de uma vez, via OAuth2):

1. Google Cloud Console → IAM & Admin → Service Accounts → Create Service Account (qualquer nome, não precisa de role especial)
2. Nela, aba "Keys" → Add Key → JSON → baixa o arquivo
3. Salva esse arquivo como `service-account.json` na raiz deste projeto (já está no `.gitignore`, nunca vai pro git)
4. Confirma que **Vertex AI API** e **Cloud Text-to-Speech API** estão habilitadas no projeto (console.cloud.google.com/apis/library)
5. Confirma que o projeto tem uma **conta de faturamento vinculada** (console.cloud.google.com/billing/linkedaccount?project=SEU_PROJETO) — é isso que faz o Veo/TTS consumirem os créditos normais do Cloud em vez de pedir prepay separado

```bash
npm install
```

(instala `dotenv` + `google-auth-library` — o resto usa `fetch` nativo do Node 18+.)

## Uso

1. Coloque as imagens de cena em `inputs/` (ex: `inputs/cena1.jpg`)
2. Crie um `inputs/seu-projeto.json` (veja `inputs/exemplo.json`):

```json
{
  "narracao": "texto completo que será narrado por cima do vídeo",
  "voz": "pt-BR-Wavenet-B",
  "estiloLegenda": "contorno",
  "cenas": [
    { "imagem": "inputs/cena1.jpg", "prompt": "descrição de movimento de câmera pra Veo" },
    { "imagem": "inputs/cena2.jpg", "prompt": "descrição da segunda cena" }
  ]
}
```

`voz` e `estiloLegenda` são opcionais (usam o default do `.env` / `caixa` se omitidos).

**Vozes** (só Neural2/Wavenet suportam legenda sincronizada — Chirp3-HD não):
`pt-BR-Neural2-A/C` e `pt-BR-Wavenet-A/C/D` (femininas), `pt-BR-Neural2-B` e `pt-BR-Wavenet-B/E` (masculinas).
Lista completa: `cloud.google.com/text-to-speech/docs/voices`.

**Estilos de legenda** (`src/subtitleStyles.js`):
- `caixa` — texto branco em caixa preta sólida (padrão)
- `contorno` — texto grande em negrito com contorno preto grosso, sem caixa (estilo Hormozi/MrBeast)

3. Rode:

```bash
node src/index.js --config inputs/seu-projeto.json --out output/final.mp4
```

### Dica de tempo

Cada cena gera um clipe de 8s (fixo, ou ajustável por cena com `"duracaoSegundos"`).
O script avisa se `nº de cenas × 8s` estiver muito diferente da duração real da narração —
ajuste o número de cenas no roteiro pra bater com o tempo de fala.

## Estrutura

```
src/
  generateVideoClip.js   → chama a Veo na Vertex AI (image-to-video)
  googleAuth.js          → OAuth2 (service account) compartilhado por Veo e TTS
  generateNarration.js   → chama Cloud TTS + timestamps por palavra (SSML marks)
  generateSubtitles.js   → monta o .srt a partir dos timestamps
  subtitleStyles.js      → presets de estilo de legenda (caixa, contorno)
  mergeFinal.js          → ffmpeg: concat + áudio + legenda + crop 1080x1920
  ffmpeg.js              → wrapper de execução do ffmpeg/ffprobe
  index.js               → orquestrador (CLI)
inputs/                  → imagens de cena + projeto.json
output/                  → vídeo final
tmp/                     → clipes intermediários, áudio, srt (por projeto)
```
