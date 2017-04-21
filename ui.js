/* Add gutters */
var Split = require('split.js');

function addGutters(){
    Split(['#Main', '#Right'], {
        sizes: [45,55],
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
var aceEditor = require('./aceeditor.js');
var tab = require('./tab.js');


var deobfuscateObjProp = require('./deobfuscator/objprop.js');
var deobfuscateStringVars = require('./deobfuscator/stringvars.js');
var deobfuscateHexEncoded = require('./deobfuscator/hexencoded.js');
var deobfuscateEvalPacker = require('./deobfuscator/evalpacker.js');
var deobfuscateFunctionCall = require('./deobfuscator/replacefunctioncall.js');

var inputData, toDeob; // ace editor instances

function setVal(result) {
    if(result !== false) {
        toDeob.setValue(result);
    }
}

function Do() {
    var result;
    var selectedmethod = document.querySelector('input[name="method"]:checked').value;
    switch(selectedmethod) {
        case "objprop":
            setVal(deobfuscateObjProp.deobfuscate( inputData.getValue(), toDeob.getValue() ));
            return;
        case "stringvars":
            setVal(deobfuscateStringVars.deobfuscate( inputData.getValue(), toDeob.getValue() ));
            return;
        case "hexencoded":
            setVal(deobfuscateHexEncoded.deobfuscate( inputData.getValue(), toDeob.getValue() ));
            return;
        case "eval":
            setVal(deobfuscateEvalPacker.deobfuscate( inputData.getValue(), toDeob.getValue() ));
            return;
        case "repfncall":
            deobfuscateFunctionCall.deobfuscateAsync( inputData.getValue(), toDeob.getValue() ).then(setVal);
            return;
    }
}

function initEditors() {
    tab.initTabs();
    inputData = aceEditor.initEditor("InputData");
    toDeob = aceEditor.initEditor("ToDeob");
    
    // Fetch previous session if exists 
    tab.restorePrevSession() || tab.focusTab(tab.createTab());

    document.getElementById("deob").addEventListener('click', Do);
}

function resizeEditors() {
    inputData.getSession().getUseWrapMode() && inputData.resize();
    toDeob.getSession().getUseWrapMode() && toDeob.resize();
    tab.resizeTabs();
}

var comm = require('./deobfuscator/comm.js');

function enableShortcuts() {
    function getFocusedEditor() {
        var c = document.getElementsByClassName("ace_focus");
        return c && c[0] && c[0].id ? aceEditor.getEditor(c[0].id) : false;
    }

    function toggleWrapCurrentEditor() {
        var i = getFocusedEditor();
        if(i) {
            var b = i.getSession().getUseWrapMode();
            i.getSession().setUseWrapMode(!b);
        }
    }

    function beautifyCurrentEditor() {
        var i = getFocusedEditor();
        
        if(i){
            i.setValue(comm.beautify(i.getValue()));
        }
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
                    tab.getCurrentEditor().focus();
                    break;
                case 50:
                    e.preventDefault();
                    inputData.focus();
                    break;
                case 51:
                    e.preventDefault();
                    toDeob.focus();
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