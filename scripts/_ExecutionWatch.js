// ==UserScript==
// @name         DynamicHook
// @version      0.1
// @author       [DC]
// @description  
//    This script use pattern search for hooking.
//    This way may work for almost target (PC, Emulator: ppsspp, yuzu,...).
//   * Warning:
//       D-CODE wiki: https://github.com/0xDC00/agent/wiki/Finding-D-CODE
//       D-CODE database: https://docs.google.com/spreadsheets/d/14k5TBc2cAed8Fcx2fb5schlPh6Ah24dmW3dJpxvNAbc/
// ==/UserScript==
(function () {
    console.log('Script loaded!');
    while (Process.isDebuggerAttached()) prompt('Please exit the debugger!');

    _main_();

    function filters_text(s) { // String block may contain controls code, that will need a custom parser.
        return s
            /* filter1: controls -> \n */
            .replace(/[\u0000-\u001F\u007F-\u009F\xFFFD]/g, '\n')
            /* filter2: remove line that do not contain any JP char */
            .replace(/^(?!.*[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf\u2605-\u2606\u2190-\u2195\u203B]+.*).+$/mg, '')
            /* filter3: single \n */
            .replace(/\n{2,}/g, '\n')
            /* filter4: remove trailing \n */
            .replace(/\n+$/, '')
            /* filter5: single line */
            //.replace(/\n+/, ' ')
            ;
    }

    var previousString; // only submit new string
    function submitTranslate(dcode, buf) {
        const str = filters_text(dcode.decoder.decode(buf));
        if (str) {
            if (str !== previousString) {
                console.log('|\n' + hexdump(dcode.address, { header: false, length: buf.byteLength }));
                previousString = str;
                trans.send(str); // send to translation aggregator
            }
            else console.log('>');
        }
    }
    
    function read_text(dcode) {
        const address = dcode.address;
        console.log(hexdump(address, { header: false }));

        if (!dcode.terminated) { // fixed-size buffers
            const buf = dcode.buffer ? dcode.buffer : address.readByteArray(dcode.bufferSize); // ?snapshot
            submitTranslate(dcode, buf);
        }
        else { // detect block size with terminated_pattern
            dcode._scan.call(dcode, address, dcode.bufferSize, dcode.terminated, {
                onMatch: function (found, _) {
                    const len = align(found.sub(address).toInt32(), dcode.padding);
                    if (len > 0) {
                        const buf = address.readByteArray(len); // ArrayBuffer.wrap = random CRASH
                        submitTranslate(dcode, buf);
                    }
                    return 'stop';
                },
                onComplete: function () { if (!dcode.debounce) dcode.address = null; } // reset first-address
            });
        }
    }

    function alignScan(address, size, _, o) {
        const view = new DataView(address.readByteArray(size));
        for (let i=0; i<size; i+=this.align) {
            const t = view[this.fnRead](i, true);
            if (t === this.needle) {
                if (o.onMatch(address.add(i), this.align) === 'stop') break;
            }
        }
        o.onComplete();
    }

    function align(value, alignment) { // 1 2 4 8 16
        return (value + (alignment - 1)) & ~(alignment - 1);
    }

    function _main_() {
        if (typeof globalThis.filters === 'function') {
            globalThis._filters = filters_text;
            filters_text = filters;
        }
        if (typeof globalThis.decode === 'function') {
            const __decode = TextDecoder.prototype.decode;
            var thiz; globalThis._decode = function (buffer) { return __decode.call(thiz, buffer); }
            TextDecoder.prototype.decode = function (buffer) {
                thiz = this;
                return globalThis.decode.call(this, buffer);
            };
        }
        if (typeof _FIXED_DCODE_ === 'string' || (typeof _FIXED_DCODE_ !== 'undefined' && _FIXED_DCODE_ instanceof String)) {
            const codes = _FIXED_DCODE_.split(';'); // multiple hooks (max=4): dcode;dcode;...
            var count = 0;
            for (const code of codes) {
                if (code[0] == '$') {
                    if (loadDcode(code) && ++count == 4) break;
                }
            }
            return;
        }

        var input = prompt('Address (0x..?)\nor\nD-CODE ($..?)'); // 256 chars limit, TODO: rewrite prompt
        if (!input) return;

        input = input.trim();
        if (input[0] == '$') {
            if (!loadDcode(input)) return _main_();
        } // TODO: support H-Code
        else { // ask user
            if (!parseInt(input)) _main_();
            else {
                var encoding = prompt('Encoding?\n1. utf-8\n2. utf-16le\n3. utf-32le\n4. shift_jis', 'utf-8');
                encoding = getEncodingName(encoding);

                var terminated_pattern = encoding.toUpperCase().startsWith('UTF-32') ? '00 00 00 00' : '00 00';
                var terminated = prompt('terminated pattern?\n- 00\n- 00 0?\n- 00 00 00 0?', terminated_pattern);
                if (terminated) terminated_pattern = terminated;
                terminated_pattern = terminated_pattern.replace(/\s/g, ''); // all whitespace, not just the literal space

                var dcode = '$' + encoding + ',' + terminated_pattern + ',' + input;
                loadDcode(dcode);
            }
        }
    }

    function loadDcode(sdcode) {
        console.log('Load: ' + sdcode);
        const dcode = {
            readDelay: 750
        };
        var splited = sdcode.substr(1).split(','); // Decode,Read,Hook

        /* parse Decode: encoding */
        dcode.decoder = new TextDecoder(splited[0]);

        /* parse Read: ?padding_1248|?debounceOption|terminatedPattern */
        dcode.bufferSize = 4096;
        dcode.terminated = splited[1].replace(/\s/g, '');
        var termSplited = dcode.terminated.split('|');
        if (termSplited.length > 1) {
            dcode.terminated = termSplited[termSplited.length - 1]; // last

            // padding can be empty: |?debounceOption|terminated
            dcode.padding = termSplited[0] ? parseInt(termSplited[0]) : dcode.terminated.length / 2;

            // debounceOption can be empty:   ||terminated
            if (termSplited[1]) {
                const timeout = termSplited[1].match(/\d+$/g);
                if (timeout) dcode.readDelay = parseInt(timeout[0]);

                const debounce = termSplited[1].match(/^\D+/g);
                if (debounce) dcode.debounce = debounce[0];
            }
        }
        else {
            dcode.padding = dcode.terminated.length / 2; // default: byteCount
        }
        if (dcode.terminated[0] === '*') { // *SIZE
            const s = dcode.terminated.substr(1);
            if (s) dcode.bufferSize = parseInt(s);
            dcode.terminated = undefined;
        }
        else { //  prefer alignScan
            dcode._scan = Memory.scan;
            if (!dcode.terminated.includes('?') && dcode.padding > 1) {
                const align = dcode.terminated.length / 2;
                if (align === 2) dcode.fnRead = 'getUint16';
                else if (align === 4) dcode.fnRead = 'getUint32';
                if (dcode.fnRead) {
                    dcode._scan = alignScan;
                    dcode.align = align;
                    dcode.needle = parseInt(dcode.terminated.match(/../g).reverse().join(''), 16);
                }
            }
            dcode.padding = Math.abs(dcode.padding);
        }

        /* parse Hook: ?offset|?expressions|movHookPattern */
        dcode.offset = 0;
        splited = splited[splited.length - 1].split('|');
        if (splited.length > 1) {
            // offset can be empty:      |?expressions|movHookPattern
            if (splited[0]) dcode.offset = parseInt(splited[0]);

            // expressions can be empty: ||movHookPattern
            if (splited[1]) dcode.expressions = splited[1].replace(/\s/g, '');
        }
        dcode.pattern = splited[splited.length - 1];
        dcode.address = findHookAddress(dcode);

        return dcode.address ? exec_watch(dcode) : false;
    }

    function findHookAddress(dcode) {
        var pattern = dcode.pattern, splited;

        if (pattern.startsWith('0x')) { /* VA */
            return ptr(pattern);
        }
        else if ((splited = pattern.split(':$')).length > 1) { /* x64dbg style (mod:$RVA): :$1122FF (exe), .dll:$1122FF */
            const base = splited[0] ? Process.getModuleByName(splited[0]).base : Process.enumerateModules()[0].base;
            return base.add('0x' + splited[1]);
        }
        else if ((splited = pattern.split(':')).length > 1) { /* x64dbg style: mod:export */
            const mod = splited[0] ? Process.getModuleByName(splited[0]) : Process.enumerateModules()[0];
            return mod.findExportByName(splited[1]);
        }
        else {
            var ranges = [];
            if ((splited = pattern.split('$')).length > 1) { /*mod$pattern*/
                pattern = splited[1];
                const range = splited[0] ? Process.getModuleByName(splited[0]) : Process.enumerateModules()[0];
                ranges.push(range);
            }
            else { /* emulator jit: rwx (yuzu) */
                ranges = Process.enumerateRanges({ protection: 'r-x', coalesce: true });
            }

            console.log('Pattern:', pattern);
            for (const range of ranges) {
                const results = Memory.scanSync(range.base, range.size, pattern);
                if (results.length > 0) {
                    const address = results[0].address;
                    console.log('[Pattern] found:', address);
                    return address.add(dcode.offset);
                }
            }

            console.log('[Pattern] no result!');
            return false;
        }
    }

    // debounce trailing (run after last execute): https://miro.medium.com/max/1400/1*-r8hP_iDBPrj-odjIZajzw.gif
    function createDebounceCallback(func, dcode, getMemoryAddress) {
        let timer = null;
        const timeout = dcode.readDelay;
        const dbMode = dcode.debounce;
        dcode.address = null;
        dcode.buffer = null;

        function runSync() {
            dcode.address = getMemoryAddress(this.context);
            dcode.buffer = dcode.address.readByteArray(dcode.bufferSize);
            dcode.address = dcode.buffer.unwrap();
            func.call(this, dcode);
        }

        if (timeout === 0) { // runSync when noDelay
            return function () {
                console.log('onEnter', getMemoryAddress(this.context));
                runSync.call(this);
            };
        }
        else if (dbMode === 'lt' || dbMode === 'lT') { // debounce leading (sync) & trailing (sync ? CALLBACK)
            let count = 0;
            const isSync = dbMode === 'lt';
            return function () {
                count++;
                dcode.address = getMemoryAddress(this.context);
                console.log('onEnter', dcode.address);
                if (!timer) runSync.call(this);
                else if (isSync) {
                    dcode.buffer = dcode.address.readByteArray(dcode.bufferSize);
                    dcode.address = dcode.buffer.unwrap();
                }
                
                clearTimeout(timer);
                timer = setTimeout(function () { timer = undefined; if (count > 1) func.call(this, dcode); count = 0; }, timeout);
            };
        }
        else if (dbMode === 'l') {// debounce leading (sync)
            return function () {
                console.log('onEnter', getMemoryAddress(this.context));
                if (!timer) runSync.call(this);

                clearTimeout(timer);
                timer = setTimeout(function () { timer = undefined; console.log('>>>'); }, timeout);
            };
        }
        else if (dbMode === 't' || dbMode === 'T') { // debounce trailing (sync ? CALLBACK)
            const isSync = dbMode === 't';
            return function () {
                dcode.address = getMemoryAddress(this.context);
                console.log('onEnter', dcode.address);
                if (isSync) {
                    dcode.buffer = dcode.address.readByteArray(dcode.bufferSize);
                    dcode.address = dcode.buffer.unwrap();
                }
                clearTimeout(timer);
                timer = setTimeout(func, timeout, dcode);
            };
        }
        else {
            // default: trailing first (callback)
            // fist time <=> begin of line (Problem: fast next => first line!)
            dcode.debounce = undefined;
            return function () {
                console.log('onEnter', getMemoryAddress(this.context));
                if (dcode.address == null) dcode.address = getMemoryAddress(this.context);

                clearTimeout(timer);
                timer = setTimeout(func, timeout, dcode);
            };
        }
    }

    function exec_watch(dcode) {
        const insAddress = dcode.address;
        console.log('exec_watch:', insAddress, '\nInstruction:', Instruction.parse(insAddress).toString());
        const getMemoryAddress = dcode.expressions ? genGetMemoryAddressFromExpressions(dcode.expressions) : genGetMemoryAddress(insAddress);
        const callback = createDebounceCallback(read_text, dcode, getMemoryAddress);
        console.log('getMemoryAddress: ', getMemoryAddress);

        // set breakpoint on excute (x) at insAddress, all threads (-1).
        // KnowIssue: live reload, re-set hwbp = random crash (Interceptor.attach work but freeze when reload, +-2GB limit)
        const bp = hwbp.add(insAddress, 'x', 1, callback, -1);
        console.log(bp ? `HWBP at ${insAddress} set!` : '[Error] HWBP.add');
        return bp ? true : false;
    }

    function genGetMemoryAddressFromExpressions(expressions) {
        // ex: [esp+4]+8
        const body = 'return ' + getExpressionsParser()(expressions) + ';';
        return new Function('ctx', body);
    }

    function genGetMemoryAddress(address) {
        const ins = Instruction.parse(address);

        // mov rcx, [???]     ; mov* reg, mem
        // mov [???], rcx     ; mov* mem, reg
        const memop = ins.operands[0].type == 'mem' ? ins.operands[0].value : ins.operands[1].value;
        return createExpressionFuntion(memop);
    }

    function createExpressionFuntion(op) {
        /*
        ex: mov rdx, qword ptr [rdx + r8 - 8]
        
        "base": "rdx", // any
        "index": "r8", // optional
        "scale": 1,    // 1 2 4 8
        "disp": -8     // any
        */
        var body = `var base = ctx.${op.base};`;
        if (op.index) {
            if (op.scale > 1) body += `base = base.add(ctx.${op.index} * ${op.scale});`;
            else body += `base = base.add(ctx.${op.index});`;
        }
        else {
            if (op.scale > 1) body += `base = ptr(base * ${op.scale});`;
        }
        if (op.disp) body += `base = base.add(${op.disp});`;
        body += 'return base;';
        return new Function('ctx', body);
    }

    function getEncodingName(s) {
        if (isNaN(s)) return s;

        switch (s) {
            case '1': return 'utf-8';
            case '2': return 'utf-16le';
            case '3': return 'utf-32le';
            case '4': return 'shift_jis';
            default: return 'utf-8';
        }
    }

    function getExpressionsParser() {
        // operator table (* / %, + -, << >>, < <= > >=, == !=, &, ^, |, &&, ||)
        const ops = {
            '+': { op: '+', precedence: 10, assoc: 'L', exec: function (l, r) { return /*l+r*/ `${l}.add(${r})`; } },
            '-': { op: '-', precedence: 10, assoc: 'L', exec: function (l, r) { return /*l-r*/ `${l}.sub(${r})`; } },
            '*': { op: '*', precedence: 20, assoc: 'L', exec: function (l, r) { return /*l*r*/ `$ptr(${l}*${r})`; } },
            '/': { op: '/', precedence: 20, assoc: 'L', exec: function (l, r) { return /*l/r*/ `$ptr(${l}/${r})`; } },
            '&': { op: '&', precedence: 6, assoc: 'L', exec: function (l, r) { return /*l&r*/ `${l}.and(${r})`; } },
            '|': { op: '|', precedence: 4, assoc: 'L', exec: function (l, r) { return /*l|r*/ `${l}.or(${r})`; } }
        };

        // constants or variables
        //var vars = { e: Math.exp(1), pi: Math.atan2(1,1)*4 };

        const parens = {
            "(": { open: '(', close: ')', prefix: '', postfix: '' },
            "[": { open: '[', close: ']', prefix: '', postfix: '.readPointer()' },
            "BYTE:[": { open: 'BYTE:[', close: ']', prefix: 'ptr(', postfix: '.readU8())' },
            "WORD:[": { open: 'WORD:[', close: ']', prefix: 'ptr(', postfix: '.readU16())' },
            "DWORD:[": { open: 'DWORD:[', close: ']', prefix: 'ptr(', postfix: '.readU32())' }
        };

        function tryParseParens(r) {
            for (const key in parens) {
                if (Object.hasOwnProperty.call(parens, key)) {
                    if (r.string.substr(r.offset, key.length).toUpperCase() == key) {
                        const element = parens[key];
                        var value = element.prefix;

                        r.offset += key.length;   // eat "("
                        value += parseExpr(r);
                        if (r.string.substr(r.offset, element.close.length).toUpperCase() == element.close) {
                            r.offset += element.close.length; // eat ")"
                            value += element.postfix;
                            return value;
                        }
                        r.error = `Parsing error: '${element.close}' expected`;
                        throw 'parseError';
                    }
                }
            }

            return '';
        }

        // input for parsing
        // var r = { string: '123.45+33*8', offset: 0 };
        // r is passed by reference: any change in r.offset is returned to the caller
        // functions return the parsed/calculated value
        function parseVal(r) {
            var startOffset = r.offset;
            var value;
            var m;
            // floating point number
            // example of parsing ("lexing") without aid of regular expressions
            //value = 0;
            value = '';
            if (r.string.substr(r.offset, 2) == "0x") while ("0123456789xabcdefABCDEF".indexOf(r.string.substr(r.offset, 1)) >= 0 && r.offset < r.string.length) r.offset++;
            else while ("0123456789".indexOf(r.string.substr(r.offset, 1)) >= 0 && r.offset < r.string.length) r.offset++;
            // if(r.string.substr(r.offset, 1) == ".") {
            //     r.offset++;
            //     while("0123456789xabcdefABCDEF".indexOf(r.string.substr(r.offset, 1)) >= 0 && r.offset < r.string.length) r.offset++;
            // }
            if (r.offset > startOffset) {  // did that work?
                // OK, so I'm lazy...
                //return parseFloat(r.string.substr(startOffset, r.offset-startOffset));
                return r.string.substr(startOffset, r.offset - startOffset);
            } else if (r.string.substr(r.offset, 1) == "+") {  // unary plus
                r.offset++;
                return parseVal(r);
            } else if (r.string.substr(r.offset, 1) == "-") {  // unary minus
                r.offset++;
                return negate(parseVal(r));
            } else if ((value = tryParseParens(r)) !== '') {   // expression in parens
                return value;
            } else if (m = /^[a-z_][a-z0-9_]*/i.exec(r.string.substr(r.offset))) {  // variable/constant name        
                // sorry for the regular expression, but I'm too lazy to manually build a varname lexer
                var name = m[0];  // matched string
                r.offset += name.length;
                // if(name in vars) return vars[name];  // I know that thing!
                // r.error = "Semantic error: unknown variable '" + name + "'";
                // throw 'unknownVar';
                return 'ctx.' + name;
            } else {
                if (r.string.length == r.offset) {
                    r.error = 'Parsing error at end of string: value expected';
                    throw 'valueMissing';
                } else {
                    r.error = "Parsing error: unrecognized value";
                    throw 'valueNotParsed';
                }
            }
        }

        function negate(value) {
            //return -value;
            return isNaN(value) ? `NULL.sub(ctx.${value})` : `NULL.sub(${value})`;
        }

        function parseOp(r) {
            // if(r.string.substr(r.offset,2) == '**') {
            //     r.offset += 2;
            //     return ops['**'];
            // }
            if ("+-*/&|".indexOf(r.string.substr(r.offset, 1)) >= 0)
                return ops[r.string.substr(r.offset++, 1)];
            return null;
        }

        function parseExpr(r) {
            var stack = [{ precedence: 0, assoc: 'L' }];
            var op;
            var value = parseVal(r);  // first value on the left
            if (!isNaN(value)) value = `ptr(${value})`;
            for (; ;) {
                op = parseOp(r) || { precedence: 0, assoc: 'L' };
                while (op.precedence < stack[stack.length - 1].precedence ||
                    (op.precedence == stack[stack.length - 1].precedence && op.assoc == 'L')) {
                    // precedence op is too low, calculate with what we've got on the left, first
                    var tos = stack.pop();
                    if (!tos.exec) return value;  // end  reached
                    // do the calculation ("reduce"), producing a new value
                    value = tos.exec(tos.value, value);
                }
                // store on stack and continue parsing ("shift")
                stack.push({ op: op.op, precedence: op.precedence, assoc: op.assoc, exec: op.exec, value: value });
                value = parseVal(r);  // value on the right
            }
        }

        function parse(string) {   // wrapper
            var r = { string: string, offset: 0 };
            try {
                var value = parseExpr(r);
                if (r.offset < r.string.length) {
                    r.error = 'Syntax error: junk found at offset ' + r.offset;
                    throw 'trailingJunk';
                }
                return value;
            } catch (e) {
                //alert(r.error + ' (' + e + '):\n' + r.string.substr(0, r.offset) + '<*>' + r.string.substr(r.offset));
                throw (r.error + ' (' + e + '):\n' + r.string.substr(0, r.offset) + '<*>' + r.string.substr(r.offset));
                return;
            }
        }
        return parse;
    }
})();