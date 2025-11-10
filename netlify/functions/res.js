const TARGET_HOST = "its.jinju.go.kr";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CACHE_TTL_SEC = 300;

function rewriteCssUrls(cssText, base) {
  // url( ... ) 패턴 모두 찾아 절대경로로 → /_res?u=...
  return cssText.replace(/url\\(([^)]+)\\)/g, (m, raw) => {
    let u = String(raw).trim().replace(/^['"]|['"]$/g, "");
    try {
      const abs = new URL(u, base).toString();
      return "url(/_res?u=" + encodeURIComponent(abs) + ")";
    } catch {
      return m;
    }
  });
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const u = url.searchParams.get("u");
    if (!u) return new Response("u query required", { status: 400 });

    const parsed = new URL(u);
    if (parsed.host !== TARGET_HOST) return new Response("forbidden host", { status: 403 });

    const upstream = await fetch(u, {
      headers: { "User-Agent": USER_AGENT, "Referer": `https://${TARGET_HOST}/` }
    });
    if (!upstream.ok) return new Response(`upstream ${upstream.status}`, { status: upstream.status });

    const contentType = upstream.headers.get("content-type") || "";
    const isCss = contentType.includes("text/css");
    if (isCss) {
      const text = await upstream.text();
      const rewritten = rewriteCssUrls(text, parsed.toString());
      return new Response(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": `public, max-age=${CACHE_TTL_SEC}`
        }
      });
    } else {
      const buf = await upstream.arrayBuffer();
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": contentType || "application/octet-stream",
          "Cache-Control": `public, max-age=${CACHE_TTL_SEC}`
        }
      });
    }
  } catch (e) {
    return new Response("res proxy failed: " + e.message, { status: 502 });
  }
};
