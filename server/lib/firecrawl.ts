import { z } from 'zod';

// ─── Response schema from Firecrawl v1 /scrape ────────────────────────────────
const FirecrawlMetadataSchema = z.object({
  title:         z.string().optional(),
  description:   z.string().optional(),
  author:        z.string().optional(),
  publishedTime: z.string().optional(),
  ogImage:       z.string().optional(),
  sourceURL:     z.string().optional(),
  statusCode:    z.number().optional(),
}).passthrough();

const FirecrawlDataSchema = z.object({
  markdown: z.string().optional(),
  metadata: FirecrawlMetadataSchema.optional(),
});

const FirecrawlResponseSchema = z.object({
  success: z.boolean(),
  data:    FirecrawlDataSchema.optional(),
  error:   z.string().optional(),
});

export interface ScrapedArticle {
  title:       string;
  author:      string;
  publishDate: string;
  domain:      string;
  source:      string;
  bodyText:    string;
  description: string;
}

// ─── URL Normalization & Validation ───────────────────────────────────────────
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function isValidUrl(url: string): boolean {
  try {
    const u = new URL(normalizeUrl(url));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ─── Domain → source name ────────────────────────────────────────────────────
export function domainToSource(domain: string): string {
  const parts = domain.replace('www.', '').split('.');
  const name  = parts[0] ?? domain;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─── HTML Entity Decoding ─────────────────────────────────────────────────────
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ─── Native Web Scraper (Fallback & Standalone) ──────────────────────────────
async function scrapeDirectHtml(targetUrl: string): Promise<ScrapedArticle> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  const domain = (() => {
    try { return new URL(targetUrl).hostname.replace('www.', ''); }
    catch { return 'unknown'; }
  })();

  let html = '';
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (ManipuLens/2.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    html = await res.text();
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Connection timed out while fetching URL content.');
    }
    throw new Error(`Could not access webpage: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  // 1. Extract metadata
  const getMeta = (prop: string): string => {
    const match =
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["'][^>]+content=["']([^"']*)["']`, 'i')) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["']`, 'i'));
    return match ? decodeHtmlEntities(match[1].trim()) : '';
  };

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
  const title = getMeta('title') ||
    (titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : '') ||
    (h1Match ? decodeHtmlEntities(h1Match[1].trim()) : '') ||
    `Article from ${domain}`;

  const description = getMeta('description') || '';
  const author = getMeta('author') || getMeta('article:author') || getMeta('creator') || 'Unknown Author';

  const publishedTimeRaw = getMeta('published_time') || getMeta('publication_date') || getMeta('date');
  const publishDate = (() => {
    if (!publishedTimeRaw) {
      // Try searching for time tag
      const timeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
      const raw = timeMatch ? timeMatch[1] : null;
      if (!raw) return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const d = new Date(raw);
      return isNaN(d.getTime()) ? raw : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    const d = new Date(publishedTimeRaw);
    return isNaN(d.getTime())
      ? publishedTimeRaw
      : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  })();

  // 2. Extract clean body text
  // Remove non-content elements
  let cleanHtml = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '');

  // Look for main article containers if available
  const articleBlock =
    cleanHtml.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
    cleanHtml.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    cleanHtml.match(/<div\b[^>]*(?:class|id)=["'][^"']*(?:article-body|story-body|post-content|entry-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

  const contentSource = articleBlock ? articleBlock[1] : cleanHtml;

  // Extract text from paragraphs, headings, list items
  const paragraphMatches = contentSource.match(/<(?:p|h[1-6]|li)\b[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|li)>/gi) || [];
  let extractedParagraphs: string[] = [];

  for (const block of paragraphMatches) {
    const rawText = block.replace(/<[^>]+>/g, ' ');
    const decoded = decodeHtmlEntities(rawText).replace(/\s+/g, ' ').trim();
    if (decoded.length > 25) {
      extractedParagraphs.push(decoded);
    }
  }

  let bodyText = extractedParagraphs.join('\n\n').trim();

  // If paragraph extraction yielded too little, fallback to stripping all tags
  if (bodyText.length < 100) {
    const fallbackText = decodeHtmlEntities(contentSource.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (fallbackText.length >= 50) {
      bodyText = fallbackText;
    }
  }

  bodyText = bodyText.substring(0, 15_000);

  if (bodyText.length < 50) {
    throw new Error('The webpage does not contain enough readable article text to analyze. You can copy and paste the text directly.');
  }

  return {
    title,
    author,
    publishDate,
    domain,
    source: domainToSource(domain),
    bodyText,
    description,
  };
}

// ─── Firecrawl scrape with fallback ──────────────────────────────────────────
export async function scrapeUrl(rawUrl: string): Promise<ScrapedArticle> {
  const url = normalizeUrl(rawUrl);
  if (!isValidUrl(url)) {
    throw new Error('Invalid URL format. Please provide a valid web address (e.g. https://example.com/article).');
  }

  // 1. Try Firecrawl if key is configured
  if (process.env.FIRECRAWL_API_KEY && process.env.FIRECRAWL_API_KEY.trim() !== '') {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 12_000);

    try {
      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          url,
          formats:         ['markdown'],
          onlyMainContent: true,
          waitFor:         800,
        }),
        signal: controller.signal,
      });

      if (res.ok) {
        const json = await res.json();
        const parsed = FirecrawlResponseSchema.safeParse(json);
        if (parsed.success && parsed.data.success && parsed.data.data) {
          const { markdown = '', metadata = {} } = parsed.data.data;
          const domain = (() => {
            try { return new URL(url).hostname.replace('www.', ''); }
            catch { return 'unknown'; }
          })();

          const bodyText = markdown
            .replace(/!\[.*?\]\(.*?\)/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/#{1,6}\s*/g, '')
            .trim()
            .substring(0, 15_000);

          if (bodyText.length >= 50) {
            const publishDate = (() => {
              if (!metadata.publishedTime) {
                return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
              }
              const d = new Date(metadata.publishedTime);
              return isNaN(d.getTime())
                ? metadata.publishedTime
                : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            })();

            return {
              title:       metadata.title       ?? `Article from ${domain}`,
              author:      metadata.author      ?? 'Unknown Author',
              publishDate,
              domain,
              source:      domainToSource(domain),
              bodyText,
              description: metadata.description ?? '',
            };
          }
        }
      } else {
        console.warn(`[Firecrawl] HTTP ${res.status}: ${res.statusText}. Falling back to direct scraper…`);
      }
    } catch (err) {
      console.warn('[Firecrawl] Scrape failed, falling back to direct scraper…', (err as Error).message);
    } finally {
      clearTimeout(timeout);
    }
  }

  // 2. Direct native HTML scraper (universal fallback)
  return await scrapeDirectHtml(url);
}
