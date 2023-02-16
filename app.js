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

const { fetchHandler, makeRes } = require("./libs/cf");

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

router.get(`/*`, async (ctx) => {
    console.log(ctx.path,'path-----' )
     fetchHandler(ctx).catch((err) =>
      makeRes(ctx, "cfworker error:\n" + err.stack, 502)
    );
});


app.use(router.routes());

app.listen(8000);
// https.createServer(options, app.callback()).listen(443);
