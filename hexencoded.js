var esprima = require('esprima');
var estraverse = require('estraverse');
var escodegen = require('escodegen');
var comm = require('./comm.js');

// Deobfuscating hex encoded variables
var deobfuscator = (function() {
    // Will be assigned to values during a validateInput call
    var arrayName, arrayElements;

    var validateInput = function(expr) {
        if (expr &&
        expr.type == "Program" &&
        expr.body.length == 1 &&
        expr.body[0].type == "VariableDeclaration" &&
        expr.body[0].declarations.length == 1 &&
        expr.body[0].declarations[0].init.type == "ArrayExpression") {
            arrayElements = expr.body[0].declarations[0].init.elements; // arrayElements = expr.body[0].declarations[0].init["elements"];

            for(var i = 0, len = arrayElements.length; i < len; i++ ) {
                if(arrayElements[i].type != "Literal") {
                    return false;
                }
            }
            return true;
        } else {
            return false;
        }
    };

    var condition = function(obj) {
        var index;
        if(obj && obj.type == "MemberExpression" && obj.computed === true &&
        obj.object && obj.object.type == "Identifier" && obj.object.name == arrayName) {
            //Must handle expressions such as a["1"] as well as a[1]
            index = comm.strictParseInt(obj.property.value);

            return index !== false && -1 < index && index < arrayElements.length ? index : false;
        }
        else {
            return false;
        }
    };

    var replace = function(index) {
        var value = arrayElements[index].value, raw = arrayElements[index].raw;
        return {
            type: "Literal",
            value: value,
            raw: raw
        };
    }

    var deobfuscate = function(inputvar, code) {
        var inputExpr = esprima.parse(inputvar);
        if(!validateInput(inputExpr)) {
            comm.throwError("Unexpected input.");
            return false;
        }
        arrayName = inputExpr.body[0].declarations[0].id.name;
        var codeExpr = esprima.parse(code);

        codeExpr = estraverse.replace(codeExpr, {
            enter: function(node) {
                var i = condition(node);
                if(i !== false) {
                    return replace(i);
                }
            }
        });

        return escodegen.generate(comm.concatStrings(codeExpr));
    };

    return {
        deobfuscate: deobfuscate,
    };
})();

module.exports = deobfuscator;