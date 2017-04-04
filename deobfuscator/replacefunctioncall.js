/**
 * Under construction
 */

var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');
var comm = require('./comm.js');
var SandboxEval = require('./sandboxeval.js');

/* Temporary, syntax should be improved */

deobfuscator = (function(){
    var fnLiterals = [], seval;

    var validateInput = function(expr) {
        var len = expr.body.length;
        if(expr.body[len - 1].type == "ExpressionStatement" &&
        expr.body[len - 1].expression.type == "ArrayExpression") {
            expr.body[len - 1].expression["elements"].forEach(function(el) {
                if(!el.value) {
                    return false;
                }
                fnLiterals.push(el.value);
            });
            return true;
        }
        else {
            return false;
        }
    };
    var condition = function(node) {
        if(node.type == "CallExpression" &&
        node.callee &&
        node.callee.type == "Identifier") {
            var index = fnLiterals.indexOf(node.callee.name);
            return index == -1 ? false : index;
        }
    };

    var replace = function(node) {

        // This part is a pseudocode, have not been tested
        var codeToEval = escodegen.generate(node);
        var result = seval.getResult(codeToEval);

        return {
            type: "Literal",
            value: result
        };
    };

    var deobfuscate = function(inputvar, code) {
        var inputExpr = esprima.parse(inputvar);
        if(!validateInput(inputExpr)) {
            comm.throwError("Unexpected input.");
            return false;
        }

        seval = new SandboxEval();
        seval.getResult(inputvar);  // declare functions in the iframe's scope, we don't expect any return value.

        var codeExpr = esprima.parse(code);

        codeExpr = estraverse.replace(codeExpr, {
            enter: function(node) {
                var i = condition(node);
                if( i !== false ) {
                    return replace(node);
                }
            }
        });

        return escodegen.generate(comm.concatStrings(codeExpr));

    };

    return {
        deobfuscate: deobfuscate
    };
})();


module.exports = deobfuscator;