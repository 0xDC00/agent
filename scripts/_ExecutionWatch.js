// ==UserScript==
// @name         DynamicHook
// @version      0.1
// @author       [DC]
// @description  
//    This script use pattern search for hooking (like H-Code but dynamic).
//    This way may work for almost titles (PC, Emulator: ppsspp, yuzu,...).
//   * Warning:
//       How to create D-CODE: https://github.com/0xDC00/agent/wiki/Finding-D-CODE
//       D-CODE database: https://docs.google.com/spreadsheets/d/14k5TBc2cAed8Fcx2fb5schlPh6Ah24dmW3dJpxvNAbc/
// ==/UserScript==
(function () {
    console.log('Script loaded!');
    //const _FIXED_DCODE_ = ''; // <-- SPECIFIC GAME SETTING

    while (Process.isDebuggerAttached()) prompt('Please exit the debugger!');

    _main_();

    // String block may contain controls code, that will need a custom parser.
    function filters_text(s) {
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

    function read_text(info) {
        const address = info.address;
        console.log('read_text', hexdump(address, { header: false }));

        // detect block size with terminated_pattern
        Memory.scan(address, 4096, info.terminated, {
            onMatch: function (found, size) {
                const len = align(found.sub(address).toInt32(), info.padding);
                if (len > 0) {
                    const buf = address.readByteArray(len);
                    console.log('buf', hexdump(buf, { header: false }));

                    const str = filters_text(info.decoder.decode(buf));

                    trans.send(str); // send to translation aggregator
                }

                return 'stop';
            },
            onComplete: function () { info.address = null; }
        });
    }

    function align(value, alignment) { // 1 2 4 8 16
        return (value + (alignment - 1)) & ~(alignment - 1);
    }

    function _main_() {
        globalThis.readDelay = 750;
        globalThis.isLeading = false;

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
        if (typeof _FIXED_DCODE_ === 'string' || _FIXED_DCODE_ instanceof String) {
            const codes = _FIXED_DCODE_.split(';'); // multiple hooks (max=4): dcode;dcode;...
            var count = 0;
            for (const code of codes) {
                if (code[0] == '$') {
                    if (execDCode(code) && ++count == 4) break;
                }
            }
            return;
        }

        var input = prompt('Address (0x..?)\nor\nD-CODE ($..?)'); // 256 chars limit, TODO: rewrite prompt
        if (!input) return;

        input = input.trim();
        if (input[0] == '$') {
            if (!execDCode(input)) return _main_();
        } // TODO: support H-Code
        else { // ask user
            if (!parseInt(input)) _main_();
            else {
                var encoding = prompt('Encoding?\n1. utf-8\n2. utf-16le\n3. utf-32le\n4. shift_jis', 'utf-8');
                encoding = getEncodingName(encoding);

                var terminated_pattern = encoding.toUpperCase().startsWith('UTF-32') ? '00 00 00 0?' : '00 0?';
                var terminated = prompt('terminated pattern?\n- 00\n- 00 0?\n- 00 00 00 0?', terminated_pattern);
                if (terminated) terminated_pattern = terminated;
                terminated_pattern = terminated_pattern.replace(/\s/g, ''); // all whitespace, not just the literal space

                var dcode = '$' + encoding + ',' + terminated_pattern + ',' + input;
                execDCode(dcode);
            }
        }
    }

    function execDCode(sdcode) {
        console.log('Load: ' + sdcode);
        const dcode = {
            readDelay: readDelay,
            isLeading: isLeading
        };
        var splited = sdcode.substr(1).split(','); // Dcode,Read,Hook

        /* parse Decode: encoding */
        dcode.decoder = new TextDecoder(splited[0]);

        /* parse Read: ?padding_1248|?delay|?isLeading|terminatedPattern */
        dcode.terminated = splited[1].replace(/\s/g, '');
        var termSplited = dcode.terminated.split('|');
        if (termSplited.length > 1) {
            dcode.terminated = termSplited[termSplited.length - 1]; // last

            // padding can be empty: |?delay|terminated
            dcode.padding = termSplited[0] ? parseInt(termSplited[0]) : dcode.terminated.length / 2;

            // delay can be empty:   ||terminated
            if (termSplited.length > 2) {
                if (termSplited[1]) dcode.readDelay = parseInt(termSplited[1]);

                dcode.isLeading = termSplited[2] === '1';
            }
        }
        else {
            dcode.padding = dcode.terminated.length / 2; // default: byteCount
        }

        /* parse Hook: ?offset|?expressions|movHookPattern */
        splited = splited[splited.length - 1].split('|');
        if (splited.length > 1) {
            // offset can be empty:      |?expressions|movHookPattern
            if (splited[0]) dcode.offset = parseInt(splited[0]);

            // expressions can be empty: ||movHookPattern
            if (splited[1]) dcode.expressions = splited[1].replace(/\s/g, '');
        }
        else dcode.offset = 0;
        dcode.pattern = splited[splited.length - 1];

        return hookByPattern(dcode);
    }

    function hookByPattern(dcode) {
        var pattern = dcode.pattern, splited;

        /* find hook address */
        if (pattern.startsWith('0x')) { /* VA */
            dcode.address = ptr(pattern);
            return exec_watch(dcode);
        }
        else if ((splited = pattern.split('$:')).length > 1) { /* x64dbg style (mod$:RVA): $:1122FF (exe), .dll$:1122FF */
            const base = splited[0] ? Process.getModuleByName(splited[0]).base : Process.enumerateModules()[0].base;
            dcode.address = base.add('0x' + splited[1]);
            return exec_watch(dcode);
        }
        else if ((splited = pattern.split(':')).length > 1) { /* x64dbg style: mod:export */
            const mod = splited[0] ? Process.getModuleByName(splited[0]) : Process.enumerateModules()[0];
            dcode.address = mod.findExportByName(splited[1]);
            if (dcode.address) return exec_watch(dcode);
            return false;
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
                    dcode.address = address.add(dcode.offset);
                    console.log('[Pattern] found:', address);
                    return exec_watch(dcode);
                }
            }

            console.log('[Pattern] no result!');
            return false;
        }
    }

    // debounce trailing (run after last execute): https://miro.medium.com/max/1400/1*-r8hP_iDBPrj-odjIZajzw.gif
    function createDebounceCallback(func, info, getMemoryAddress) {
        const timeout = info.readDelay;
        var timer = null;
        info.address = null;
        info.buffer = null;

        if (info.isLeading) { // debounce leading
            return function () {
                if (!timer) {
                    console.log('onEnter', getMemoryAddress(this.context));
                    info.address = getMemoryAddress(this.context);
                    info.buffer = info.address.readByteArray(4096);
                    info.address = info.buffer.unwrap();
                    func.call(this, info);
                }

                clearTimeout(timer);
                timer = setTimeout(function () { timer = undefined; console.log('done'); }, timeout);
            };
        }

        if (timeout == 0) { // runSync when noDelay
            return function () {
                console.log('onEnter', getMemoryAddress(this.context));
                info.address = getMemoryAddress(this.context);
                info.buffer = info.address.readByteArray(4096);
                info.address = info.buffer.unwrap();
                func.call(this, info);
            };
        }

        return function () {
            console.log('onEnter', getMemoryAddress(this.context));
            if (info.address == null) {
                // fist time <=> begin of line
                // Problem: fast next => first line!
                info.address = getMemoryAddress(this.context);
            }

            clearTimeout(timer);
            timer = setTimeout(func, timeout, info);
        };
    }

    function exec_watch(dcode) {
        const insAddress = dcode.address;
        console.log('exec_watch:', insAddress, '\nInstruction:', Instruction.parse(insAddress).toString());
        const getMemoryAddress = dcode.expressions ? genGetMemoryAddressFromExpressions(dcode.expressions) : genGetMemoryAddress(insAddress);
        const callback = createDebounceCallback(read_text, dcode, getMemoryAddress);
        console.log('getMemoryAddress: ', getMemoryAddress);

        // set breakpoint on excute (x) at insAddress, all threads (-1).
        // KnowIssue: live reload, re-set hwbp = random crash (Interceptor.attach work but freeze when reload)
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

/*
Refs:
https://gist.github.com/ryanmcgrath/982242
  https://stackoverflow.com/questions/15033196/using-javascript-to-check-whether-a-string-contains-japanese-characters-includi/15034560
https://stackoverflow.com/questions/28256/equation-expression-parser-with-precedence
*/