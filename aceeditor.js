var ace = require('brace');
require('brace/mode/javascript');
require('brace/theme/monokai');
require('brace/ext/searchbox');

var editorInstances = Object.create(null);

/**
 * Initialize ace editors in a uniform manner.
 *
 * @param {string} id id of the DOM node to attach ace editor.
 * @return created ace editor instance
 */ 
var initEditor = function (editorId) {
    var editor = ace.edit(editorId);
    editor.setTheme("ace/theme/monokai");
    editor.getSession().setMode("ace/mode/javascript");
    editor.getSession().getMode().getTokenizer().$setMaxTokenCount(10000); // Increase syntax highlighting max value
    editor.setShowPrintMargin(false);
    editor.getSession().setUseWrapMode(true);
    editor.$blockScrolling = Infinity; // Remove warning message
    editorInstances[editorId] = editor;

    return editor;
};

/**
 * Gets the editor instance by the container node's id.
 *
 * @param {string} id id attirbute of a DOM node where the editor we are looking for is attached.
 * @return editor instance
 */ 
var getEditor = function(id) {
    return editorInstances[id];
};

/**
 * Calls editor.destroy() and delete it from inner storage.
 */
var destroyEditor = function(id) {
    editorInstances[id].destroy();
    delete editorInstances[id];
};

module.exports = {
    initEditor: initEditor,
    getEditor: getEditor,
    destroyEditor: destroyEditor
};