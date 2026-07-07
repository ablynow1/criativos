/**
 * Baixa uma landing page e extrai o texto da copy + metadados básicos.
 * Sem headless browser: funciona pra LPs server-rendered. SPAs client-side
 * podem vir vazias — nesse caso o campo textContent fica curto e o chamador avisa.
 */
export async function scrapeLandingPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Falha ao baixar a LP (${res.status}): ${url}`);
  }
  const html = await res.text();

  const pick = (regex) => {
    const match = html.match(regex);
    return match ? match[1].trim() : null;
  };

  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const ogTitle = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const ogDescription = pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const ogImage = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);

  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return { url, title, metaDescription, ogTitle, ogDescription, ogImage, textContent };
}
