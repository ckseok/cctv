const TARGET_HOST = "its.jinju.go.kr";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export default async (req) => {
  try {
    const url = new URL(req.url);
    const u = url.searchParams.get("u");
    if (!u) return new Response("u query required", { status: 400 });

    const parsed = new URL(u);
    if (parsed.host !== TARGET_HOST) return new Response("forbidden host", { status: 403 });

    // 원본으로 전달할 요청 구성
    const init = {
      method: req.method,
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": `https://${TARGET_HOST}/`,
        // 원하면 여기에 추가 헤더 매핑
      },
      redirect: "follow"
    };

    // 바디 메서드면 그대로 전달
    if (!["GET", "HEAD"].includes(req.method)) {
      init.body = await req.arrayBuffer();
    }

    const upstream = await fetch(parsed.toString(), init);
    const body = await upstream.arrayBuffer();

    // 콘텐츠 유형 전달
    const type = upstream.headers.get("content-type") || "application/octet-stream";

    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": type,
        "Cache-Control": "no-store"  // API는 캐시 비활성화(필요시 조정)
      }
    });
  } catch (e) {
    return new Response("xhr proxy failed: " + e.message, { status: 502 });
  }
};
