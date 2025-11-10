const TARGET_HOST = "its.jinju.go.kr";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CACHE_TTL_SEC = 300; // 정적 리소스는 좀 더 길게

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const u = url.searchParams.get("u");
    if (!u) return new Response("u query required", { status: 400 });

    const parsed = new URL(u);
    if (parsed.host !== TARGET_HOST) {
      return new Response("forbidden host", { status: 403 });
    }

    const upstream = await fetch(u, {
      headers: { "User-Agent": USER_AGENT, "Referer": `https://${TARGET_HOST}/` }
    });
    if (!upstream.ok) {
      return new Response(`res upstream ${upstream.status}`, { status: upstream.status });
    }

    const body = await upstream.arrayBuffer();
    const type = upstream.headers.get("content-type") || "application/octet-stream";

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": `public, max-age=${CACHE_TTL_SEC}`
      }
    });
  } catch (e) {
    return new Response("res proxy failed: " + e.message, { status: 502 });
  }
};
