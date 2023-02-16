const fetch = require("node-fetch");
fetch('https://www.baidu.com/').then(async function (response) {

    for await (const chunk of response.body) {
        console.log(chunk.toString());
    }

});
