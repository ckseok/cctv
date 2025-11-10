import { load as cheerioLoad } from "cheerio";

const TARGET_ORIGIN = "https://its.jinju.go.kr";
const TARGET_PATH   = "/its/dsh/view";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CACHE_TTL_SEC = 60;

export default async () => {
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
    if (!upstream.ok) return new Response(`Upstream ${upstream.status}`, { status: 502 });

    const html = await upstream.text();
    const $ = cheerioLoad(html);

    // 상대경로 보정용 <base>
    if ($("head base").length === 0) $("head").prepend(`<base href="${TARGET_ORIGIN}/">`);

    // 리소스 → 우리 프록시(/_res?u=...)
    const rewrite = (sel, attr) => {
      $(sel).each((_, el) => {
        const v = $(el).attr(attr);
        if (!v) return;
        try {
          const abs = new URL(v, TARGET_ORIGIN).toString();
          $(el).attr(attr, `/_res?u=${encodeURIComponent(abs)}`);
        } catch {}
        $(el).removeAttr("integrity").removeAttr("crossorigin");
      });
    };
    rewrite("img", "src");
    rewrite("script", "src");
    rewrite('link[rel="stylesheet"]', "href");
    rewrite("iframe", "src");

    // 외부 링크는 새탭
    $("a[href]").each((_, el) => {
      const href = String($(el).attr("href") || "");
      if (href.startsWith("http")) {
        $(el).attr("target", "_blank");
        $(el).attr("rel", "noopener");
      }
    });

    // 브라우저 측에서 나가는 fetch/XHR를 /_xhr로 우회
    $("head").append(`
      <script>
      (function(){
        const ORIGIN = ${JSON.stringify(TARGET_ORIGIN)};
        function toAbs(u){ try { return new URL(u, ORIGIN).toString(); } catch(e){ return u; } }
        function toProxy(u){ return "/_xhr/?u=" + encodeURIComponent(toAbs(u)); }

        // fetch 후킹
        const _fetch = window.fetch;
        window.fetch = function(input, init){
          try{
            const url = (typeof input === "string") ? input : (input && input.url);
            if (url && (url.startsWith("/") || url.startsWith(ORIGIN))) {
              input = toProxy(url);
              init = init || {};
              // 원본 쿠키/인증 헤더는 서버 함수에서 전달
            }
          }catch(e){}
          return _fetch(input, init);
        };

        // XHR 후킹
        const _op_
