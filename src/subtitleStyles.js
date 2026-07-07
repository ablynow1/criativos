// Presets de estilo de legenda (libass force_style). Cores em formato ASS: &HAABBGGRR.
export const SUBTITLE_STYLES = {
  // Caixa preta sólida atrás do texto — clássico, sempre legível.
  caixa:
    'FontName=Arial,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=0,Alignment=2,MarginV=120',

  // Texto grande em negrito com contorno preto grosso, sem caixa de fundo (estilo Hormozi/MrBeast).
  // FontSize=7 (1/3 de 22). Alignment usa numeração SSA legada (não numpad ASS):
  // 10 = meio-centro da tela (não 5 — esse é top-left nessa numeração).
  contorno:
    'FontName=Arial Black,FontSize=7,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=10,MarginV=0',
};

export function getSubtitleStyle(name = 'caixa') {
  const style = SUBTITLE_STYLES[name];
  if (!style) {
    throw new Error(`Estilo de legenda desconhecido: "${name}". Opções: ${Object.keys(SUBTITLE_STYLES).join(', ')}`);
  }
  return style;
}
