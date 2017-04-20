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

// Checks whether a conditional expression eventually boils down to a literal.
// If true, returns the ast of the evaluated literal.
function isCondExpLiteral(obj) {
    var allowedTypes = ["ConditionalExpression", "SequenceExpression", "BinaryExpression", "Literal"];
    var check = true;
    obj = estraverse.replace(obj, {
        enter: function(node,parentNode) {
            // If it has 'type', check if it is allowed.
            // "ExpressionStatement", "SequenceExpression", "BinaryExpression", "Literal"
            if(node.type && allowedTypes.indexOf(node.type) == -1) {
                check = false;
                this.break();
            }
            // Skip nodes that we don't even need to check.
            if(parentNode.type == "ConditionalExpression") {
                if(parentNode.test.value) {   // We are relying on the fact that the traverser always traverse "test" node at the earliest.
                    this.__current.path == "alternate" && this.remove(); // If an element is skipped via this.skip(), leave callback is still called. 
                }
                else {
                    this.__current.path == "consequent" && this.remove();
                }
            }
        },
        // We've already parsed it, so we do not bother with escodegen and eval and reduce the expression by our own.
        leave: function(node,parentNode){
            // when leaving Literal, do nothing.
            // when leaving other nodes, it should be possible to evaluate it.
            switch(node.type) {
                case "SequenceExpression":
                    return node.expressions[node.expressions.length - 1];
                case "ConditionalExpression":
                    return node.test.value ? node.consequent : node.alternate;
                case "BinaryExpression":
                    var tf = binaryOp(node.left.value, node.operator, node.right.value);
                    return {
                        type: "Literal",
                        value: tf,
                        raw: typeof tf == "string" ? "\"" + tf + "\"" : String(tf)
                    };
            }
        }
    });
    
    return check ? obj : false;
}
/**
 * Gets an abstract syntax tree of a Javascript code,
 * tries to concatenate strings addition expressions such as "a" + "b" + "c" in the original Javascript code
 * so that it becomes "abc", then returns the transformed ast.
 * It does not currently concatenate when the first argument is not a string literal,
 * like a + "b" + "c".
 * 
 * @param ast
 * @return ast
 */
function concatStrings(ast) {
    estraverse.replace(ast, {
        enter: function(node) {
            if(node.type == "BinaryExpression" && node.operator == "+" && node.left.type == "Literal" && node.right.type == "Literal") {
                var conc = node.left.value + node.right.value;
                return {
                    type: "Literal",
                    value: conc
                    //raw: "\"" + conc + "\""
                };
                // should check the parent node again
            }
        },
        leave: function(node, parentNode) {
            if(parentNode.type == "BinaryExpression" && node.type == "Literal" && parentNode.operator == "+" && parentNode.left.type == "Literal" && parentNode.right.type == "Literal") {
                var conc = parentNode.left.value + parentNode.right.value;
                parentNode.type = "Literal";
                parentNode.value = conc;
                delete parentNode.left;
                delete parentNode.right;
                delete parentNode.operator;
            }
        }
    });

    return ast;
}

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
 * Message format:
 * {
 *     requestId: 123,
 *     type: "sandboxEval",
 *     script: "script code goes here"
 * }
 * 
 * Answer format:
 * {
 *      "success": true or false
 *      "error": description for error.
 *      "return"
 * }
 *  
 * @constructor
 */
var SandboxEval = function () {
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
                    "success": true,
                    "result": _eval(evt.data.code)
                }, "%ORIGIN%");
            } catch(error) {
                // postMessage can't send Error instances directly.
                parent.postMessage({
                    "requestId": evt.data.requestId,
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
            ;
        }).then(function() {
            return new Promise(function(resolve, reject) {
                var thisId = (new Date()).getTime() * 10 + Math.floor(Math.random() * 10); // Or should I store request Ids in a closure and increase it like 1,2,3,4..?
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

module.exports = { 
    throwError: throwError,
    isArrayIndex: isArrayIndex,
    isCondExpLiteral: isCondExpLiteral,
    concatStrings: concatStrings,
    beautify: beautify,
    SandboxEval: SandboxEval
};
