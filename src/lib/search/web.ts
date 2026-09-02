export type SearchHit = { title: string; url: string; snippet: string; engine: string };

async function fromTavily(query: string): Promise<SearchHit[] | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: 5, search_depth: "basic" }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (json.results ?? []).map((r) => ({
    title: r.title ?? r.url ?? "result",
    url: r.url ?? "",
    snippet: (r.content ?? "").slice(0, 400),
    engine: "tavily",
  }));
}

async function fromBrave(query: string): Promise<SearchHit[] | null> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (json.web?.results ?? []).map((r) => ({
    title: r.title ?? r.url ?? "result",
    url: r.url ?? "",
    snippet: (r.description ?? "").slice(0, 400),
    engine: "brave",
  }));
}

async function fromSerper(query: string): Promise<SearchHit[] | null> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return null;
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": key },
    body: JSON.stringify({ q: query, num: 5 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { organic?: Array<{ title?: string; link?: string; snippet?: string }> };
  return (json.organic ?? []).map((r) => ({
    title: r.title ?? r.link ?? "result",
    url: r.link ?? "",
    snippet: (r.snippet ?? "").slice(0, 400),
    engine: "serper",
  }));
}

async function fromExa(query: string): Promise<SearchHit[] | null> {
  const key = process.env.EXA_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({ query, numResults: 5, contents: { text: { maxCharacters: 400 } } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; text?: string }> };
  return (json.results ?? []).map((r) => ({
    title: r.title ?? r.url ?? "result",
    url: r.url ?? "",
    snippet: (r.text ?? "").slice(0, 400),
    engine: "exa",
  }));
}

async function fromDuckDuckGo(query: string): Promise<SearchHit[]> {
  const res = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  };
  const hits: SearchHit[] = [];
  if (json.AbstractText) {
    hits.push({
      title: json.Heading || query,
      url: json.AbstractURL || "https://duckduckgo.com",
      snippet: json.AbstractText.slice(0, 400),
      engine: "duckduckgo",
    });
  }
  for (const t of json.RelatedTopics ?? []) {
    if (t.Text && t.FirstURL) {
      hits.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text, engine: "duckduckgo" });
    }
    if (hits.length >= 5) break;
  }
  return hits;
}

export async function searchWeb(query: string): Promise<SearchHit[]> {
  const engines = [fromTavily, fromBrave, fromSerper, fromExa];
  for (const fn of engines) {
    try {
      const hits = await fn(query);
      if (hits?.length) return hits;
    } catch {
      /* next engine */
    }
  }
  try {
    return await fromDuckDuckGo(query);
  } catch {
    return [{ title: query, url: "", snippet: "No se pudo buscar la web ahora.", engine: "none" }];
  }
}

export async function fetchUrlText(url: string) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "NexusBot/1.0 (gateway; +https://nexus.dev)" },
  });
  const raw = await res.text();
  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { url, status: res.status, text: text.slice(0, 8000) };
}

export function searchEnginesWired() {
  return {
    tavily: Boolean(process.env.TAVILY_API_KEY?.trim()),
    brave: Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim()),
    serper: Boolean(process.env.SERPER_API_KEY?.trim()),
    exa: Boolean(process.env.EXA_API_KEY?.trim()),
    duckduckgo: true,
  };
}
