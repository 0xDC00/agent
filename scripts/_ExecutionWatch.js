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
    console.log('Script loaded! isDebuggerAttached: ', Process.isDebuggerAttached());
    const _FIXED_DCODE_ = ''; // <-- SPECIFIC GAME SETTING
    
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
                    
                    // decode and apply filter (TODO: let translator handle it?)
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
        globalThis.textAddress = null;
        if (_FIXED_DCODE_) {
            execDCode(_FIXED_DCODE_);
            return;
        }
        
        var str_address = prompt('Address (0x..?)\nor\nD-CODE ($..?)'); // 256 chars limit, TODO: rewrite prompt
        if (!str_address) return;
        
        str_address = str_address.trim();
        if (str_address[0] == '$') {
            execDCode(str_address);
        }
        else {
            // ask user
            var address = parseInt(str_address);
            if (!address) _main_();
            else {
                var encoding = prompt('Encoding?\n1. utf-8\n2. utf-16le\n3. utf-32le\n4. shift_jis', 'utf-8');
                encoding = getEncodingName(encoding);
                globalThis.decoder = new TextDecoder(encoding);
                
                globalThis.terminated_pattern = encoding.toUpperCase().startsWith('UTF-32') ? '00 00 00 0?' : '00 0?';
                var terminated = prompt('terminated pattern?\n- 00\n- 00 0?\n- 00 00 00 0?', terminated_pattern);
                if (terminated) terminated_pattern = terminated;
                terminated_pattern = terminated_pattern.replace(/\s/g, ''); // all whitespace, not just the literal space
                
                globalThis.text_padding = terminated_pattern.length / 2;    // default: byteCount
                
                exec_watch(ptr(address));
            }
        }
    }
    
    function execDCode(dcode) { // $encoding,?padding_1248|terminaterPattern,?offset|?expressions|movHookPattern
        const splited = dcode.substr(1).split(',');
        const pattern = splited[splited.length-1];                     // ?offset|?expressions|movHookPattern
        const encoding = splited[0];                                   // encoding
        globalThis.terminated_pattern = splited[1].replace(/\s/g, ''); // ?padding_1248|terminaterPattern

        // try get padding
        var termSplited = terminated_pattern.split('|');
        if (termSplited.length > 1) {
            terminated_pattern = termSplited[termSplited.length-1]; // last
            globalThis.text_padding = parseInt(termSplited[0]); // first
        }
        else {
            globalThis.text_padding = terminated_pattern.length / 2;
        }
        
        globalThis.decoder = new TextDecoder(encoding);
        
        hookByPattern(pattern);
    }
    
    function hookByPattern(pattern) { // ?offset|?expressions|movHookPattern
        var offset = 0, expressions, moduleName;

        var splited = pattern.split('|');
        if (splited.length > 1) {
            pattern = splited[splited.length-1]; // last
            
            if(splited[0])
                offset = parseInt(splited[0]); // first
            
            if (splited.length > 2) {
                expressions = splited[1].replace(/\s/g, ''); // second
            }
        }
        
        // parse block
        if (pattern.startsWith('0x')) { /* VA */
            exec_watch(ptr(pattern), expressions);
            return;
        }
        else if ((splited = pattern.split('$:')).length > 1 ) { /* x64dbg style (mod$:RVA): $:1122FF (exe), .dll$:1122FF */
            if (splited[0]) moduleName = splited[0]; 
            
            const base = moduleName ? Process.getModuleByName(moduleName).base : Process.enumerateModules()[0].base;
            exec_watch(base.add('0x'+splited[1]), expressions);
            return;
        }
        else {
            if ((splited = pattern.split('$')).length > 1) { /*mod$pattern*/
                moduleName = splited[0];
                pattern = splited[1];
                const range = moduleName ? Process.getModuleByName(moduleName) : Process.enumerateModules()[0];
                const results = Memory.scanSync(range.base, range.size, pattern);
                if (results.length > 0) {
                    const address = results[0].address;
                    console.log('[Pattern] found:', address);
                    exec_watch(address.add(offset), expressions);
                    return;
                }
            }
            else { // emulator jit: rwx (yuzu)
                console.log('Pattern:', pattern); /*pattern*/
                const ranges = Process.enumerateRanges({protection: 'r-x', coalesce: true});
                for (const range of ranges) {
                    const results = Memory.scanSync(range.base, range.size, pattern);
                    if (results.length > 0) {
                        const address = results[0].address;
                        console.log('[Pattern] found:', address);
                        exec_watch(address.add(offset), expressions);
                        return;
                    }
                }
            }
            
            console.log('[Pattern] no result!');
            _main_();
        }
    }
    
    function exec_watch(insAddress, expressions) {
        var debounce = null; // run after last execute
        const getMemoryAddress = expressions ? genGetMemoryAddressFromExpressions(expressions) : genGetMemoryAddress(insAddress);
        
        // set breakpoint on excute (x) at insAddress, all threads (-1).
        const bp = hwbp.add(insAddress, 'x', 1, function () {
            console.log('onEnter');
            if (textAddress === null) {
                // fist time <=> begin of line
                // Problem: fast next => first line!
                textAddress = getMemoryAddress(this.context);
            }
            clearTimeout(debounce);
            debounce = setTimeout(read_text, 750, textAddress);
        }, -1); // KnowIssue: live reload = random crash (Interceptor.attach work but freeze when reload)
        
        if (!bp) console.log('[Error] HWBP.add');
        else console.log(`HWBP at ${insAddress} set!`);
    }
    
    function genGetMemoryAddressFromExpressions(expressions) {
        /*
        ex: [esp+4]+8
        */
        const body = 'return ' + getExpressionsParser().parse(expressions) + ';';
        return new Function('ctx', body);
    }
    
    function genGetMemoryAddress(address) {
        const ins = Instruction.parse(address);
        console.log('exec_watch: ', address, ins.toString());
        
        // mov rcx, [???]     ; mov* reg, mem
        // mov [???], rcx     ; mov* mem, reg
        const memop = ins.operands[0].type == 'mem' ? ins.operands[0].value : ins.operands[1].value;
        const fn = createExpressionFuntion(memop);
        
        console.log('getMemoryAddress: ', fn);
        return fn;
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
            if (op.scale > 1) {
                body += `var index = ctx.${op.index} * ${op.scale};`;
                body += 'base = base.add(index);';
            }
            else {
                body += `base = base.add(ctx.${op.index});`;
            }
        }
        else {
            if (op.scale > 1) {
                body += `base = ptr(base * ${op.scale});`;
            }
        }
        if (op.disp) {
            body += `base = base.add(${op.disp});`;
        }
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
            default:  return 'utf-8';
        }
    }
    
    function getExpressionsParser() {
        // operator table
        var ops = {
           '+'  : {op: '+', precedence: 10, assoc: 'L', exec: function(l,r) { return /*l+r*/ `${l}.add(${r})`; } },
           '-'  : {op: '-', precedence: 10, assoc: 'L', exec: function(l,r) { return /*l-r*/ `${l}.sub(${r})`; } },
           '*'  : {op: '*', precedence: 20, assoc: 'L', exec: function(l,r) { return /*l*r*/ `$ptr(${l}*${r})`; } },
           '/'  : {op: '/', precedence: 20, assoc: 'L', exec: function(l,r) { return /*l/r*/ `$ptr(${l}/${r})`; } }
        };

        // constants or variables
        //var vars = { e: Math.exp(1), pi: Math.atan2(1,1)*4 };

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
            while("0123456789xabcdefABCDEF".indexOf(r.string.substr(r.offset, 1)) >= 0 && r.offset < r.string.length) r.offset++;
            // if(r.string.substr(r.offset, 1) == ".") {
            //     r.offset++;
            //     while("0123456789xabcdefABCDEF".indexOf(r.string.substr(r.offset, 1)) >= 0 && r.offset < r.string.length) r.offset++;
            // }
            if(r.offset > startOffset) {  // did that work?
                // OK, so I'm lazy...
                //return parseFloat(r.string.substr(startOffset, r.offset-startOffset));
                return r.string.substr(startOffset, r.offset-startOffset);
            } else if(r.string.substr(r.offset, 1) == "+") {  // unary plus
                r.offset++;
                return parseVal(r);
            } else if(r.string.substr(r.offset, 1) == "-") {  // unary minus
                r.offset++;
                return negate(parseVal(r));
            } else if(r.string.substr(r.offset, 1) == "(") {  // expression in parens
                r.offset++;   // eat "("
                value = parseExpr(r);
                if(r.string.substr(r.offset, 1) == ")") {
                    r.offset++;
                    return value;
                }
                r.error = "Parsing error: ')' expected";
                throw 'parseError';
            } else if(r.string.substr(r.offset, 1) == "[") {  // pointer level
                r.offset++;   // eat "["
                value = parseExpr(r);
                if(r.string.substr(r.offset, 1) == "]") {
                    r.offset++;
                    value += '.readPointer()';
                    return value;
                }
                r.error = "Parsing error: ']' expected";
                throw 'parseError';
            } else if(m = /^[a-z_][a-z0-9_]*/i.exec(r.string.substr(r.offset))) {  // variable/constant name        
                // sorry for the regular expression, but I'm too lazy to manually build a varname lexer
                var name = m[0];  // matched string
                r.offset += name.length;
                // if(name in vars) return vars[name];  // I know that thing!
                // r.error = "Semantic error: unknown variable '" + name + "'";
                // throw 'unknownVar';
                return 'ctx.' + name;
            } else {
                if(r.string.length == r.offset) {
                    r.error = 'Parsing error at end of string: value expected';
                    throw 'valueMissing';
                } else  {
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
            if("+-*/".indexOf(r.string.substr(r.offset,1)) >= 0)
                return ops[r.string.substr(r.offset++, 1)];
            return null;
        }

        function parseExpr(r) {
            var stack = [{precedence: 0, assoc: 'L'}];
            var op;
            var value = parseVal(r);  // first value on the left
            if (!isNaN(value)) value = `ptr(${value})`;
            for(;;){
                op = parseOp(r) || {precedence: 0, assoc: 'L'}; 
                while(op.precedence < stack[stack.length-1].precedence ||
                      (op.precedence == stack[stack.length-1].precedence && op.assoc == 'L')) {  
                    // precedence op is too low, calculate with what we've got on the left, first
                    var tos = stack.pop();
                    if(!tos.exec) return value;  // end  reached
                    // do the calculation ("reduce"), producing a new value
                    value = tos.exec(tos.value, value);
                }
                // store on stack and continue parsing ("shift")
                stack.push({op: op.op, precedence: op.precedence, assoc: op.assoc, exec: op.exec, value: value});
                value = parseVal(r);  // value on the right
            }
        }

        function parse(string) {   // wrapper
            var r = {string: string, offset: 0};
            try {
                var value = parseExpr(r);
                if(r.offset < r.string.length){
                  r.error = 'Syntax error: junk found at offset ' + r.offset;
                    throw 'trailingJunk';
                }
                console.log(value);
                return value;
            } catch(e) {
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