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
