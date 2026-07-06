# criativos

Pipeline pra gerar criativos em vídeo pro Meta Ads a partir de uma imagem de cena + roteiro + narração.

Saída: MP4 1080x1920 (9:16), com narração em áudio e legenda queimada, pronto pra subir no Ads Manager.

## Como funciona

1. **Veo 3.1** (Gemini API) anima a(s) imagem(ns) de cena — cada clipe dura até 8s.
2. **Cloud Text-to-Speech** narra o texto que você mandar, com timestamp por palavra.
3. Os timestamps viram um arquivo **.srt** (legenda sincronizada).
4. **ffmpeg** concatena os clipes, troca o áudio pela narração e queima a legenda — tudo em 1080x1920.

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
# preencha GEMINI_API_KEY (aistudio.google.com/apikey)
# e GOOGLE_TTS_API_KEY (pode ser a mesma chave, se "Cloud Text-to-Speech API"
# estiver habilitada no mesmo projeto GCP em console.cloud.google.com/apis/library)
```

```bash
npm install
```

(só instala o `dotenv` — o resto usa `fetch` nativo do Node 18+.)

## Uso

1. Coloque as imagens de cena em `inputs/` (ex: `inputs/cena1.jpg`)
2. Crie um `inputs/seu-projeto.json` (veja `inputs/exemplo.json`):

```json
{
  "narracao": "texto completo que será narrado por cima do vídeo",
  "cenas": [
    { "imagem": "inputs/cena1.jpg", "prompt": "descrição de movimento de câmera pra Veo" },
    { "imagem": "inputs/cena2.jpg", "prompt": "descrição da segunda cena" }
  ]
}
```

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
  generateVideoClip.js   → chama a Veo (image-to-video)
  generateNarration.js   → chama Cloud TTS + timestamps por palavra (SSML marks)
  generateSubtitles.js   → monta o .srt a partir dos timestamps
  mergeFinal.js          → ffmpeg: concat + áudio + legenda + crop 1080x1920
  ffmpeg.js              → wrapper de execução do ffmpeg/ffprobe
  index.js               → orquestrador (CLI)
inputs/                  → imagens de cena + projeto.json
output/                  → vídeo final
tmp/                     → clipes intermediários, áudio, srt (por projeto)
```
