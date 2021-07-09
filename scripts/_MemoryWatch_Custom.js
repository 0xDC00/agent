// ==UserScript==
// @name         Memory Watchpoint (encoding)
// @version      0.1
// @author       [DC]
// @description  
//   This script will observe at an assigned address,
//   and send the results when there are any changes.
//   This way may work for many titles (PC, Emulator: ppsspp, yuzu,...) but not all.
//   * Warning:
//     - You must set a valid encoding. (line 16)
//     - You must give a valid address. (I will ask on load; use any memory scanner (eg: cheat engine) to find it.)
//          *** Make sure you get the corrected address for each of new sentence when the dialog was changed.
// ==/UserScript==
(function () {
    console.log('Script loaded!');
    const decoder = new TextDecoder('utf-32le'); // <-- set your encoding here (utf-8, utf-16le, utf-32le, shift_jis, ...)
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
                const len = align(found.sub(address).toInt32(), 4);
                if (len > 0) {
                    const buf = address.readByteArray(len);
                    const str = decoder.decode(buf)
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
    
    function align(value, alignment)
    {
        return (value + (alignment - 1)) & ~(alignment - 1);
    }
})();