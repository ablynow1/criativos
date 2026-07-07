// Presets de estilo de legenda (libass force_style). Cores em formato ASS: &HAABBGGRR.
export const SUBTITLE_STYLES = {
  // Caixa preta sólida atrás do texto — clássico, sempre legível.
  caixa:
    'FontName=Arial,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=0,Alignment=2,MarginV=120',

  // Texto grande em negrito com contorno preto grosso, sem caixa de fundo (estilo Hormozi/MrBeast).
  contorno:
    'FontName=Arial Black,FontSize=22,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=4,Shadow=0,Alignment=2,MarginV=160',
};

export function getSubtitleStyle(name = 'caixa') {
  const style = SUBTITLE_STYLES[name];
  if (!style) {
    throw new Error(`Estilo de legenda desconhecido: "${name}". Opções: ${Object.keys(SUBTITLE_STYLES).join(', ')}`);
  }
  return style;
}
