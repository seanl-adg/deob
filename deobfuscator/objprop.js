var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');
var comm = require('./comm.js');

// Deobfuscating strings contained in key-value form
var deobfuscator = (function(){
    // Will be assigned to values during a validateInput call
    var objName, keyArray, valueArray;
    var allowedTypes = ["ConditionalExpression", "SequenceExpression", "BinaryExpression"];

    // Allowed input form: var name = { key1: value1, key2: value2, ... }
    // values should be literals or conditional expressions which deterministically boils down to literals.
    var validateInput = function (expr) {
        if(expr.type == "Program" &&
        expr.body.length == 1 &&
        expr.body[0].type == "VariableDeclaration" &&
        expr.body[0].declarations &&
        expr.body[0].declarations.length == 1 &&
        expr.body[0].declarations[0].init.type == "ObjectExpression"){
            var ar = expr.body[0].declarations[0].init.properties;
            var len = ar.length;
            keyArray = new Array(len);
            valueArray = new Array(len);
            for(var i = 0; i < len; i++) {
                var prop = ar[i];
                if(prop.type != "Property" || prop.kind != "init") {
                    return false;
                }
                keyArray[i] = prop.key.type == "Literal" ? prop.key.value : prop.key.name;
                if(prop.value.type == "Literal") {
                    // prop.key.type is "Literal" if {'a':"ABC"}
                    // "Identifier" if {a:"ABC"}
                    valueArray[i] = prop.value;
                }
                else if(allowedTypes.indexOf(prop.value.type) != -1) {
                    var reduced = comm.reduceLiterals(prop.value);
                    if(reduced === false) {
                        return false;
                    }
                    else {
                        valueArray[i] = reduced;
                    }
                }
            }
            return true;
        }
        else {
            return false;
        }
    };

    var condition = function (obj) {
        if(obj.type &&
        obj.type == "MemberExpression" &&
        obj.object.name == objName ) {
            var prop;
            if(obj.computed === false ) {
                prop = obj.property.name;
            }
            else {
                prop = obj.property.value;
            }
            var index = keyArray.indexOf(prop);
            return index == -1 ? false : index;
        }
        else {
            return false;
        }
    };

    var replace = function(index) {
        return valueArray[index];
    };

    var deobfuscate = function(inputvar, code){
        var inputExpr = esprima.parse(inputvar);
        if(!validateInput(inputExpr)) {
            comm.throwError("Unexpected input.");
            return false;
        }
        objName = inputExpr.body[0].declarations[0].id.name;
        var codeExpr = esprima.parse(code);

        codeExpr = estraverse.replace(codeExpr, {
            enter: function(node) {
                var i = condition(node);
                if( i !== false ) {
                    return replace(i);
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
