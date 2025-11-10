import { load as cheerioLoad } from "cheerio";

const TARGET_ORIGIN = "https://its.jinju.go.kr";
const TARGET_PATH   = "/its/dsh/view";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TTL = 60;

export default async (req) => {
  const selfOrigin = new URL(req.url).origin; // ★ 지금 요청이 들어온 우리 도메인
  try {
    const upstream = await fetch(TARGET_ORIGIN + TARGET_PATH, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko,ko-KR;q=0.9,en;q=0.8",
        "Referer": TARGET_ORIGIN + "/"
      },
      redirect: "follow"
    });
    if (!upstream.ok) return new Response(`Upstream ${upstream.status}`, { status: 502 });

    const html = await upstream.text();
    const $ = cheerioLoad(html);

    // (선택) base는 유지해도 됨. 다만 우리 경로는 절대 URL로 찍어줄 것.
    if ($("head base").length === 0) $("head").prepend(`<base href="${TARGET_ORIGIN}/">`);

    const clean = (v) => String(v || "")
      .replace(/^['"]|['"]$/g, "")         // 앞뒤 따옴표 제거
      .replace(/['"]?\s*\/?>$/i, "");      // 뒤에 붙은 '"/>' 같은 꼬리 제거

    const rewrite = (sel, attr) => {
      $(sel).each((_, el) => {
        const raw = $(el).attr(attr);
        if (!raw) return;
        try {
          const abs = new URL(clean(raw), TARGET_ORIGIN).toString();
          const prox = `${selfOrigin}/_res?u=${encodeURIComponent(abs)}`; // ★ 절대경로(우리 도메인)
          $(el).attr(attr, prox);
        } catch {}
        $(el).removeAttr("integrity").removeAttr("crossorigin");
      });
    };
    rewrite("img", "src");
    rewrite("script", "src");
    rewrite('link[rel="stylesheet"]', "href");
    rewrite("iframe", "src");

    $("a[href]").each((_, el) => {
      const href = String($(el).attr("href") || "");
      if (href.startsWith("http")) $(el).attr({ target: "_blank", rel: "noopener" });
    });

    // 브라우저의 fetch/XHR도 우리 함수로 우회 (절대 URL 사용)
    $("head").append(`
      <script>
      (function(){
        const ORIGIN = ${JSON.stringify(TARGET_ORIGIN)};
        const SELF   = ${JSON.stringify(selfOrigin)}; // ★
        const toAbs  = (u)=>{ try{ return new URL(u, ORIGIN).toString(); }catch(e){ return u; } };
        const toRes  = (u)=> SELF + "/_res?u=" + encodeURIComponent(toAbs(u));
        const toXhr  = (u)=> SELF + "/_xhr/?u=" + encodeURIComponent(toAbs(u));

        const _fetch = window.fetch;
        window.fetch = function(input, init){
          try{
            const url = (typeof input==="string") ? input : (input && input.url);
            if (url && (url.startsWith("/") || url.startsWith(ORIGIN))) {
              input = toXhr(url);
            }
          }catch(e){}
          return _fetch(input, init);
        };

        const _open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url){
          try{
            if (url && (url.startsWith("/") || url.startsWith(ORIGIN))) {
              arguments[1] = toXhr(url);
            }
          }catch(e){}
          return _open.apply(this, arguments);
        };
      })();
      </script>
    `);

    return new Response($.html(), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": `public, max-age=${TTL}`
      }
    });
  } catch (e) {
    return new Response("Proxy failed: " + e.message, { status: 502 });
  }
};
