// netlify/functions/xhr.js
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...";

const ALLOW_HOSTS = new Set([
  "its.jinju.go.kr",
  // 필요시: "openapi.jinju.go.kr", "tile.mapvendor.com" 등 추가
]);

export const handler = async (event) => {
  try {
    const u = (event.queryStringParameters && event.queryStringParameters.u) || "";
    if (!u) return { statusCode: 400, body: "u query required" };

    const parsed = new URL(u);
    if (!ALLOW_HOSTS.has(parsed.host)) return { statusCode: 403, body: "forbidden host" };

    const init = {
      method: event.httpMethod,
      headers: {
        "User-Agent": UA,
        "Referer": `https://${parsed.host}/`,
        "Accept": "*/*",
        "Accept-Language": "ko,ko-KR;q=0.9,en;q=0.8"
      },
      redirect: "follow"
    };
    if (!["GET","HEAD"].includes(event.httpMethod)) {
      init.body = event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body;
    }

    const r = await fetch(parsed.toString(), init);
    const type = r.headers.get("content-type") || "application/octet-stream";
    const buf  = Buffer.from(await r.arrayBuffer());

    return {
      statusCode: r.status,
      headers: { "Content-Type": type, "Cache-Control": "no-store" },
      isBase64Encoded: true,
      body: buf.toString("base64")
    };
  } catch (e) {
    return { statusCode: 502, body: "xhr proxy failed: " + e.message };
  }
};
