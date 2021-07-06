// ==UserScript==
// @name         Memory Watchpoint
// @version      0.1
// @author       [DC]
// @description  Any target, static pointer (shift_jis)
// ==/UserScript==
(function () {
    console.log('Script loaded!');
    run();

    function run() {
        var str_address = prompt('pointer?');
        if (!str_address) return;

        var address = parseInt(str_address.trim());
        if (!address) run();
        else mem_watch(ptr(address));
    }

    function mem_watch(address) {
        var debounce = null;
        console.log('mem_watch: ', address);

        // set breakpoint on write (w) at address, size=1, all threads (-1).
        const bp = hwbp.add(address, 'w', 1, function (context) {
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
                        .replace(/\n{2,}/g, '\n') //  single \n
                        ;
                    
                    trans.send(str); // to translation aggregator
                }
                return 'stop';
            },
            onComplete: function () {}
        });
    }
})();