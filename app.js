const Koa = require("koa");
const fs = require("fs");
const https = require("https");
const json = require("koa-json");
const logger = require("koa-logger");
const bodyParser = require("koa-bodyparser");
const serve = require("koa-static");
const { fetchHandler, makeRes } = require("./libs/cf");
const app = new Koa();

const options = {
    key: fs.readFileSync("./cert/server.key", "utf8"),
    cert: fs.readFileSync("./cert/server.cert", "utf8")
};

app.use(json());
app.use(logger());
app.use(bodyParser());

// app.use(async (ctx, next) => {
//     await next();
//     fetchHandler(ctx)
//         .catch(err => makeRes(ctx,'cfworker error:\n' + err.stack, 502))
// });

app.use(serve("public"));
https.createServer(options, app.callback()).listen(443);
