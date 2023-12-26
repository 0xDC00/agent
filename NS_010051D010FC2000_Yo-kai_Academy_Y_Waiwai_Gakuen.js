// ==UserScript==
// @name         [010051D010FC2000] Yo-kai Watch Jam - Yo-kai Academy Y: Waiwai Gakuen 
// @version      4.0.0
// @author       [Owlie]
// @description  Yuzu
// * Level-5
//*
// ==/UserScript==
const gameVer = '4.0.0';

const { setHook } = require('./libYuzu.js');
const mainHandler = trans.send(handler, '200+');

setHook({
    '4.0.0': {
        [0x80dd0cec - 0x80004000]: mainHandler.bind_(null, 0, "Dialogue text"), // Dialogue text 
        [0x80e33450 - 0x80004000]: mainHandler.bind_(null, 3, "Other Dialogue text"), // Other Dialogue text
        [0x80c807c0 - 0x80004000]: mainHandler.bind_(null, 0, "Item description etc text"), //Item description etc text
        [0x808d9a30 - 0x80004000]: mainHandler.bind_(null, 0, "Tutorial text"), // Tutorial Text
        [0x811b95ac - 0x80004000]: mainHandler.bind_(null, 3, "Menu text"), // Menu screen
        [0x80e20290 - 0x80004000]: mainHandler.bind_(null, 3, "Opening Song text etc"), // Opening Song Text etc
        [0x80c43680 - 0x80004000]: mainHandler.bind_(null, 3, "cutscene text"), // Cutscene Text
        
    }
}[globalThis.gameVer = globalThis.gameVer ?? gameVer]);

function handler(regs, index, hookname) {
    //console.log('onEnter ' + hookname);

    const address = regs[index].value;
    
    /* processString */
    let s = address.readUtf8String()
    .replace(/\[([^\]]+)\/[^\]]+\]/g, '$1') // Remove furigana
    .replace(/\s+/g, ' ') // Replace any sequence of whitespace characters with a single space
    .replace(/\\n/g, ' ') // Replace '\n' with a space
    .replace(/<[^>]+>|\[[^\]]+\]/g, ''); // Remove anything within < > or [ ]
    return s;
}