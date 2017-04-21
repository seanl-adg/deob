const webpack = require('webpack');

var config = {
    entry: "./ui.js",
    output: {
        path: __dirname + "/docs",
        filename: "bundle.js"
    },
    devServer: {
        inline: true,
        port: 7777,
        contentBase: __dirname + '/docs/'
    },
    module: {
        loaders: [
            { test: /\.json$/, loader: "json-loader" }
        ]
    },
    plugins: []
};

if (process.env.NODE_ENV === 'production') {
    config.plugins.push(
        new webpack.optimize.UglifyJsPlugin({
            compress: {}
        })
    );
}

module.exports = config;
