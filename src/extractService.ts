import axios, { AxiosRequestConfig } from "axios";
import { load, type CheerioAPI } from "cheerio";
import { HttpsProxyAgent } from "https-proxy-agent";
import dotenv from "dotenv";

dotenv.config();

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/605.1.15"
];

const REFERERS = [
  "https://www.google.com/",
  "https://www.bing.com/",
  "https://duckduckgo.com/",
  "https://search.brave.com/",
  "https://www.yahoo.com/"
];

interface ExtractRequest {
  urls: string | string[];
  timeoutMs?: number;
  limit?: number;
}

interface ExtractResult {
  url: string;
  title: string;
  snippet: string;
  content: string;
  error?: string;
  warnings?: string[];
}

interface ExtractResponse {
  results: ExtractResult[];
  elapsedMs: number;
  warnings?: string[];
}

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomHeaders(): Record<string, string> {
  return {
    "User-Agent": randomChoice(USER_AGENTS),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "max-age=0",
    "Connection": "keep-alive",
    "Referer": randomChoice(REFERERS),
    "DNT": "1",
    "Pragma": "no-cache"
  };
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([.?!,;:\u2014])/g, "$1")
    .trim();
}

function extractTitle($: CheerioAPI): string {
  const metaTitle = $("meta[property='og:title']").attr("content")
    || $("meta[name='twitter:title']").attr("content");
  if (metaTitle) return cleanText(metaTitle);

  const pageTitle = $("title").first().text();
  if (pageTitle) return cleanText(pageTitle);

  return "";
}

function extractDescription($: CheerioAPI): string {
  const description = $("meta[property='og:description']").attr("content")
    || $("meta[name='description']").attr("content")
    || $("meta[name='twitter:description']").attr("content");
  return description ? cleanText(description) : "";
}

function buildRequestConfig(proxy?: string, timeoutMs = 22000): AxiosRequestConfig {
  const config: AxiosRequestConfig = {
    headers: randomHeaders(),
    timeout: timeoutMs,
    responseType: "text",
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400
  };

  if (proxy) {
    try {
      const proxyAgent = new HttpsProxyAgent(proxy);
      config.httpAgent = proxyAgent;
      config.httpsAgent = proxyAgent;
    } catch (error) {
      console.warn("Invalid proxy URL", proxy, error instanceof Error ? error.message : error);
    }
  }

  return config;
}

function detectBlock(html: string | undefined, url: string): boolean {
  if (!html) return true;
  const lower = html.toLowerCase();
  return (
    lower.includes("unusual traffic") ||
    lower.includes("captcha") ||
    lower.includes("your access has been blocked") ||
    lower.includes("please stand by") ||
    lower.includes("denied") ||
    lower.includes("if you're having trouble accessing") ||
    url.includes("sorry") ||
    url.includes("/sorry/")
  );
}

function sentenceSnippet(text: string, maxLength = 240): string {
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let snippet = "";
  for (const sentence of sentences) {
    if ((snippet + sentence).length > maxLength) break;
    snippet += sentence.trim() + " ";
  }
  snippet = snippet.trim();
  return snippet || text.slice(0, maxLength).trim();
}

function extractMainContent($: CheerioAPI): string {
  const selectors = [
    "article",
    "main",
    "[role=main]",
    "div[id*='article']",
    "div[class*='article']",
    "div[id*='content']",
    "div[class*='content']",
    "div[id*='post']",
    "div[class*='post']",
    "section",
    "body"
  ];

  let bestText = "";

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const area = $(element).clone();
      area.find("script,style,noscript,iframe,header,footer,nav,aside,form,svg,canvas,video,button,figure").remove();
      const text = cleanText(area.text());
      if (text.length > bestText.length) {
        bestText = text;
      }
    });

    if (bestText.length > 1200) {
      break;
    }
  }

  if (!bestText) {
    const bodyArea = $("body").clone();
    bodyArea.find("script,style,noscript,iframe,header,footer,nav,aside,form,svg,canvas,video,button,figure").remove();
    bestText = cleanText(bodyArea.text());
  }

  return bestText;
}

function normalizeProxyList(): string[] {
  return (process.env.SEARCH_PROXY_LIST || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((value) => {
      try {
        const parsed = new URL(value);
        return ["http:", "https:"].includes(parsed.protocol);
      } catch {
        return false;
      }
    });
}

class ProxyPool {
  private proxies: string[];
  private index = 0;

  constructor() {
    this.proxies = normalizeProxyList();
  }

  public getNextProxy(): string | undefined {
    if (!this.proxies.length) return undefined;
    const proxy = this.proxies[this.index % this.proxies.length];
    this.index += 1;
    return proxy;
  }
}

export class ExtractService {
  private proxyPool = new ProxyPool();

  public async extract(request: ExtractRequest): Promise<ExtractResponse> {
    const start = Date.now();
    const urls = this.normalizeUrls(request.urls, request.limit);
    const warnings: string[] = [];
    const results: ExtractResult[] = [];
    const timeoutMs = Number(request.timeoutMs || process.env.SEARCH_EXTRACT_TIMEOUT_MS || 22000);

    for (const url of urls) {
      if (!isValidUrl(url)) {
        results.push({
          url,
          title: "",
          snippet: "",
          content: "",
          error: "Invalid URL",
          warnings: []
        });
        continue;
      }

      try {
        results.push(await this.fetchAndParse(url, timeoutMs));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Failed to extract ${url}: ${message}`);
        results.push({
          url,
          title: "",
          snippet: "",
          content: "",
          error: message,
          warnings: []
        });
      }
    }

    return {
      results,
      elapsedMs: Date.now() - start,
      warnings: warnings.length ? warnings : undefined
    };
  }

  private normalizeUrls(raw: string | string[] | undefined, limit?: number): string[] {
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const normalized = list
      .filter(Boolean)
      .map((value) => {
        try {
          return new URL(value).toString();
        } catch {
          return value;
        }
      });

    const unique = Array.from(new Set(normalized));
    return typeof limit === "number" ? unique.slice(0, limit) : unique;
  }

  private async fetchAndParse(url: string, timeoutMs: number): Promise<ExtractResult> {
    const proxy = this.proxyPool.getNextProxy();
    const config = buildRequestConfig(proxy, timeoutMs);
    const response = await axios.get<string>(url, config);
    const html = response.data;
    const finalUrl = (response.request as any)?.res?.responseUrl || url;

    if (detectBlock(html, finalUrl)) {
      throw new Error("Blocked or bot-detection page returned");
    }

    const $ = load(html);
    const title = extractTitle($) || "";
    const description = extractDescription($);
    const content = extractMainContent($);
    const snippet = description || sentenceSnippet(content);

    if (!content) {
      throw new Error("No extractable content found");
    }

    return {
      url: finalUrl,
      title,
      snippet,
      content
    };
  }
}
