var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');

/* Generic */
//Show error messages.
function throwError(errortext) {
    alert(errortext);
}

// [1,"2","a",.1,".1"] -> [1,2,false,false,false]
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
                    this.__current.path == "alternate" && this.skip();
                }
                else {
                    this.__current.path == "consequent" && this.skip();
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
                    var tf = binaryOp(node.left.raw, node.operator, node.right.raw);
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
                
                /* We can't just set nodes like node = { type: "Literal", value: val, raw: "\"" + val + "\"" };
                  It seems that, the node passed to the enter method does not have a reference to the original AST, but accessing its properties are done by referencing the original AST.		
                */
            }
        }
    });

    return ast;	
    //ToDo: currently it does not concatenate a + "b" + "c".
}

function beautify(code){
    return escodegen.generate(concatStrings(esprima.parse(code)));
}

module.exports = { 
    throwError: throwError,
    strictParseInt: strictParseInt,
    isCondExpLiteral: isCondExpLiteral,
    concatStrings: concatStrings,
    beautify: beautify
};