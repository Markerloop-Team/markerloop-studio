// Local stand-in for the showroom reverse proxy: forwards <prefix>/* to the app
// WITHOUT stripping the prefix, answers 404 to anything else and logs it as
// ESCAPED. Usage: node scripts/prefix-proxy.mjs <listen port> <app port> [prefix]
import http from "node:http";
const [listen, target, prefix] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4] || "/markerloop-studio"];
http.createServer((req, res) => {
  if (!(req.url === prefix || req.url.startsWith(prefix + "/") || req.url.startsWith(prefix + "?"))) {
    console.log("ESCAPED", req.method, req.url);
    res.writeHead(404, { "content-type": "text/plain" }).end("outside prefix");
    return;
  }
  const up = http.request({ host: "127.0.0.1", port: target, method: req.method, path: req.url, headers: { ...req.headers, "x-forwarded-host": req.headers.host, "x-forwarded-proto": "http" } }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502).end(String(e)); });
  req.pipe(up);
}).listen(listen, "127.0.0.1", () => console.log(`proxy :${listen} -> :${target} ${prefix}`));
