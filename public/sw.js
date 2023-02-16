// 这里定义了一个配置的函数，将配置内容穿进去
jsproxy_config = (x) => {
  __CONF__ = x;
  // 这里设置静态文件获取从assets文件夹中获取
  importScripts((__FILE__ = x.assets_cdn + "bundle.c33e24c5.js"));
};
importScripts("conf.js");
