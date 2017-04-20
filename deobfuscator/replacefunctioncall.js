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
    var replaceDataArray = []; // replaceDataArray

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
                        callee: left.callee, // alternatively, we may store callees in a compact form after parsing
                        arguments: args,
                        evalProvider: sandbox
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

        var replaceCandidates = replaceDataArray.map(function(el, index){
            return {
                o: el.callee,
                i: index
            };
        });
        var _callee = node.callee;

        while(_callee.type == "MemberExpression") {
            try {
                replaceCandidates = replaceCandidates.filter(function(el) {
                    var nname = _callee.computed ? _callee.property.value : _callee.property.name;
                    var dname;
                    if(el.o.type == "MemberExpression") {
                        dname = el.o.computed ? el.o.property.value : el.o.property.name;
                    }
                    else if(el.o.type == "Identifier") {
                        dname = el.o.name;
                        if(nname == dname) {
                            // ToDo: Regex Check here
                            throw(el.i);
                        }
                        return false;
                    }
                    return dname == nname;
                });
            }
            catch(i) {
                if(typeof i == 'number') return i;
                else throw i;
            }
         
            replaceCandidates = replaceCandidates.map(function(el) {
                return {
                    o: el.o.object,
                    i: el.i
                };
            });
            _callee = _callee.object;
        }

        if(_callee.type != "Identifier") {
            return false;
        }
        for(var i = 0, l = replaceCandidates.length; i < l; i++) {
            if(_callee.name == replaceCandidates[i].o.name) {
                return replaceCandidates[i].i;
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
            /*
            replaceDataArray.forEach(function(el) {
                el.evalProvider.destroy();
            });
            */
            replaceDataArray = [];

            return escodegen.generate(comm.concatStrings(codeExpr));
        }, function(){ /* error handling here */});
    };

    return {
        deobfuscateAsync: deobfuscateAsync
    };
})();

module.exports = deobfuscator;
