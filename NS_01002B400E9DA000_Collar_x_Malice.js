// ==UserScript==
// @name         [01002B400E9DA000] Collar x Malice
// @version      1.0.0
// @author       [Owlie]
// @description  Yuzu
// * Design Factory Co., Ltd. & Otomate
// *
// ==/UserScript==
const gameVer = '1.0.0';

const { setHook } = require('./libYuzu.js');
const mainHandler = trans.send(handler, '200++');

setHook({
    '1.0.0': {
        [0x800444c4 - 0x80004000]: mainHandler, // text
    }
}[globalThis.gameVer = globalThis.gameVer ?? gameVer]);

function handler(regs) {
    const address = regs[0].value;
    console.log('onEnter');

    /* processString */
    let s = address.readUtf8String() 
    
    return s;
}