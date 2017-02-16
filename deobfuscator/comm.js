var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');

/* Generic */
//Show error messages.
function throwError(errortext) {
    alert(errortext);
}

// [1,"2","a",.1,".1"] -> [1,2,false,false,false]
// Maybe isNaN(Number(n)) would suffice
function strictParseInt(n) {
    var t = typeof n;
    switch(t){
        case "number":
            break;
        case "string":
            if(isNaN(n)) {
                return false;
            }
            n = +n;
            break;
        default:
            return false;
    }
    // Now n is an integer, a float, null, an empty array, an array with a single integer element, etc.
    // http://stackoverflow.com/questions/3885817/how-do-i-check-that-a-number-is-float-or-integer
    return n === +n && n === (n|0) ? n : false;
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

/**
 * Calls eval in a sandboxed iframe.
 * Usage: var seval = new SandboxEval(window.location.href);
 * seval.getResult(code);
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
                parent.postMessage({"success": 1, "result":_eval(evt.data)}, "%ORIGIN%");
            } catch(error) {
                parent.postMessage({"success":0, "error": error}, "%ORIGIN%");
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

    var html = "\x3Cscript>(" + receiveAndPassBack.toString().replace(/"%ORIGIN%"/g, '"' + window.location.origin + '"') + ")();\x3C/script>";
    sandbox.src = 'data:text/html;charset=utf-8,' + encodeURI(html);
    document.body.appendChild(sandbox);

    // register a local variable that we store the returned result.
    var result;

    function returnResult(evt) {
        if(evt.success == 1) {
            resolve(evt.data.result);
        }
        else if(evt.sucess == 0) {
            reject(evt.data.error);
        }
        else {
            reject(Error("Internal error."));
        }
    }

    this.getResult = function(code) {
        result = undefined;
        //....
    };
};

module.exports = { 
    throwError: throwError,
    strictParseInt: strictParseInt,
    isCondExpLiteral: isCondExpLiteral,
    concatStrings: concatStrings,
    beautify: beautify
};