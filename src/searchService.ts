import axios, { AxiosRequestConfig } from "axios";
import { load } from "cheerio";
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

const ENGINE_ORDER = ["google", "bing", "duckduckgo", "searx"] as const;

type Engine = typeof ENGINE_ORDER[number];

interface SearchRequest {
  query: string;
  engines?: string;
  limit?: number;
}

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  engine: string;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  engines: Engine[];
  engineUsed: string;
  proxyUsed?: string;
  warnings?: string[];
  elapsedMs: number;
}

function isValidProxy(proxyUrl: string): boolean {
  try {
    const url = new URL(proxyUrl);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

class ProxyPool {
  private proxies: string[] = [];
  private index = 0;
  public lastUsedProxy?: string;

  constructor() {
    this.proxies = this.loadProxies();
  }

  private loadProxies(): string[] {
    const list = process.env.SEARCH_PROXY_LIST?.split(",").map((item) => item.trim()).filter(Boolean) || [];
    const proxies = list.filter(isValidProxy);
    if (list.length && !proxies.length) {
      console.warn("SEARCH_PROXY_LIST is set but contains no valid proxy URLs. Falling back to direct connections.");
    }
    return proxies;
  }

  public getAllProxies(): string[] {
    return [...this.proxies];
  }

  public getNextProxy(): string | undefined {
    if (!this.proxies.length) return undefined;
    const proxy = this.proxies[this.index % this.proxies.length];
    this.index += 1;
    this.lastUsedProxy = proxy;
    return proxy;
  }
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
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Dest": "document",
    "Referer": randomChoice(REFERERS),
    "DNT": "1",
    "Pragma": "no-cache"
  };
}

function buildSearchUrl(engine: Engine, query: string, limit: number): string {
  const encoded = encodeURIComponent(query);
  switch (engine) {
    case "google":
      return `https://www.google.com/search?q=${encoded}&num=${Math.min(limit, 10)}`;
    case "bing":
      return `https://www.bing.com/search?q=${encoded}&count=${Math.min(limit, 10)}`;
    case "duckduckgo":
      return `https://html.duckduckgo.com/html?q=${encoded}`;
    case "searx": {
      const base = process.env.SEARCH_SEARX_URL?.replace(/\/+$/, "") || "https://searx.org/search";
      return `${base}?q=${encoded}&format=json&categories=general&count=${Math.min(limit, 10)}`;
    }
  }
}

function buildRequestConfig(proxy?: string): AxiosRequestConfig {
  const headers = randomHeaders();
  const config: AxiosRequestConfig = {
    headers,
    timeout: 22000,
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
      console.warn("Invalid proxy URL", proxy, error);
    }
  }

  return config;
}

function detectBlock(html: string | undefined, url: string): boolean {
  if (!html || typeof html !== "string") return true;
  const lower = html.toLowerCase();
  return (
    lower.includes("unusual traffic") ||
    lower.includes("captcha") ||
    lower.includes("your access has been blocked") ||
    lower.includes("please stand by") ||
    lower.includes("denied") ||
    lower.includes("if you're having trouble accessing google search") ||
    lower.includes("please show you're not a robot") ||
    url.includes("sorry") ||
    url.includes("/sorry/")
  );
}

function normalizeGoogleResultUrl(rawHref: string | undefined): string {
  if (!rawHref || !rawHref.trim()) return "";
  try {
    const parsed = rawHref.startsWith("http")
      ? new URL(rawHref)
      : new URL(rawHref, "https://www.google.com");

    if (parsed.hostname === "www.google.com" && parsed.pathname === "/url") {
      return parsed.searchParams.get("q") || rawHref;
    }

    return parsed.toString();
  } catch {
    return rawHref;
  }
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function tryDecodeBingTargetUrl(target: string | null): string | undefined {
  if (!target) return undefined;

  try {
    const decoded = decodeURIComponent(target);
    if (isValidUrl(decoded)) return decoded;

    const candidate = decoded.startsWith("a1") || decoded.startsWith("a2")
      ? decoded.slice(2)
      : decoded;

    if (/^[A-Za-z0-9+/=]+$/.test(candidate)) {
      const buffered = Buffer.from(candidate, "base64").toString("utf8");
      if (isValidUrl(buffered)) return buffered;
    }
  } catch {
    // ignore invalid decode attempts
  }

  return undefined;
}

function normalizeBingResultUrl(rawUrl: string): string {
  if (!rawUrl || !rawUrl.trim()) return "";
  try {
    const parsed = rawUrl.startsWith("http")
      ? new URL(rawUrl)
      : new URL(rawUrl, "https://www.bing.com");

    if (parsed.hostname.endsWith("bing.com") && parsed.pathname.startsWith("/ck/a")) {
      const target = parsed.searchParams.get("u") || parsed.searchParams.get("q");
      const decoded = tryDecodeBingTargetUrl(target);
      if (decoded) return decoded;
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function parseGoogle(html: string | undefined, limit: number): SearchResult[] {
  if (!html || typeof html !== "string") return [];
  const $ = load(html);
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  const extractSnippet = (element: any): string => {
    return element
      .find("div.VwiC3b, div.IsZvec, span.aCOpRe, div.BNeawe.s3v9rd, div.MjjYud, div.s3v9rd")
      .first()
      .text()
      .trim();
  };

  const pushResult = (element: any) => {
    if (results.length >= limit) return;

    const anchor = element.find("div.yuRUbf > a, a[href]").first();
    const title = anchor.find("h3").text().trim() || element.find("h3").text().trim();
    const rawUrl = anchor.attr("href") || "";
    const url = normalizeGoogleResultUrl(rawUrl);
    const snippet = extractSnippet(element);

    if (title && url && !seenUrls.has(url) && !url.startsWith("/search?") && !url.includes("google.com/search")) {
      seenUrls.add(url);
      results.push({ title, snippet, url, engine: "google" });
    }
  };

  $("div.tF2Cxc, div.g, div.yuRUbf").each((_, element) => {
    if (results.length >= limit) return;
    pushResult($(element));
  });

  return results.slice(0, limit);
}

function parseBing(html: string | undefined, limit: number): SearchResult[] {
  if (!html || typeof html !== "string") return [];
  const $ = load(html);
  const results: SearchResult[] = [];

  $("li.b_algo").each((_, element) => {
    if (results.length >= limit) return;
    const title = $(element).find("h2").text().trim();
    const rawUrl = $(element).find("h2 a").attr("href") || "";
    const url = normalizeBingResultUrl(rawUrl);
    const snippet = $(element).find("p").text().trim();
    if (title && url) {
      results.push({ title, snippet, url, engine: "bing" });
    }
  });

  return results;
}

function parseDuckDuckGo(html: string | undefined, limit: number): SearchResult[] {
  if (!html || typeof html !== "string") return [];
  const $ = load(html);
  const results: SearchResult[] = [];

  $("div.result").each((_, element) => {
    if (results.length >= limit) return;
    const title = $(element).find("a.result__a").text().trim() || $(element).find("a").text().trim();
    const url = $(element).find("a.result__a").attr("href") || $(element).find("a").attr("href") || "";
    const snippet = $(element).find("a.result__snippet, div.result__snippet").text().trim();
    if (title && url) {
      results.push({ title, snippet, url, engine: "duckduckgo" });
    }
  });

  return results;
}

function parseSearxJson(jsonText: string, limit: number): SearchResult[] {
  try {
    const payload = JSON.parse(jsonText);
    return (payload.results || []).slice(0, limit).map((item: any) => ({
      title: item.title || "",
      snippet: item.content || item.description || "",
      url: item.url || item.link || "",
      engine: "searx"
    })).filter((item: SearchResult) => item.title && item.url);
  } catch {
    return [];
  }
}

export class SearchService {
  private proxyPool = new ProxyPool();

  public async search(request: SearchRequest): Promise<SearchResponse> {
    const start = Date.now();
    const limit = Math.min(Number(request.limit || 6), 10);
    const engines = this.normalizeEngines(request.engines);
    const warnings: string[] = [];
    const aggregated: SearchResult[] = [];
    let engineUsed = engines[0];
    let proxyUsed: string | undefined;

    for (const engine of engines) {
      try {
        const engineResults = await this.executeEngineWithRetries(engine, request.query, limit, warnings);
        if (engineResults.length > 0) {
          engineUsed = engine;
          if (!proxyUsed) proxyUsed = this.proxyPool.lastUsedProxy;
          const deduped = engineResults.filter((result) => !aggregated.some((existing) => existing.url === result.url));
          aggregated.push(...deduped);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Search engine failed and will continue", { engine, message, stack: error instanceof Error ? error.stack : undefined });
        warnings.push(`engine ${engine} failed: ${message}`);
      }

      if (aggregated.length >= limit) break;
    }

    if (!aggregated.length) {
      warnings.push("Search service failed to return results. Configure SEARCH_PROXY_LIST or SEARCH_SEARX_URL for better reliability.");
    }

    return {
      query: request.query,
      results: aggregated.slice(0, limit),
      engines,
      engineUsed,
      proxyUsed,
      warnings: warnings.length ? warnings : undefined,
      elapsedMs: Date.now() - start
    };
  }

  private normalizeEngines(engines?: string): Engine[] {
    if (!engines) return [...ENGINE_ORDER];
    const requested = engines.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    const filtered = requested.filter((engine): engine is Engine => ENGINE_ORDER.includes(engine as Engine));
    return filtered.length ? filtered : [...ENGINE_ORDER];
  }

  private async executeEngineWithRetries(engine: Engine, query: string, limit: number, warnings: string[]): Promise<SearchResult[]> {
    const proxies = this.proxyPool.getAllProxies().slice(0, 2);
    const targets = proxies.length ? [...proxies, undefined] : [undefined];
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < targets.length; attempt += 1) {
      const proxy = targets[attempt];
      try {
        if (proxy) {
          this.proxyPool.lastUsedProxy = proxy;
        }
        return await this.tryEngine(engine, query, limit, proxy);
      } catch (error) {
        lastError = error as Error;
        console.error("Search engine attempt failed", {
          engine,
          attempt: attempt + 1,
          proxy,
          message: lastError.message,
          stack: lastError.stack
        });
        warnings.push(`engine ${engine} attempt ${attempt + 1} failed${proxy ? ` using proxy ${proxy}` : " direct"}: ${lastError.message}`);
      }
      await this.randomSleep(500 + Math.random() * 400);
    }

    if (lastError) throw lastError;
    return [];
  }

  private async tryEngine(engine: Engine, query: string, limit: number, proxy?: string): Promise<SearchResult[]> {
    const url = buildSearchUrl(engine, query, limit);
    const config = buildRequestConfig(proxy);
    const response = await axios.get<string>(url, config);
    const html = response.data;
    const finalUrl = response.request?.res?.responseUrl || url;

    if (detectBlock(html, finalUrl)) {
      throw new Error("bot detection or block triggered");
    }

    try {
      const results = this.parseEngineResponse(engine, html, limit);
      if (!results.length) {
        throw new Error("no results parsed");
      }
      return results;
    } catch (error) {
      console.error("Search parsing failed", {
        engine,
        url,
        proxy,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  private parseEngineResponse(engine: Engine, body: string, limit: number): SearchResult[] {
    switch (engine) {
      case "google":
        return parseGoogle(body, limit);
      case "bing":
        return parseBing(body, limit);
      case "duckduckgo":
        return parseDuckDuckGo(body, limit);
      case "searx":
        return parseSearxJson(body, limit);
    }
  }

  private async randomSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
