/**
 * Semáforo com cooldown global de cota — a fundação de todo o paralelismo.
 *
 * Por que não um p-limit qualquer: o 429 da Vertex é POR MINUTO e vale pra
 * todas as chamadas em voo. Quando uma leva 429, as outras N-1 disparando em
 * seguida só queimam a mesma cota. O cooldown aqui é COMPARTILHADO: uma
 * chamada esfriou, todas esperam juntas — e retomam juntas.
 *
 * const lim = makeLimiter({ max: 3 });
 * await lim.run(() => img2img({...}));     // no máximo 3 em voo
 * lim.cool(30_000);                        // 429: todo mundo espera 30s
 */
export function makeLimiter({ max = 3 } = {}) {
  let ativo = 0;
  let esfriaAte = 0;
  const fila = [];

  const proximo = () => {
    if (ativo < max && fila.length) {
      ativo += 1;
      fila.shift()();
    }
  };

  return {
    cool(ms) { esfriaAte = Math.max(esfriaAte, Date.now() + ms); },

    async run(fn) {
      await new Promise((r) => { fila.push(r); proximo(); });
      try {
        // respeita o cooldown JÁ DENTRO do slot: quem entrou não fura a fila,
        // só espera o gelo passar
        for (let espera = esfriaAte - Date.now(); espera > 0; espera = esfriaAte - Date.now()) {
          await new Promise((r) => setTimeout(r, Math.min(espera, 5000)));
        }
        return await fn();
      } catch (err) {
        // cota estourada esfria TODOS — retentar em paralelo só queima mais
        if (/429|RESOURCE_EXHAUSTED|quota/i.test(err?.message || '')) this.cool(30_000);
        throw err;
      } finally {
        ativo -= 1;
        proximo();
      }
    },
  };
}
