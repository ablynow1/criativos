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

# clipe:in:out  (10 segmentos = 25.15s; -t 25 crava 25.00s. SEM endcard —
# Vitor pediu; os 3.6s do card branco viraram mais tempo de cena, com o fecho
# na parede (produto pendurado), espelhando o final do anuncio de referencia.)
SEGMENTS=(
  "V15:0.2:2.2"  # 1 ABERTURA: giro NATIVO do Veo a partir do K15 (verso = foto
                 #   real do Vitor, aprovado). Verso visivel 0.2-1.6s -> giro ->
                 #   corte NO FLIP em 2.2s (edge-on, quadro mais fino): o reveal
                 #   frontal verde acontece no corte seco pro V2. Cortar aqui
                 #   evita o intervalo bege da frente (~2.4-3.6s) e o reflexo.
  "V2:0.2:2.35"  # 2 frontal medium                                  (2.15s)
  "V1:5.6:7.9"   # 3 wide frontal estavel, sorrindo                  (2.30s)
  "V3:0.4:2.45"  # 4 close glide no quadro                           (2.05s)
  "V4:0.2:2.15"  # 5 maos na borda (antes do push-in forte)          (1.95s)
  "V2:4.1:7.8"   # 6 medium sorrindo push-in                         (3.70s)
  "V5:1.0:3.2"   # 7 parede, ela admirando                           (2.20s)
  "V6:0.3:2.0"   # 8 parede lateral                                  (1.70s)
  "V6:2.8:5.0"   # 9 close parede dolly (quadro inteiro)             (2.20s)
  "V5:3.0:7.9"   # 10 wide parede final (fecho, hold no produto)     (4.90s)
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
