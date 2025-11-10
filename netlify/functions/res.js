// netlify/functions/res.js
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TTL = 300;

// 필요 시 추가 호스트를 여기에 넣으세요.
const ALLOW_HOSTS = new Set(["its.jinju.go.kr"]);

function mustTreatAsCss(contentType, urlStr) {
  const ct = (contentType || "").toLowerCase();
  return ct.includes("text/css") || /\.css(\?|#|$)/i.test(urlStr);
}

function rewriteCssUrls(cssText, cssAbsoluteUrl, selfOrigin) {
  // url('...') / url("...") / url(...) 모두 처리, data:는 스킵
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, raw) => {
    const u = String(raw).trim();
    if (/^data:/i.test(u)) return m; // data URI는 그대로
    try {
      const abs = new URL(u, cssAbsoluteUrl).toString();         // 원본 기준 절대화
      return `url(${selfOrigin}/_res?u=${encodeURIComponent(abs)})`; // 우리 프록시 절대경로
    } catch {
      return m;
    }
  });
}

export const handler = async (event) => {
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host  = event.headers["x-forwarded-host"] || event.headers["host"];
  const selfOrigin = `${proto}://${host}`;

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
    if (mustTreatAsCss(ct, parsed.toString())) {
      const text = await r.text(); // (압축은 fetch가 자동 해제)
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
