// netlify/functions/xhr.js
const TARGET_HOST = "its.jinju.go.kr";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export default async (req) => {
  try {
    // 쿼리 파라미터에서 원본 URL 추출
    const u = new URL(req.url).searchParams.get("u");
    if (!u) return new Response("u query required", { status: 400 });

    const parsed = new URL(u);

    // 보안: 허용 도메인만 중계
    if (parsed.host !== TARGET_HOST)
      return new Response("forbidden host", { status: 403 });

    // 원본으로 전달할 요청 옵션 구성
    const init = {
      method: req.method,
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": `https://${TARGET_HOST}/`
      },
      redirect: "follow"
    };

    // POST·PUT 등은 바디를 그대로 전달
    if (!["GET", "HEAD"].includes(req.method)) {
      init.body = await req.arrayBuffer();
    }

    // 원본으로 요청
    const upstream = await fetch(parsed.toString(), init);

    // 응답 본문과 헤더 추출
    const body = await upstream.arrayBuffer();
    const type =
      upstream.headers.get("content-type") || "application/octet-stream";

    // 그대로 반환 (CORS는 우리 도메인 기준이므로 안전)
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": type,
        "Cache-Control": "no-store"
      }
    });
  } catch (e) {
    return new Response("xhr proxy failed: " + e.message, { status: 502 });
  }
};
