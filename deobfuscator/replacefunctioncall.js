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
    var dic = [];

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
                    sandbox.eval(functionDecCode)

                    dic.push({
                        callee: left.callee,
                        arguments: args,
                        evaler: sandbox
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
        if(node.type != "CallExpression") {
            return false;
        }

        var tmp = dic.map(function(el, index){
            return {
                o: el.callee,
                i: index
            };
        });
        var _callee = node.callee;

        while(_callee.type == "MemberExpression") {
            try {
                tmp = tmp.filter(function(el) {
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
                if(typeof i == 'number') {
                    return i;
                }
                else {
                    throw i;
                }
            }
         
            tmp = tmp.map(function(el) {
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
        for(var i = 0, l = tmp.length; i < l; i++) {
            if(_callee.name == tmp[i].o.name) {
                return tmp[i].i;
            }
        }
        return false;
    };

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
        return dic[index].evaler.eval(evalStr).catch(function(error) {
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
        var promise;

        codeExpr = estraverse.replace(codeExpr, {
            enter: function(node) {
                var index = condition(node);
                if(index !== false) {
                    
                    promises.push(replace(index, node));
                    return {
                        type: "TEMP_ASYNC",
                        value: promises.length - 1,
                        original: node
                    };
                }
            },
            keys: {
                "TEMP_ASYNC": []
            }
        });

        return Promise.all(promises).then(function(evaledResults) {
            codeExpr = estraverse.replace(codeExpr, {
                enter: function(node) {
                    if(node.type == "TEMP_ASYNC") {
                        return evaledResults[node.value] || node.original; // Recover original when an eval has failed.
                    }
                },
                keys: {
                    "TEMP_ASYNC": []
                }
            });
            var sandbox = this;

            dic.forEach(function(el) {
                el.evaler.destroy();
            });
            dic = [];

            return escodegen.generate(comm.concatStrings(codeExpr));           
            
        }, function(){ /* error handling here */});
    };

    return {
        deobfuscateAsync: deobfuscateAsync
    };
})();

module.exports = deobfuscator;
