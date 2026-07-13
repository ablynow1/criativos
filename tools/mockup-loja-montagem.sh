#!/bin/bash
# Monta o mockup final de 25.00s a partir dos clipes Veo, espelhando o ritmo de
# cortes do anúncio de referência (Ad Library 34784776947833729):
# reveal → frontal → closes → medium sorrindo → quadro na parede → wide → endcard.
# Editar a tabela SEGMENTS pra ajustar os pontos de corte (clipe, in, out).
set -euo pipefail
cd "$(dirname "$0")/.."

FF=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
[ -x "$FF" ] || FF=ffmpeg
CLIPS=output/mockup-loja/clips
OUT=output/mockup-loja/mockup-loja-greenscreen-25s.mp4

# clipe:in:out  (10 segmentos live = 21.5s; endcard 3.5s fecha 25.00s)
SEGMENTS=(
  "V15:0.2:2.2"  # 1 ABERTURA: giro NATIVO do Veo a partir do K15 (verso = foto
                 #   real do Vitor, aprovado). Verso visivel 0.2-1.6s -> giro ->
                 #   corte NO FLIP em 2.2s (edge-on, quadro mais fino): o reveal
                 #   frontal verde acontece no corte seco pro V2. Cortar aqui
                 #   evita o intervalo bege da frente (~2.4-3.6s) e o reflexo.
  "V2:0.2:2.3"   # 2 frontal medium                                  (2.1s)
  "V1:5.8:7.8"   # 3 wide frontal estavel, sorrindo                  (2.0s)
  "V3:0.4:2.4"   # 4 close glide no quadro                           (2.0s)
  "V4:0.2:2.1"   # 5 maos na borda (antes do push-in forte)          (1.9s)
  "V2:4.2:7.8"   # 6 medium sorrindo push-in                         (3.6s)
  "V5:1.5:3.1"   # 7 parede, ela admirando                           (1.6s)
  "V6:0.3:1.7"   # 8 parede lateral                                  (1.4s)
  "V6:3.2:4.8"   # 9 close parede dolly (quadro inteiro)             (1.6s)
  "V5:4.3:7.5"   # 10 wide parede final                              (3.2s)
)
ENDCARD_DUR=3.6

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

# Endcard branco (placeholder pro logo) + silencio
white=$(( ${#seen[@]} ))
sil=$(( white + 1 ))
inputs+=(-f lavfi -t "$ENDCARD_DUR" -i "color=c=white:s=1080x1920:r=30")
inputs+=(-f lavfi -t "$ENDCARD_DUR" -i "anullsrc=r=48000:cl=stereo")
filter+="[$white:v]setsar=1[v$n];[$sil:a]anull[a$n];"
concat+="[v$n][a$n]"; n=$((n+1))

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
