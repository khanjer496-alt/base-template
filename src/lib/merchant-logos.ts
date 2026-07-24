/**
 * Maps known merchant names to their website domains so we can fetch their
 * favicon/logo at runtime from Google's public favicon service. No brand
 * assets are bundled with the app; unknown merchants (or offline devices)
 * fall back to the category emoji.
 */

const MERCHANT_DOMAINS: [keyword: string, domain: string][] = [
  ['carrefour', 'carrefouruae.com'],
  ['lulu', 'luluhypermarket.com'],
  ['spinneys', 'spinneys.com'],
  ['talabat', 'talabat.com'],
  ['deliveroo', 'deliveroo.ae'],
  ['careem', 'careem.com'],
  ['rta', 'rta.ae'],
  ['nol', 'rta.ae'],
  ['salik', 'salik.ae'],
  ['enoc', 'enoc.com'],
  ['eppco', 'enoc.com'],
  ['adnoc', 'adnocdistribution.ae'],
  ['dewa', 'dewa.gov.ae'],
  ['sewa', 'sewa.gov.ae'],
  ['etisalat', 'etisalat.ae'],
  ['du ', 'du.ae'],
  ['dubai mall', 'thedubaimall.com'],
  ['vox', 'voxcinemas.com'],
  ['fitness first', 'fitnessfirstme.com'],
  ['aster', 'asterdmhealthcare.com'],
  ['dubai cares', 'dubaicares.ae'],
  ['amazon', 'amazon.ae'],
  ['noon', 'noon.com'],
  ['emirates nbd', 'emiratesnbd.com'],
  ['fab', 'bankfab.com'],
  ['adcb', 'adcb.com'],
  ['emirates', 'emirates.com'],
  ['flydubai', 'flydubai.com'],
  ['ikea', 'ikea.com'],
  ['sharaf dg', 'sharafdg.com'],
  ['starbucks', 'starbucks.ae'],
  ['mcdonald', 'mcdonalds.ae'],
  ['kfc', 'kfc.me'],
  // Online subscriptions
  ['chatgpt', 'openai.com'],
  ['chat gpt', 'openai.com'],
  ['openai', 'openai.com'],
  ['claude', 'claude.ai'],
  ['anthropic', 'claude.ai'],
  ['netflix', 'netflix.com'],
  ['spotify', 'spotify.com'],
  ['anghami', 'anghami.com'],
  ['real-debrid', 'real-debrid.com'],
  ['real debrid', 'real-debrid.com'],
  ['osn', 'osn.com'],
  ['shahid', 'shahid.net'],
  ['starz', 'starzplay.com'],
  ['youtube', 'youtube.com'],
  ['apple', 'apple.com'],
  ['icloud', 'apple.com'],
  ['google one', 'one.google.com'],
  ['google storage', 'one.google.com'],
  ['google', 'google.com'],
  ['prime video', 'primevideo.com'],
  ['disney', 'disneyplus.com'],
  ['hbo', 'max.com'],
  ['deezer', 'deezer.com'],
  ['audible', 'audible.com'],
  ['linkedin', 'linkedin.com'],
  ['dropbox', 'dropbox.com'],
  ['adobe', 'adobe.com'],
  ['canva', 'canva.com'],
  ['microsoft', 'microsoft.com'],
  ['office 365', 'microsoft.com'],
  ['discord', 'discord.com'],
  ['notion', 'notion.so'],
  ['github', 'github.com'],
  ['telegram', 'telegram.org'],
  ['xbox', 'xbox.com'],
  ['playstation', 'playstation.com'],
  ['psn', 'playstation.com'],
  ['steam', 'steampowered.com'],
  ['paypal', 'paypal.com'],
  ['gymnation', 'gymnation.com'],
  ['classpass', 'classpass.com'],
  ['homebox', 'homeboxstores.com'],
  ['zoom', 'zoom.us'],
  ['uber', 'uber.com'],
  ['instashop', 'instashop.com'],
  ['smiles', 'smiles.ae'],
  ['zomato', 'zomato.com'],
  ['namshi', 'namshi.com'],
  ['shein', 'shein.com'],
  ['aliexpress', 'aliexpress.com'],
  // UAE banks (sender IDs / account names)
  ['adib', 'adib.ae'],
  [' dib ', 'dib.ae'],
  ['dubai islamic', 'dib.ae'],
  ['mashreq', 'mashreqbank.com'],
  ['rakbank', 'rakbank.ae'],
  ['rak bank', 'rakbank.ae'],
  [' cbd ', 'cbd.ae'],
  ['hsbc', 'hsbc.ae'],
  ['emirates islamic', 'emiratesislamic.ae'],
  ['sharjah islamic', 'sib.ae'],
  [' sib ', 'sib.ae'],
  [' nbf ', 'nbf.ae'],
  [' wio ', 'wio.io'],
  [' liv ', 'liv.me'],
  ['ajman bank', 'ajmanbank.ae'],
  [' cbi ', 'cbi.ae'],
];

export function merchantDomain(title: string): string | null {
  const t = ` ${title.toLowerCase()} `;
  for (const [keyword, domain] of MERCHANT_DOMAINS) {
    if (t.includes(keyword)) return domain;
  }
  return null;
}

export function merchantLogoUrl(title: string): string | null {
  const domain = merchantDomain(title);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}
