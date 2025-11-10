// netlify/functions/res.js
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TTL = 300;

// 여러 도메인이 필요하면 여기에 추가
const ALLOW_HOSTS = new Set([
  "its.jinju.go.kr"
]);

function rewriteCssUrls(cssText, base, selfOrigin) {
  // CSS 내부 url(...) → 우리 프록시 절대경로로
  return cssText.replace(/url\(([^)]+)\)/g, (m, raw) => {
    let u = String(raw).trim().replace(/^['"]|['"]$/g, "");
    try {
      const abs = new URL(u, base).toString();
      return `url(${selfOrigin}/_res?u=${encodeURIComponent(abs)})`;
    } catch { return m; }
  });
}

export const handler = async (event) => {
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host  = event.headers["x-forwarded-host"] || event.headers["host"];
  const selfOrigin = `${proto}://${host}`; // 우리 절대오리진

  try {
    const u = (event.queryStringParameters && event.queryStringParameters.u) || "";
    if (!u) return { statusCode: 400, body: "u query required" };

    const parsed = new URL(u);
    if (!ALLOW_HOSTS.has(parsed.host)) return { statusCode: 403, body: "forbidden host" };

    const r = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": UA,
        "Referer": `https://${parsed.host}/`,
        "Accept": "*/*",
        "Accept-Language": "ko,ko-KR;q=0.9,en;q=0.8"
      },
      redirect: "follow"
    });

    if (!r.ok) {
      return { statusCode: r.status, body: `upstream ${r.status} ${parsed.pathname}` };
    }

    const ct = r.headers.get("content-type") || "";
    if (ct.includes("text/css")) {
      const text = await r.text();
      const rewritten = rewriteCssUrls(text, parsed.toString(), selfOrigin);
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": `public, max-age=${TTL}`
        },
        body: rewritten
      };
    }

    const buf = Buffer.from(await r.arrayBuffer());
    return {
      statusCode: 200,
      headers: {
        "Content-Type": ct || "application/octet-stream",
        "Cache-Control": `public, max-age=${TTL}`
      },
      isBase64Encoded: true,
      body: buf.toString("base64")
    };
  } catch (e) {
    return { statusCode: 502, body: "res proxy failed: " + e.message };
  }
};
