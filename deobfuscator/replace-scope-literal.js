var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');
var comm = require('./comm.js');

var escope = require('escope');

var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');
var comm = require('./comm.js');

var deobfuscator = (function () {
    var allowedVariableDeclaratorTypes = ["ConditionalExpression", "SequenceExpression", "BinaryExpression", "UnaryExpression", "Literal"];
    var deobfuscate = function (code) {
        var codeAST = esprima.parse(code);
        var scopeManager = escope.analyze(codeAST);
        var scopesLength = scopeManager.scopes.length;
        var scope;
        var scopeIndex = 0;

        for (; scopeIndex < scopesLength; scopeIndex++) {
            scope = scopeManager.scopes[scopeIndex];
            for (var variable of scope.variables) {
                if (variable.defs.length !== 1) { continue; }
                if (variable.defs.length === 1 &&
                    variable.defs[0].node.type == 'VariableDeclarator') {
                    var init = variable.defs[0].node.init;
                    if (init === null) { continue; }
                    if (allowedVariableDeclaratorTypes.indexOf(init.type) != -1) {
                        var folded = comm.reduceLiterals(init);
                        if (folded === false) { continue; }
                        var check = false;
                        for (var reference of variable.references) {
                            if (reference.identifier === variable.defs[0].node.id) { continue; }
                            if (reference.isWrite()) {
                                check = true;
                                break;
                            }
                        }
                        if (!check) {
                            // If reached this stage, it means the variable is safe to be replaced.
                            for (reference of variable.references) {
                                if (reference.identifier === variable.defs[0].node.id) { continue; }
                                // Modify the reference identifier node to a literal node.
                                delete reference.identifier.name;
                                reference.identifier.type = 'Literal';
                                reference.identifier.value = folded.value;
                            }
                            // Next, delete the variable declaration.
                            var def = variable.defs[0];
                            if (def.parent.declarations.length > 1) {
                                var ind = def.parent.declarations.indexOf(def.node);
                                def.parent.declarations.splice(ind, 1);
                            } else {
                                // The parent VariableDeclation node should be removed, but we do not have a reference of it at this point.
                                def.parent.declarations = [{
                                    type: 'VariableDeclarator',
                                    id: { type: 'Identifier', name: '__TEMP_VAR_DECLARATION_TO_BE_REMOVED__' },
                                    init: { type: 'Literal', value: true }
                                }];
                            }
                            // Done.
                        }
                    }
                }
            }
            // Maybe there is a way to update only the next scope, but at the moment we should analyze the full AST again.
            scopeManager = escope.analyze(codeAST);
        }

        estraverse.replace(codeAST, {
            enter: function (node, parentNode) {
                if (node.type == 'VariableDeclaration' &&
                    node.declarations.length == 1 &&
                    node.declarations[0].id.name == '__TEMP_VAR_DECLARATION_TO_BE_REMOVED__') {
                    this.remove();
                }
            }
        });

        return escodegen.generate(comm.concatStrings(codeAST));
    };

    return {
        deobfuscate: deobfuscate
    };
})();

module.exports = deobfuscator;
