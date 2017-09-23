var expect = require('chai').expect;

var esprima = require('esprima');
var escodegen = require('escodegen');

var comm = require('../deobfuscator/comm.js');

var deobfuscate = require('../deobfuscator/replace-scope-literal.js').deobfuscate;

describe('replace-scope-literal', function() {

	it('inlines constant string variables in a single scope', function() {
		var code = `
			(function() {
			    var a = 'lSto',b = 'tIt', c = 'em', d='rage';
			    return window['loca' + a + d]['ge' + b + c]('date');
			})();
		`;
		var deobfuscated = deobfuscate(code);
			expect(linesOf(deobfuscated)).to.eql(linesOf(`(function () {
				return window['localStorage']['getItem']('date');
			}());`))
	});

});

function linesOf(code) {
	return code.split('\n').map(line => line.trim());
}
