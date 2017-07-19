var esprima = require('esprima');
var escodegen = require('escodegen');
var comm = require('./comm.js');

// Deobfuscate eval packer
var deobfuscator = (function(){
    var validateInput = function(expr) {
        return expr.type == "Program" &&
        expr.body.length == 1 &&
        expr.body[0].type == "ExpressionStatement" &&
        expr.body[0].expression.type == "CallExpression" &&
        expr.body[0].expression.callee.type == "Identifier" &&
        expr.body[0].expression.callee.name == "eval";
    };

    var deobfuscate = function(inputvar, code) {
        var inputExpr = esprima.parse(inputvar);
        if(!validateInput(inputExpr)) {
            comm.throwError("Unexpected Input.");
            return false;
        }

        var modified = {
            "type": "Program",
            "body": [
                {
                    "type": "VariableDeclaration",
                    "declarations": [
                        {
                            "type": "VariableDeclarator",
                            "id": {
                                "type": "Identifier",
                                "name": "evaled"
                            },
                            "init": {
                                "type": "CallExpression",
                                "callee": {
                                    "type": "Identifier",
                                    "name": "String"
                                },
                                "arguments": inputExpr.body[0].expression.arguments
                            }
                        }
                    ],
                    "kind": "var"
                }
            ]
        };
        var modifiedCode = escodegen.generate(modified);

        // http://dean.edwards.name/unpacker/
        eval(modifiedCode);
        eval("var unpacked = function() {" + evaled + "}");
        return String(unpacked).replace(/^function[^{]*\{\s*|\s*\}$/g, "");
    };

    return {
        deobfuscate: deobfuscate
    };
})();

module.exports = deobfuscator;
