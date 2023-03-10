"use strict";
const fetch = require("node-fetch");
const axios = require('axios').default;

/**
 * static files (404.html, sw.js, conf.js)
 */
const ASSET_URL = "https://etherdream.github.io/jsproxy";

const JS_VER = 10;
const MAX_RETRY = 1;

/** @type {RequestInit} */
const PREFLIGHT_INIT = {
  status: 204,
  headers: new Headers({
    "access-control-allow-origin": "*",
    "access-control-allow-methods":
      "GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS",
    "access-control-max-age": "1728000",
  }),
};

/**
 * @param {any} body
 * @param {number} status
 * @param {Object<string, string>} headers
 */
// 设置返回响应头
function makeRes(ctx, body, status = 200, headers = {}) {
  headers["--ver"] = JS_VER;
  headers["access-control-allow-origin"] = "*";
  ctx.set(headers);
  ctx.status = status;
  ctx.body = body;
}

/**
 * @param {string} urlStr
 */
function newUrl(urlStr) {
  try {
    return new URL(urlStr);
  } catch (err) {
    return null;
  }
}

// 关注这一个地方即可，这里监听到前端接口请求路由进行处理
// addEventListener('fetch', e => {
//   const ret = fetchHandler(e)
//     .catch(err => makeRes('cfworker error:\n' + err.stack, 502))
//   e.respondWith(ret)
// })

/**
 * @param {FetchEvent} e
 */
async function fetchHandler(ctx) {
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
    return httpHandler(ctx, req, path.substr(6));
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
}

/**
 * @param {Request} req
 * @param {string} pathname
 */
function httpHandler(ctx, req, pathname) {
  const reqHdrRaw = req.header;
  console.log(
    pathname,
    req,

    "pathname================================================================"
  );

  if (Object.hasOwn(reqHdrRaw, "x-jsproxy")) {
    return Response.error();
  }

  // preflight
  if (
    req.method === "OPTIONS" &&
    reqHdrRaw.has("access-control-request-headers")
  ) {
    return new Response(null, PREFLIGHT_INIT);
  }

  let acehOld = false;
  let rawSvr = "";
  let rawLen = "";
  let rawEtag = "";
  //  为调试页面设置header
  const reqHdrNew = new Headers(reqHdrRaw);
  reqHdrNew.set("x-jsproxy", "1");

  // 此处逻辑和 http-dec-req-hdr.lua 大致相同
  // https://github.com/EtherDream/jsproxy/blob/master/lua/http-dec-req-hdr.lua
  const refer = reqHdrNew.get("referer");
  const query = refer.substr(refer.indexOf("?") + 1);
  if (!query) {
    makeRes(ctx, "missing params", 403);
    return null;
  }
  console.log(query, "query===");
  const param = new URLSearchParams(query);

  for (const [k, v] of Object.entries(param)) {
    if (k.substr(0, 2) === "--") {
      // 系统信息
      switch (k.substr(2)) {
        case "aceh":
          acehOld = true;
          break;
        case "raw-info":
          [rawSvr, rawLen, rawEtag] = v.split("|");
          break;
      }
    } else {
      // 还原 HTTP 请求头
      if (v) {
        reqHdrNew.set(k, v);
      } else {
        reqHdrNew.delete(k);
      }
    }
  }
  if (!param.has("referer")) {
    reqHdrNew.delete("referer");
  }

  // cfworker 会把路径中的 `//` 合并成 `/`,nodejs中不需要
  // const urlStr = pathname.replace(/^(https?):\/+/, "$1://");
  const urlObj = newUrl(pathname);
  if (!urlObj) {
    makeRes(ctx, "invalid proxy url: " + urlStr, 403);
    return null;
  }

  /** @type {RequestInit} */
  const reqInit = {
    method: req.method,
    headers: reqHdrNew,
    redirect: "manual",
  };
  if (req.method === "POST") {
    reqInit.body = req.body;
  }
  console.log("进入代理===");
  return {
    urlObj, reqInit, acehOld, rawLen, retryTimes: 0
  }
  // return proxy(ctx, urlObj, reqInit, acehOld, rawLen, 0);
}

/**
 *
 * @param {URL} urlObj
 * @param {RequestInit} reqInit
 * @param {number} retryTimes
 */
async function proxyFetch(ctx, { urlObj, reqInit, acehOld, rawLen, retryTimes }, res) {
  console.log(urlObj.href, reqInit, "res=====fetch");

  const resHdrOld = res.headers;
  const resHdrNew = new Headers(resHdrOld);

  let expose = "*";

  for (const [k, v] of resHdrOld.entries()) {
    if (
      k === "access-control-allow-origin" ||
      k === "access-control-expose-headers" ||
      k === "location" ||
      k === "set-cookie"
    ) {
      const x = "--" + k;
      resHdrNew.set(x, v);
      if (acehOld) {
        expose = expose + "," + x;
      }
      resHdrNew.delete(k);
    } else if (
      acehOld &&
      k !== "cache-control" &&
      k !== "content-language" &&
      k !== "content-type" &&
      k !== "expires" &&
      k !== "last-modified" &&
      k !== "pragma"
    ) {
      expose = expose + "," + k;
    }
  }

  if (acehOld) {
    expose = expose + ",--s";
    resHdrNew.set("--t", "1");
  }

  // verify
  if (rawLen) {
    const newLen = resHdrOld.get("content-length") || "";
    const badLen = rawLen !== newLen;

    if (badLen) {
      if (retryTimes < MAX_RETRY) {
        urlObj = await parseYtVideoRedir(urlObj, newLen, res);
        if (urlObj) {
          return proxy(ctx, urlObj, reqInit, acehOld, rawLen, retryTimes + 1);
        }
      }
      return makeRes(res.body, 400, {
        "--error": `bad len: ${newLen}, except: ${rawLen}`,
        "access-control-expose-headers": "--error",
      });
    }

    if (retryTimes > 1) {
      resHdrNew.set("--retry", retryTimes);
    }
  }

  let status = res.status;

  resHdrNew.set("access-control-expose-headers", expose);
  resHdrNew.set("access-control-allow-origin", "*");
  resHdrNew.set("--s", status);
  resHdrNew.set("--ver", JS_VER);

  resHdrNew.delete("content-security-policy");
  resHdrNew.delete("content-security-policy-report-only");
  resHdrNew.delete("clear-site-data");

  if (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  ) {
    status = status + 10;
  }
  return {res, status, resHdrNew};


  // console.log(body,'====' )

  // makeRes(ctx, body.join(""), status, resHdrNew);

  // return new Response(res.body, {
  //   status,
  //   headers: resHdrNew,
  // });
}

/**
 * @param {URL} urlObj
 */
function isYtUrl(urlObj) {
  return (
    urlObj.host.endsWith(".googlevideo.com") &&
    urlObj.pathname.startsWith("/videoplayback")
  );
}

/**
 * @param {URL} urlObj
 * @param {number} newLen
 * @param {Response} res
 */
async function parseYtVideoRedir(urlObj, newLen, res) {
  if (newLen > 2000) {
    return null;
  }
  try {
    const data = await res.text();
    urlObj = new URL(data);
  } catch (err) {
    return null;
  }
  return urlObj;
}

exports.fetchHandler = fetchHandler;
exports.makeRes = makeRes;
exports.httpHandler = httpHandler;
exports.proxyFetch = proxyFetch;

