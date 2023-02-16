const Koa = require("koa");
const json = require("koa-json");
const logger = require("koa-logger");
const bodyParser = require("koa-bodyparser");
const serve = require("koa-static");
const { fetchHandler, makeRes } = require("./libs/cf");
const app = new Koa();


app.use(json());
app.use(logger());
app.use(bodyParser());

// app.use(async (ctx, next) => {
//     await next();
//     fetchHandler(ctx)
//         .catch(err => makeRes(ctx,'cfworker error:\n' + err.stack, 502))
// });

app.use(serve("public"));

app.listen(3000);