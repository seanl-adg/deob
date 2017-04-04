var express = require('express');

var app = express();

app.get('/', function (req, res) {
    res.sendFile('deob.html', {root: __dirname} );
});

app.get('/bundle.js', function (req, res) {
    res.sendFile('bundle.js', {root: __dirname} );
});

app.listen(3000, function () {
  console.log('App listening on port 3000!');
});