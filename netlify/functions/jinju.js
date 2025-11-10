// netlify/functions/jinju.js
import { load as cheerioLoad } from "cheerio";

const TARGET_ORIGIN = "https://its.jinju.go.kr";
const TARGET_PATH   = "/its/dsh/view";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TTL = 60;

export const handler = async (event) => {
  // 우리 도메인 절대 오리진 (Netlify 프록시 절대경로 강제용)
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host  = event.headers["x-forwarded-host"] || event.headers["host"];
  const selfOrigin = `${proto}://${host}`;

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

    if (!upstream.ok) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: `Upstream ${upstream.status} for ${TARGET_PATH}`
      };
    }

    const html = await upstream.text();
    const $ = cheerioLoad(html);

    // 루트 경로가 /its/ 기준이 되도록 base 지정
    if ($("head base").length === 0) $("head").prepend(`<base href="${TARGET_ORIGIN}/its/">`);

    const clean = (v) =>
      String(v || "").replace(/^['"]|['"]$/g, "").replace(/['"]?\s*\/?>$/i, "");

    // 모든 주요 리소스를 우리 도메인의 절대 프록시로 강제
    const rewrite = (sel, attr) => {
      $(sel).each((_, el) => {
        const raw = $(el).attr(attr);
        if (!raw) return;
        try {
          // /its/ 기준으로 절대화 → 이후 우리 프록시로
          const abs = new URL(clean(raw), `${TARGET_ORIGIN}/its/`).toString();
          const prox = `${selfOrigin}/_res?u=${encodeURIComponent(abs)}`;
          $(el).attr(attr, prox);
        } catch {}
        // 재작성 후 SRI/크로스오리진은 무효가 되므로 제거
        $(el).removeAttr("integrity").removeAttr("crossorigin");
      });
    };
    rewrite("img", "src");
    rewrite("script", "src");
    rewrite('link[rel="stylesheet"]', "href");
    rewrite("iframe", "src");

    // 외부 링크는 새 탭
    $("a[href]").each((_, el) => {
      const href = String($(el).attr("href") || "");
      if (href.startsWith("http")) $(el).attr({ target: "_blank", rel: "noopener" });
    });

    // 브라우저의 fetch/XMLHttpRequest를 우리 XHR 프록시로 우회 (절대 URL 사용)
    $("head").append(`
      <script>
      (function(){
        const ORIGIN = ${JSON.stringify(TARGET_ORIGIN)};
        const SELF   = ${JSON.stringify(selfOrigin)};
        const toAbs  = (u)=>{ try{ return new URL(u, ORIGIN + "/its/").toString(); }catch(e){ return u; } };
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

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": `public, max-age=${TTL}`
      },
      body: $.html()
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: "Proxy failed: " + e.message
    };
  }
};
