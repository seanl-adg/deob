var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');
var comm = require('./comm.js');

// Deobfuscating strings stored in several local variables
var deobfuscator = (function(){
    // Will be assigned to values during a validateInput call
    var declaratorArray, identifierArray;
    var allowedTypes = ["ConditionalExpression", "SequenceExpression", "BinaryExpression"];

    // Allowed input form: var name1 = value1, name2 = value2, ....
    // values should be literals or conditional expressions which deterministically boils down to literals.
    var validateInput = function(expr) {
        if(expr.type == "Program" &&
        expr.body.length == 1 &&
        expr.body[0].type == "VariableDeclaration") {
            declaratorArray = expr.body[0].declarations;
            var len = declaratorArray.length;
            identifierArray = new Array(len);
            for(var i = 0; i < len ; i++)
            {
                if(declaratorArray[i].type !== "VariableDeclarator"){
                    return false;
                }
                if(declaratorArray[i].init.type == "Literal") {
                    identifierArray[i] = declaratorArray[i].id.name;
                }
                else if(allowedTypes.indexOf(declaratorArray[i].init.type) != -1) {
                    var reduced = comm.reduceLiterals(declaratorArray[i].init);
                    if(reduced === false) {
                        return false;
                    }
                    else {
                        identifierArray[i] = declaratorArray[i].id.name;
                        declaratorArray[i].init = reduced;
                    }
                }
                else {
                    return false;
                }
            }
            return true;
        }
        else {
            return false;
        }
    };

    var condition = function(node) {
        var index;
        if(node.name && (index = identifierArray.indexOf(node.name), index != -1)) {
            return this.__current.path == "property" && this.__leavelist[this.__leavelist.length - 1].node.computed === false ? false : index;
        }
        else {
            return false;
        }
    };

    var replace = function(index) {
        return {
            type: "Literal",
            value: declaratorArray[index].init.value,
            raw: declaratorArray[index].init.raw
        };
    };

    var deobfuscate = function(inputvar, code) {
        var inputExpr = esprima.parse(inputvar);
        if(!validateInput(inputExpr)) {
            comm.throwError("Unexpected input.");
            return false;
        }

        var codeExpr = esprima.parse(code);

        codeExpr = estraverse.replace(codeExpr, {
            enter: function(node) {
                i = condition.call(this, node);
                if(i !== false) {
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
