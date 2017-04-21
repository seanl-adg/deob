var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');
var comm = require('./comm.js');

var Promise = require('bluebird');

/**
 * Syntax: 
 * a.b.c(/^".*"$/) == function ABC(){...}
 * {CallExpression}([TypeDeclaration]) == {FunctionExpression}
 * 
 */
var deobfuscator = (function(){
    // Will be assigned to values during a validateInput call
    var replaceDataArray = [], calleeArray = [];

    // validates input, populates replaceDataArray. Its syntax is not yet settled.
    // currently, a['b'].c() == window.atob will replace e.g. a.b.c('YQ=='), d.a.b.c('YQ=='), d['a']['b']['c']('YQ==') to 'a'.
    var validateInput = function(ast) {
        var len = ast.body.length;
        var i;
        for(i=0; i<len; i++) {
            var statement = ast.body[i];
            var expr;
            if(statement.type == "ExpressionStatement" &&
            statement.expression.type == "BinaryExpression" &&
            statement.expression.operator == "==" ) {
                var left = statement.expression.left;
                var right = statement.expression.right;
                if(left.type == "CallExpression") {
                    var args = [];
                    // parses arguments passed in 
                    for(var j = 0, l = left.arguments.length; j < l; j++) {
                        if(left.arguments[j].type=="Literal"&&left.arguments[j].regex) {
                            args.push((new RegExp(left.arguments[j].regex)));
                        }
                        else if(left.arguments[j].type=="Identifier"&&left.arguments[j].name=="undefined") {
                            args.push(undefined);
                        }
                        else {
                            return false;
                        }
                    }
                    var functionDecCode = escodegen.generate({
                        "type": "Program",
                        "body": [
                            {
                                "type": "VariableDeclaration",
                                "declarations": [
                                    {
                                        "type": "VariableDeclarator",
                                        "id": {
                                            "type": "Identifier",
                                            "name": "__DEOBFUSCATOR_EVAL"
                                        },
                                        "init": right
                                    }
                                ],
                                "kind": "var"
                            }
                        ]
                    });

                    var sandbox = new comm.SandboxEval();
                    sandbox.eval(functionDecCode);

                    replaceDataArray.push({
                        arguments: args,
                        evalProvider: sandbox
                    });
                    
                    calleeArray.push({
                        ast: left.callee,
                        index: replaceDataArray.length - 1
                    });

                }
            }
            else {
                return false;
            }
        }
        return true;
    };

    var condition = function(node) {
        if(node.type != "CallExpression") return false;

        var callee = node.callee, replaceCandidates = calleeArray, nextCandidates;

        while(callee.type == "MemberExpression") {
            nextCandidates = [];
            for(var i = 0, l = replaceCandidates.length; i < l; i++) {
                var candidate = replaceCandidates[i];
                var calleePropName = callee.computed ? callee.property.value: callee.property.name;
                var candidatePropName;
                if(candidate.ast.type == "MemberExpression") {
                    candidatePropName = candidate.ast.computed ? candidate.ast.property.value : candidate.ast.property.name;
                    if(calleePropName == candidatePropName) {
                        nextCandidates.push({
                            ast: candidate.ast.object,
                            index: candidate.index
                        });
                    }
                }
                else if(candidate.ast.type == "Identifier") {
                    candidatePropName = candidate.ast.name;
                    if(calleePropName == candidatePropName) {
                        //ToDo: regex check here
                        return candidate.index;
                    }
                }
            }
            callee = callee.object;
            replaceCandidates = nextCandidates;
        }

        if(callee.type != "Identifier") {
            return false;
        }
        for(var i = 0, l = replaceCandidates.length; i < l; i++) {
            if(callee.name == replaceCandidates[i].ast.name) {
                //ToDo: regex check here
                return replaceCandidates[i].index;
            }
        }
        return false;
    };

    // Returns a promise that resolves with a node to be replaced. Returns undefined when an eval call fails.
    var replace = function(index, node) {
        var evalStr = escodegen.generate({
            "type": "Program",
            "body": [
                {
                    "type": "ExpressionStatement",
                    "expression": {
                        "type": "CallExpression",
                        "callee": {
                            "type": "Identifier",
                            "name": "__DEOBFUSCATOR_EVAL"
                        },
                        "arguments": node.arguments
                    }
                }
            ]
        });
        return replaceDataArray[index].evalProvider.eval(evalStr).catch(function(error) {
                console.warn("One function call was ignored due to an error: " + error);
                return Promise.resolve(undefined);
            }).then(function(result) {
            // currently only supports functions which returns a literal token
            return result !== undefined ? {
                type: "Literal",
                value: result
            } : undefined;
        });
    }

    var deobfuscateAsync = function(inputvar, code) {
        var inputExpr = esprima.parse(inputvar);
        if(!validateInput(inputExpr)) {
            comm.throwError("Unexpected input.");
            return false;
        }
        var codeExpr = esprima.parse(code);

        var promises = [];

        codeExpr = estraverse.replace(codeExpr, {
            enter: function(node) {
                var i = condition(node);
                if(i !== false) {
                    promises.push(replace(i, node));
                    return {
                        type: "TEMP_ASYNC",
                        value: promises.length - 1,
                        original: node
                    };
                }
            },
            keys: { "TEMP_ASYNC": [] }
        });

        return Promise.all(promises).then(function(evaluatedASTNodes) {
            codeExpr = estraverse.replace(codeExpr, {
                enter: function(node) {
                    if(node.type == "TEMP_ASYNC") {
                        return evaluatedASTNodes[node.value] || node.original; // Recover original when an eval has failed.
                    }
                },
                keys: { "TEMP_ASYNC": [] }
            });

            // clear memory?
            for(var i = 0, l=replaceDataArray.length; i < l; i++) {
                replaceDataArray[i].evalProvider.destroy();
            }
            replaceDataArray = [];
            calleeArray = [];

            return escodegen.generate(comm.concatStrings(codeExpr));
        }, function(){ /* error handling here */});
    };

    return {
        deobfuscateAsync: deobfuscateAsync
    };
})();

module.exports = deobfuscator;
