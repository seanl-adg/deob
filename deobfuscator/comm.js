var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');

/* Generic */
//Show error messages.
function throwError(errortext) {
    alert(errortext);
}

/**
 * Validates if an accessed property of an Array
 * is an index. If it is an array index, returns the property
 * otherwise returns false.
 *
 * https://www.ecma-international.org/ecma-262/5.1/#sec-15.4
 * A Quote from above:
 *
 * Array objects give special treatment to a certain class of property names.
 * A property name P (in the form of a String value) is an array index
 * if and only if ToString(ToUint32(P)) is equal to P
 * and ToUint32(P) is not equal to 2^32−1
 *
 * Below implementation uses that bitwise operators implicitly convert
 * objects using ToInt32. Because it is not ToUInt32, what follows will be
 * incorrect if an accessed index is an integer >= 2^31,
 * but such situation won't occur in practice.
 */
function isArrayIndex(n) {
    var P = String(n);
    return P === String(Math.abs(P|0)) ? P : false;
}

/**
 * This is equivalent to eval(l.toString() + o + r.toString()); i.e. calculating the passed binary operation (o) of l and r,
 * but doing the same thing without invoking eval.
 */
function binaryOp(l, o, r) {
    switch(o) {
        case "<":
            return l < r;
        case ">":
            return l > r;
        case "<=":
            return l <= r;
        case ">=":
            return l >= r;
        case "==":
            return l == r;
        case "!=":
            return l != r;
        case "+":
            return l + r;
        case "-":
            return l - r;
        case "<<":
            return l << r;
        case ">>":
            return l >> r;
        case ">>>":
            return l >>> r;
        case "instanceof":
            return l instanceof r;
        case "in":
            return l in r;
        case "===":
            return l === r;
        case "!==":
            return l !== r;
        case "&":
            return l & r;
        case "^":
            return l ^ r;
        case "|":
            return l | r;
        case "&&":
            return l && r;
        case "||":
            return l || r;
    }
}

/**
 * Although never have seen an occurence, we should support evaluating unary expressions.
 */
function unaryOp(o, x) {
    switch (o) {
        case '+':
            return +x;
        case '-':
            return -x;
        case '~':
            return ~x;
        case '!':
            return !x;
        case 'delete':
            return true;
        case 'void':
            return undefined;
        case 'typeof':
            return typeof x;
    }
}

function isAddition(node) {
    return node.type == "BinaryExpression" && node.operator == "+";
}

function isStringLiteral(node) {
    return node.type == "Literal" && typeof node.value == "string";
}

/**
 * Gets an abstract syntax tree of a Javascript code,
 * tries to concatenate strings addition expressions such as "a" + "b" + "c" in the original Javascript code
 * so that it becomes "abc", then returns the transformed ast.
 * 
 * @param ast
 * @return ast
 */
function concatStrings(ast) {
    var prevNode = null;

    estraverse.replace(ast, {
        enter: function(node) {
            if(isAddition(node)) {
                if(isStringLiteral(node.left)) {
                    if(prevNode !== null) {
                        prevNode.value += node.left.value;
                        return node.right;
                    }
                    prevNode = node.left;
                } else if(!isAddition(node.left)) { prevNode = null; }
            } else if(!isStringLiteral(node) && prevNode !== null) { prevNode = null; }
        },
        leave: function(node) {
            if(isAddition(node)) {
                if(isStringLiteral(node.right)) {
                    if(prevNode !== null) {
                        prevNode.value += node.right.value;
                        return node.left;
                    }
                    prevNode = node.right;
                } else if(!isAddition(node.right)) { prevNode = null; }
            }
            else if(!isStringLiteral(node) && prevNode !== null) { prevNode = null; }
        }
    });

    return ast;
}

/**
 * Checks whether a given expression can be deterministically reduced to a single literal.
 * Receives an AST tree of an expression, mutates the ast returns the reduced AST of a literal when it can be reduced.
 * Otherwise, return false.
 * Note: As a side effect, it mutates the ast partially.
 * @param {*} ast
 * @return {boolean|ast}
 */
function reduceLiterals(ast) {
    var allowedTypes = ["ConditionalExpression", "SequenceExpression", "BinaryExpression", "UnaryExpression", "Literal"];
    var check = true;
    
    // Using estraverse.replace to check the root node.
    ast = estraverse.replace(ast, {
        enter: function(node, parentNode) {
            if (parentNode) {
                switch (parentNode.type) {
                    case "SequenceExpression":
                        if (parentNode.expressions.indexOf(node) !== parentNode.expressions.length - 1) { this.remove(); }
                        break;
                    case "ConditionalExpression":
                        if (this.__current.path != "test") {
                            if (parentNode.test.value) {
                                // Skip is safer, removing it results in an invalid AST and it may stay if the call returns false.
                                this.__current.path == "alternate" && this.skip();
                            } else {
                                this.__current.path == "consequent" && this.skip();
                            }
                        }
                        break;
                }
            }
            if(node && node.type && allowedTypes.indexOf(node.type) == -1) {
                check = false;
                this.break();
            }
        },
        leave: function(node, parentNode) {
            var newNode;
            switch(node.type) {
                case "SequenceExpression":
                    return node.expressions[node.expressions.length - 1];
                case "ConditionalExpression":
                    return node.test.value ? node.consequent : node.alternate;
                case "BinaryExpression":
                    return {
                        type: "Literal",
                        value: binaryOp(node.left.value, node.operator, node.right.value)
                    };
                case "UnaryExpression":
                    return {
                        type: "Literal",
                        value: unaryOp(node.operator, node.argument.value)
                    };
                case "Literal":
                    break;
            }
        }
    });

    return check ? ast : false;
}

// ToDo: incorporate concatStrings and reduceLiterals in a single call to be used in beautify.

function beautify(code){
    return escodegen.generate(concatStrings(esprima.parse(code)));
}


var Promise = require('bluebird');

/**
 * Calls eval in a sandboxed iframe.
 * 
 * var safeEval = new SandboxEval();
 * // eval returns a Promise object
 * safeEval.eval(code).then(function(result) {
 *     console.log('eval result is ' + result);
 * }).catch(function(reason) {
 *     console.log('Cannot eval due to ' + reason);
 * }
 * 
 * @constructor
 */
var SandboxEval = (function() {
    var requestId = 0;
    return function() {
        // The below function is a setup to run in an iframe. Receives messages, evaluates it, and pass back the result.
        function receiveAndPassBack(){
            function evalScript(evt){
                //Check that the message came from where we expect.
                if(evt.origin != "%ORIGIN%") {
                    return;
                }
                try{
                    parent.postMessage({
                        "requestId": evt.data.requestId,
                        "type": "SandboxEval",
                        "success": true,
                        "result": _eval(evt.data.code)
                    }, "%ORIGIN%");
                } catch(error) {
                    // postMessage can't send Error instances directly.
                    parent.postMessage({
                        "requestId": evt.data.requestId,
                        "type": "SandboxEval",
                        "success": false,
                        "error": error.message,
                        "original": evt.data
                    }, "%ORIGIN%");
                }
            }
            // Store eval in case of bad situations.
            _eval = window.eval;

            window.addEventListener("message", evalScript);
        }

        // Create an iframe.
        // Can't use contentWindow.document.write in a sandboxed iframe,
        // so using data:text/html.
        var sandbox = document.createElement('iframe');
        sandbox.id ='sandbox';
        sandbox.sandbox ='allow-scripts'; //sandboxing
        sandbox.style.cssText = "width:1px;height:1px;display:none;visibility:hidden";
        var html = "\x3Cscript>(" + receiveAndPassBack.toString().replace(/"%ORIGIN%"/g, '"' + window.location.origin + '"') + ")();\x3C/script>";
        sandbox.src = 'data:text/html;charset=utf-8,' + encodeURI(html);
        var sandboxLoaded = new Promise(function(resolve, reject) {
            sandbox.onload = function() {
                resolve("success");
            }
            sandbox.onerror = function(er) { reject(er);};
        });
        document.body.appendChild(sandbox);

        this.eval = function(code) {
            return sandboxLoaded.catch(function(error){
                console.warn("safe eval has been failed to initialize.");
            }).then(function() {
                return new Promise(function(resolve, reject) {
                    var thisId = requestId;
                    requestId++;
                    sandbox.contentWindow.postMessage({
                        requestId: thisId,
                        type: 'sandboxEval',
                        code: code
                    }, "*");
                    function receiveMessage(event) {
                        if(event.data.requestId == thisId) {
                            if(event.data.success) {
                                resolve(event.data.result);
                            }
                            else if(event.data.error) {
                                reject(event.data.error);
                            }
                            else {
                                reject(Error("Internal error."));
                            }
                            window.removeEventListener("message", receiveMessage);
                        }
                    }
                    window.addEventListener("message", receiveMessage);
                });
            });
        };

        this.destroy = function() {
            document.body.removeChild(sandbox);
        };
    };
})();


module.exports = { 
    throwError: throwError,
    isArrayIndex: isArrayIndex,
    concatStrings: concatStrings,
    reduceLiterals: reduceLiterals,
    beautify: beautify,
    SandboxEval: SandboxEval
};
