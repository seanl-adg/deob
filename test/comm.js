var expect = require('chai').expect;

var esprima = require('esprima');
var escodegen = require('escodegen');

var comm = require('../deobfuscator/comm.js');


describe('comm', function() {
  describe('concatStrings()', function() {
    var codes = [
        [ "1 + '2'",                "1 + '2';"          ],
        [ "a + '1' + ('2' + b)",    "a + '12' + b;"     ],
        [ "'a' + b + 'c' + 'd'",    "'a' + b + 'cd';"   ]
    ];

    codes.forEach(function(code) {
        it('should concatenate an expression ' + code[0] + ' to ' + code[1], function() {
            var ast = esprima.parse(code[0]);
            ast = comm.concatStrings(ast);
            var concatdCode = escodegen.generate(ast);
            expect(concatdCode).to.equal(code[1]);
        })
    })
  });

  describe('foldLiterals()', function() {
      var codes = [
          ["1 + 2", "3"],
          ["true ? 1 : 2", "1"],
          ["(434, 124) <= (72, 98) ? null : (594, 125) >= 45 ? (112, 1502002290) : (441, 776) <= (38, 233) ? 'k' : (2, 28)", "1502002290"]
      ];

      codes.forEach(function(code) {
        it('should fold an expression ' + code[0] + ' to ' + code[1], function() {
            var ast = esprima.parse(code[0]);
            ast = ast.body[0].expression;
            ast = comm.reduceLiterals(ast);
            console.log(ast);
            var foldedCode = escodegen.generate(ast);
            expect(foldedCode).to.equal(code[1]);
        });
    });
  });
});