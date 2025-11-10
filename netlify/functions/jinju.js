import { load as cheerioLoad } from "cheerio";

const TARGET_ORIGIN = "https://its.jinju.go.kr";
const TARGET_PATH   = "/its/dsh/view";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CACHE_TTL_SEC = 60; // 원본 보호: 60초 캐시(네트리파이 에지 캐시는 아니지만, CDN 캐시 지시)

export default async (req, context) => {
  try {
    const upstream = await fetch(TARGET_ORIGIN + TARGET_PATH, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko,ko-KR;q=0.9,en;q=0.8",
        "Referer": TARGET_ORIGIN + "/"
      },
      redirect: "follow"
    });
    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, { status: 502 });
    }
    const html = await upstream.text();

    // ── HTML 재작성 ─────────────────────────────────────────────
    const $ = cheerioLoad(html);

    // base 추가(상대경로 처리 보완)
    if ($("head base").length === 0) {
      $("head").prepend(`<base href="${TARGET_ORIGIN}/">`);
    }

    // 모든 주요 리소스를 우리 프록시로 경유 (상대/절대 무관)
    const rewrite = (sel, attr) => {
      $(sel).each((_, el) => {
        const v = $(el).attr(attr);
        if (!v) return;
        try {
          const abs = new URL(v, TARGET_ORIGIN).toString();
          $(el).attr(attr, `/_res?u=${encodeURIComponent(abs)}`);
        } catch {}
      });
    };
    rewrite("img", "src");
    rewrite("script", "src");
    rewrite('link[rel="stylesheet"]', "href");

    // 외부 링크는 새탭
    $("a[href]").each((_, el) => {
      const href = String($(el).attr("href") || "");
      if (href.startsWith("http")) {
        $(el).attr("target", "_blank");
        $(el).attr("rel", "noopener");
      }
    });

    // 출처 배지(선택)
    if ($("#jinju-proxy-source").length === 0) {
      $("body").append(`
        <div id="jinju-proxy-source" style="
          position:fixed;right:10px;bottom:10px;opacity:.6;
          background:#111;color:#fff;padding:6px 10px;border-radius:8px;
          font:12px/1.2 system-ui;z-index:2147483647">
          출처: 진주시 ITS
        </div>`);
    }

    const out = $.html();

    // 응답(프레임 차단 헤더 없음)
    return new Response(out, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": `public, max-age=${CACHE_TTL_SEC}`
      }
    });
  } catch (e) {
    return new Response("Proxy failed: " + e.message, { status: 502 });
  }
};
