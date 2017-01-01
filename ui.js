/* Add gutters */
var Split = require('split.js');

function addGutters(){
    Split(['#Main', '#Right'], {
        sizes: [25,75],
        gutterSize: 4,
        onDragEnd: resizeEditors
    });
    Split(['#RightTop','#ToDeob'], {
        sizes:[30,70],
        direction: 'vertical',
        gutterSize: 4,
        minSize: [124,0]
    });
    window.addEventListener("resize", resizeEditors);
}

/* Initialize editors */
var ace = require('brace');
require('brace/mode/javascript');
require('brace/theme/monokai');
require('brace/ext/searchbox');

var deobfuscateObjProp = require('./objprop.js');
var deobfuscateStringVars = require('./stringvars.js');
var deobfuscateHexEncoded = require('./hexencoded.js');
var deobfuscateEvalPacker = require('./evalpacker.js');

var editable = ["Main", "InputData", "ToDeob"];
var l = editable.length;
Editors = new Array(l);

function Do() {
    var result;
    var selectedmethod = document.querySelector('input[name="method"]:checked').value;
    switch(selectedmethod) {
        case "objprop":
            result = deobfuscateObjProp.deobfuscate( Editors[1].getValue(), Editors[2].getValue() );
            break;
        case "stringvars":
            result = deobfuscateStringVars.deobfuscate( Editors[1].getValue(), Editors[2].getValue() );
            break;
        case "hexencoded":
            result = deobfuscateHexEncoded.deobfuscate( Editors[1].getValue(), Editors[2].getValue() );
            break;
        case "eval":
            result = deobfuscateEvalPacker.deobfuscate( Editors[1].getValue(), Editors[2].getValue() );
    }
    if(result !== false) {
        Editors[2].setValue(result);
    }
}


function initEditors() {
    for(var i = 0; i < l; i++) {
        Editors[i] = ace.edit(editable[i]);
        Editors[i].setTheme("ace/theme/monokai");
        Editors[i].getSession().setMode("ace/mode/javascript");
        Editors[i].getSession().getMode().getTokenizer().$setMaxTokenCount(10000); // Increase syntax highlighting max value
        Editors[i].setShowPrintMargin(false);
        Editors[i].getSession().setUseWrapMode(true);
        Editors[i].$blockScrolling = Infinity; // Remove annoying message
    }

    /* Attach click event listener */
    document.getElementById("deob").addEventListener('click', Do);
}

function resizeEditors() {
    for(var i = 0; i < l; i++) {
        Editors[i].getSession().getUseWrapMode() && Editors[i].resize();
    }
}

var comm = require('./comm.js');

function enableShortcuts() {
    function getFocusedIndex(){
        var c = document.getElementsByClassName("ace_focus");
        return c ? editable.indexOf(c[0].id) : false;
    }

    function toggleWrapCurrentEditor() {
        var i = getFocusedIndex(),
        b = Editors[i].getSession().getUseWrapMode();
        i != -1 && Editors[i].getSession().setUseWrapMode(!b)
    }

    function beautifyCurrentEditor() {
        var i = getFocusedIndex();
        i != -1 && Editors[i].setValue(comm.beautify(Editors[i].getValue()));
    }

    function onKeyDown(e) {
        if(e.ctrlKey && e.shiftKey ){
            switch(e.keyCode) {
                case 82:
                    e.preventDefault();
                    toggleWrapCurrentEditor();
                    break;
                case 66:
                    e.preventDefault();
                    beautifyCurrentEditor();
                    break;
                default:
                    return false;
            }
        }
        else if (e.ctrlKey) {
            switch(e.keyCode) {
                case 13:
                    Do();
                    break;
                case 49:
                    e.preventDefault();
                    Editors[0].focus();
                    break;
                case 50:
                    e.preventDefault();
                    Editors[1].focus();
                    break;
                case 51:
                    e.preventDefault();
                    Editors[2].focus();
                    break;
                default:
                    return false;
            }
        }
    }

    document.addEventListener('keydown', onKeyDown, false);
}

function showInfo(){
    function onInfoClick(){
        //temporary
        comm.throwError("Shortcuts\r\nctrl + shift + r: toggle word wrap \r\nctrl + shift + b: beautify code\r\nctrl + enter: convert code\r\nctrl + 1,2,3: focus editors");
    }

    document.getElementById("info").addEventListener('click', onInfoClick)
}

window.addEventListener("DOMContentLoaded", function(){
    addGutters();
    initEditors();
    enableShortcuts();
    showInfo();
});

// ToDo: Parser error handling
// improve concatString
// style scrollbars
// highlight matching parentheses