// ==UserScript==
// @name         [0100C29017106000] Live a Live
// @version      1.0.0
// @author       [Owlie]
// @description  Yuzu
// * Square Enix
// * Nintendo
// ==/UserScript==
const gameVer = '1.0.0';

const { setHook } = require('./libYuzu.js');
const mainHandler = trans.send(handler, '200+');

setHook({
    '1.0.0': {
        [0x80a05170 - 0x80004000]: mainHandler, // text
    }
}[globalThis.gameVer = globalThis.gameVer ?? gameVer]);

function handler(regs) {
    const address = regs[0].value;
    console.log('onEnter');

    /* processString */
    let s = address.readUtf16String()
    s = s.replace(/\n+|(\\n)+/g, ' ')
    ;
    return s;
}