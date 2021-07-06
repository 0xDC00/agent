// ==UserScript==
// @name         TAISHO x ALICE Episode 1
// @version      0.1
// @author       [DC]
// @description  Inline hook
// ==/UserScript==
(function() {
	console.log('Script loaded!');
	global.__e = Process.enumerateModules()[0];
	const rvaFnGetText = 0x6E300;
	Interceptor.attach(__e.base.add(rvaFnGetText), {
		onEnter: function (args) {
			const str = args[1].readShiftJisString();
			trans.send(str);
		}
	});
})();

// this.returnAddress 0x415667 dialog
// this.returnAddress 0x415618 name