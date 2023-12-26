// ==UserScript==
// @name         [0100B6900A668000] Code : Realize - Saikou no Hanataba 
// @version      1.0.0
// @author       [Owlie]
// @description  Yuzu
// * -Design Factory Co., Ltd. & Otomate
// *
// ==/UserScript==
const gameVer = '1.0.0';

const { setHook } = require('./libYuzu.js');

const mainHandler = trans.send(handler, '200++');

setHook({
    '1.0.0': {
        [0x80024eac - 0x80004000]: mainHandler,
       
    }
}[globalThis.gameVer = globalThis.gameVer ?? gameVer]);

function handler(regs, ) {
    console.log('onEnter');

    const address = regs[0].value;
  
    let s = address.readUtf8String()
    s = s.replace(/#Color\[[\d]+\]/g, '');
    return s;
}