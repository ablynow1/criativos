#!/bin/bash
# Monta os 25.00s do mockup em MODO NATIVO (arte aplicada nos keyframes ANTES
# do Veo — clipes V1A..V6A, sem chroma na pós): a arte é parte da cena, com luz
# e movimento nativos do próprio vídeo. Abertura V15 (verso real) é a mesma da
# montagem verde — o verde nunca aparece no trecho usado.
# Fluxo: tools/mockup-art-keyframes.py -> mockup-loja.mjs clips V1A..V6A -> este script.
# Editar a tabela SEGMENTS pra ajustar os pontos de corte (clipe, in, out).
set -euo pipefail
cd "$(dirname "$0")/.."

FF=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
[ -x "$FF" ] || FF=ffmpeg
CLIPS=output/mockup-loja/clips
OUT=output/mockup-loja/mockup-pastor-nativo-25s.mp4

# clipe:in:out — mesmo desenho de ritmo da montagem verde (10 segmentos,
# -t 25 crava 25.00s, fecho na parede). Pontos de corte AFINADOS pros takes
# novos dos V*A (takes diferentes = timing diferente do verde).
# SEM V1A: o keyframe K1A (wide 45° com arte) foi bloqueado 4x pelo RAI do
# Veo (3x giro + 1x sem giro = e' a imagem, nao o movimento). O beat wide ja'
# existe na abertura V15; o slot vira duas janelas PROGRESSIVAS do V4A
# (aberto -> fechado, le como push-in intencional de UGC).
SEGMENTS=(
  "V15:0.2:2.2"   # 1 ABERTURA: verso real -> giro -> corte no edge-on
  "V2A:0.2:2.6"   # 2 frontal medium
  "V4A:0.2:2.15"  # 3 maos na borda (quadro inteiro + rosto)
  "V3A:0.4:2.45"  # 4 close glide no quadro
  "V4A:2.7:4.85"  # 5 maos na borda, mais fechado (progressao do 3)
  "V2A:4.1:7.8"   # 6 medium sorrindo push-in
  "V5A:1.0:3.2"   # 7 parede, ela admirando
  "V6A:0.3:2.0"   # 8 parede lateral
  "V6A:2.2:4.4"   # 9 close parede dolly (take novo e' mais rapido que o V6
                  #   verde: em 5.0s ja' era so' o focinho — 4.4s fecha com a
                  #   moldura ainda visivel nos 3 lados)
  "V5A:3.0:7.9"   # 10 wide parede final (fecho, hold no produto)
)

inputs=(); filter=""; concat=""; n=0
declare -a seen=()
idx_of() { local c=$1 i=0; for s in "${seen[@]:-}"; do [ "$s" = "$c" ] && { echo $i; return; }; i=$((i+1)); done; echo -1; }

for seg in "${SEGMENTS[@]}"; do
  IFS=: read -r clip tin tout <<< "$seg"
  i=$(idx_of "$clip")
  if [ "$i" = "-1" ]; then
    inputs+=(-i "$CLIPS/$clip.mp4"); seen+=("$clip"); i=$((${#seen[@]}-1))
  fi
  filter+="[$i:v]trim=start=$tin:end=$tout,setpts=PTS-STARTPTS,fps=30,scale=1080:1920,setsar=1[v$n];"
  filter+="[$i:a]atrim=start=$tin:end=$tout,asetpts=PTS-STARTPTS,aresample=48000[a$n];"
  concat+="[v$n][a$n]"; n=$((n+1))
done

filter+="${concat}concat=n=$n:v=1:a=1[vc][ac];[ac]loudnorm=I=-16:TP=-1.5:LRA=11[aout]"

"$FF" -y -v error "${inputs[@]}" \
  -filter_complex "$filter" \
  -map "[vc]" -map "[aout]" \
  -t 25 \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -movflags +faststart \
  "$OUT"

echo "--- resultado ---"
FP=/opt/homebrew/opt/ffmpeg-full/bin/ffprobe; [ -x "$FP" ] || FP=ffprobe
"$FP" -v error -show_entries format=duration -of default=noprint_wrappers=1 "$OUT"
echo "$OUT"
