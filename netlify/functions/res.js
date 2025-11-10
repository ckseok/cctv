const TARGET_HOST = "its.jinju.go.kr";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TTL = 300;

function rewriteCssUrls(cssText, base) {
  return cssText.replace(/url\\(([^)]+)\\)/g, (m, raw) => {
    let u = String(raw).trim().replace(/^['"]|['"]$/g, "");
    try {
      const abs = new URL(u, base).toString();
      const selfOrigin = (typeof location !== "undefined") ? location.origin : ""; // 런타임 X, 서버에서 결정 불가
      // 서버 사이드에선 요청 URL에서 오리진을 가져온다:
      return "url(" + "/_res?u=" + encodeURIComponent(abs) + ")";
    } catch { return m; }
  });
}

export default async (req) => {
  try {
    const { origin } = new URL(req.url);               // ★ 우리 오리진
    const u = new URL(req.url).searchParams.get("u");
    if (!u) return new Response("u query required", { status: 400 });

    const parsed = new URL(u);
    if (parsed.host !== TARGET_HOST) return new Response("forbidden host", { status: 403 });

    const r = await fetch(parsed.toString(), {
      headers: { "User-Agent": UA, "Referer": `https://${TARGET_HOST}/` },
      redirect: "follow"
    });
    if (!r.ok) return new Response(`upstream ${r.status}`, { status: r.status });

    const ct = r.headers.get("content-type") || "";
    if (ct.includes("text/css")) {
      const text = await r.text();
      const rewritten = rewriteCssUrls(text, parsed.toString())
        // CSS 안에서 /_res 를 상대경로로 썼으니 base에 끌려가지 않도록 절대 경로로 치환
        .replace(/url\\(\\/_res/g, "url(" + origin + "/_res");    // ★ 절대화
      return new Response(rewritten, {
        status: 200,
        headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": `public, max-age=${TTL}` }
      });
    } else {
      const buf = await r.arrayBuffer();
      return new Response(buf, {
        status: 200,
        headers: { "Content-Type": ct || "application/octet-stream", "Cache-Control": `public, max-age=${TTL}` }
      });
    }
  } catch (e) {
    return new Response("res proxy failed: " + e.message, { status: 502 });
  }
};
