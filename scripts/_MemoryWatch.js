// ==UserScript==
// @name         Memory Watchpoint
// @version      0.1
// @author       [DC]
// @description  
//   This script will observe at an assigned address (buffer that game read and write for each dialog),
//   and send the results when there are any changes.
//   This way may work for many titles (PC, Emulator: ppsspp, yuzu,...) but not all.
//   * Warning:
//     - You must give a valid address. (I will ask on load; use any memory scanner (eg: cheat engine) to find it.)
//          *** Make sure you get the corrected address for each of new sentence when the dialog was changed.
//              If the game not use fixed buffer for each dialog, please try _ExecutionWatch.js
// ==/UserScript==
(function () {
    console.log('Script loaded! isDebuggerAttached: ', Process.isDebuggerAttached());
    _main_();

    // String block may contain controls code, that will need a custom parser.
    function read_text(address) {
        console.log('read_text', hexdump(address));
        
        // detect block size with terminated_pattern
        Memory.scan(address, 4096, terminated_pattern, {
            onMatch: function (found, size) {
                const len = align(found.sub(address).toInt32(), text_padding);
                if (len > 0) {
                    const buf = address.readByteArray(len);
                    console.log('buf', buf);
                    
                    // decode and apply filter
                    const str = decoder.decode(buf)
                        /* filter1: controls -> \n */
                        .replace(/[\u0000-\u001F\u007F-\u009F\xFFFD]/g, '\n')
                        /* filter2: remove line that do not contain any JP char */
                        .replace(/^(?!.*[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf\u2605-\u2606\u2190-\u2195\u203B]+.*).+$/mg, '')
                        /* filter3: single \n */
                        .replace(/\n{2,}/g, '\n')
                        /* filter4: remove trailing \n */
                        .replace(/\n+$/, '')
                        /* filter5: ? */
                        ;
                    
                    //console.log('----------------\n'+str);
                    trans.send(str); // send to translation aggregator
                }
                
                return 'stop';
            },
            onComplete: function () { textAddress = null; }
        });
    }
    
    function align(value, alignment) { // 1 2 4 8 16
        return (value + (alignment - 1)) & ~(alignment - 1);
    }
    
    function _main_() {
        var str_address = prompt('Make sure you get the corrected address for each of new sentence when the dialog was changed.\n\nAddress?');
        if (!str_address) return;
        
        // ask user
        var address = parseInt(str_address.trim());
        if (!address) _main_();
        else {
            var encoding = prompt('Encoding?\n1. utf-8\n2. utf-16le\n3. utf-32le\n4. shift_jis', 'utf-8');
            encoding = getEncodingName(encoding);
            globalThis.decoder = new TextDecoder(encoding);
            
            globalThis.terminated_pattern = encoding.toUpperCase().startsWith('UTF-32') ? '00 00 00 0?' : '00 0?';
            var terminated = prompt('terminated pattern?\n- 00\n- 00 0?\n- 00 00 00 0?', terminated_pattern);
            if (terminated) terminated_pattern = terminated;
            terminated_pattern = terminated_pattern.replace(/\s/g, ''); // all whitespace, not just the literal space
            
            globalThis.text_padding = terminated_pattern.length / 2; // byteCount
            
            mem_watch(ptr(address));
        }
    }

    function mem_watch(address) {
        var debounce = null;
        console.log('mem_watch: ', address);

        // set breakpoint on write (w) at address, size=1, all threads (-1).
        const bp = hwbp.add(address, 'w', 1, function () {
            clearTimeout(debounce);
            debounce = setTimeout(read_text, 750, address);
        } /*onEnter*/, -1 /*threadId*/);

        if (!bp) console.log('[Error] HWBP.add');
    }
    
    function getEncodingName(s) {
        if (isNaN(s)) return s;
        
        switch (s) {
            case '1': return 'utf-8';
            case '2': return 'utf-16le';
            case '3': return 'utf-32le';
            case '4': return 'shift_jis';
            default:  return 'utf-8';
        }
    }
})();