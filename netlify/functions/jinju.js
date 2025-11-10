// netlify/functions/jinju.js (핵심 스니펫만 교체)
$("head").append(`
  <script>
  (function(){
    const ORIGIN = ${JSON.stringify("https://its.jinju.go.kr")};
    const SELF   = ${JSON.stringify(proto + "://" + host)};
    const toAbs  = (u) => { try { return new URL(u, ORIGIN + "/its/").toString(); } catch(e){ return u; } };
    const toXhr  = (u) => SELF + "/_xhr/?u=" + encodeURIComponent(toAbs(u));

    const _fetch = window.fetch;
    window.fetch = function(input, init){
      try{
        let url = (typeof input==="string") ? input : (input && input.url);
        if (url) {
          // 1) 절대경로(https://its.jinju.go.kr/...) → 우회
          // 2) 루트경로(/its/..., /api...) → 우회
          // 3) 상대경로(getData.do 등) → 절대화 후 우회
          const isAbs = /^https?:\/\//i.test(url);
          const isRoot = url.startsWith("/");
          if (isAbs || isRoot || !url.includes("://")) {
            input = toXhr(url);
          }
        }
      }catch(e){}
      return _fetch(input, init);
    };

    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url){
      try{
        const isAbs = /^https?:\\/\\//i.test(url);
        const isRoot = url.startsWith("/");
        if (isAbs || isRoot || !url.includes("://")) {
          arguments[1] = toXhr(url);
        }
      }catch(e){}
      return _open.apply(this, arguments);
    };
  })();
  </script>
`);
