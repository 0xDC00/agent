// ==UserScript==
// @name         Memory Watchpoint (shift_jis)
// @version      0.1
// @author       [DC]
// @description  
//   This script will observe at an assigned address,
//   and send the results when there are any changes.
//   This way may work for many titles (PC, Emulator: ppsspp, yuzu,...) but not all.
//   * Warning:
//     - This script use shift_jis for decode, if you need another encoding, go with _MemoryWatch_Custom.js
//     - You must give a valid address. (I will ask on load; use any memory scanner (eg: cheat engine) to find it.)
//          *** Make sure you get the corrected address for each of new sentence when the dialog was changed.
// ==/UserScript==
(function () {
    console.log('Script loaded!');
    run();


    function run() {
        var str_address = prompt('Make sure you get the corrected address for each of new sentence when the dialog was changed.\n\nAddress?');
        if (!str_address) return;

        var address = parseInt(str_address.trim());
        if (!address) run();
        else mem_watch(ptr(address));
    }

    function mem_watch(address) {
        var debounce = null;
        console.log('mem_watch: ', address);

        // set breakpoint on write (w) at address, size=1, all threads (-1).
        const bp = hwbp.add(address, 'w', 1, function () {
            clearTimeout(debounce);
            debounce = setTimeout(read_text, 500, address);
        } /*onEnter*/, -1 /*threadId*/);

        if (!bp) console.log('Error!');
    }

    function read_text(address) {
        //console.log('read_text');
        Memory.scan(address, 4096, '00 00 00 00', {
            onMatch: function (found, size) {
                const len = found.sub(address).toInt32();
                if (len > 0) {
                    //console.log(len, address.readByteArray(len));
                    const str = address.readShiftJisString(len)
                        .replace(/\u0000/g, '\n')  // terminated -> \n
                        .replace(/\n{2,}/g, '\n')  // single \n
                        .replace(/\n+$/, '')       // remove trailing \n
                        ;
                    //console.log('----------------\n'+str);
                    trans.send(str); // send to translation aggregator
                }
                return 'stop';
            },
            onComplete: function () {}
        });
    }
})();