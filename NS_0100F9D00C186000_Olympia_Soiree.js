// ==UserScript==
// @name         [0100F9D00C186000] Olympia Soiree
// @version      1.0.0
// @author       [Owlie]
// @description  Yuzu
// * 	HYDE, Inc. & Otomate
// *
// ==/UserScript==
const gameVer = '1.0.0';

const { setHook } = require('./libYuzu.js');
const mainHandler = trans.send(handler, '200++');

setHook({
    '1.0.0': {
        [0x8002ad04 - 0x80004000]: mainHandler, // text
    }
}[globalThis.gameVer = globalThis.gameVer ?? gameVer]);

function handler(regs) {
    const address = regs[0].value;
    console.log('onEnter');

    /* processString */
    let s = address.readUtf8String() 
    s = s.replace(/(#Ruby\[)([^,]+).([^\]]+)./g, '$2');
    s = s.replace(/#Color\[[\d]+\]/g, '');


    return s;
}