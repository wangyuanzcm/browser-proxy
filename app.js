const Koa = require("koa");
const path = require("path");
const fs = require("fs");
const https = require("https");
const json = require("koa-json");
const logger = require("koa-logger");
const bodyParser = require("koa-bodyparser");
const send = require("koa-send");
const Router = require("koa-router");
const serve = require("koa-static");

const { fetchHandler, makeRes, httpHandler,proxyFetch } = require("./libs/cf");

const app = new Koa();
const router = new Router();

const options = {
    key: fs.readFileSync("./cert/server.key", "utf8"),
    cert: fs.readFileSync("./cert/server.cert", "utf8"),
};

app.use(json());
app.use(logger());
app.use(bodyParser());

app.use(serve("public"));

router.get(`/*`, async (ctx, next) => {

    console.log(ctx.path, "path-----");
    //   fetchHandler(ctx).catch((err) =>
    //     makeRes(ctx, "cfworker error:\n" + err.stack, 502)
    //   );
    try {
        const req = ctx.request;
        const urlStr = req.url;
        // 这块内容存疑，其实不应该写死
        const urlObj = new URL(`https://localhost:8000${urlStr}`);
        const path = urlObj.href.substr(urlObj.origin.length);
        console.log("path", path, urlObj);
        // 本地调试只能使用http协议
        // 如果不是https协议，则使用301重定向功能定向到https协议的页面上
        // if (urlObj.protocol === "http:") {
        //   urlObj.protocol = "https:";
        //    makeRes(ctx, "", 301, {
        //     "strict-transport-security":
        //       "max-age=99999999; includeSubDomains; preload",
        //     location: urlObj.href,
        //   });
        // }
        console.log("https协议继续往下", path.startsWith("/http/"));
        // 如果页面url上此时跟了调试的url的话，进入这个
        if (path.startsWith("/http/")) {
            // 进入调试页面的话开始对请求进行处理
            const result = httpHandler(ctx, req, path.substr(6));
            const res = await fetch(result.urlObj.href);
            proxyFetch(ctx, result, res)
            return
        }
        console.log("=====继续往下执行=====");
        switch (path) {
            case "/http":
                return makeRes(ctx, "请更新 cfworker 到最新版本!");
            case "/ws":
                return makeRes(ctx, "not support", 400);
            case "/works":
                return makeRes(ctx, "it works");
            default:
                ctx.response.redirect("/404.html");
            // static files
            // return fetch(ASSET_URL + path)
        }
    } catch (err) {
        makeRes(ctx, "cfworker error:\n" + err.stack, 502);
    }
    await next();
});

app.use(router.routes());

app.listen(8000);
// https.createServer(options, app.callback()).listen(443);
