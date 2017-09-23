const webpack = require('webpack');
const path = require('path');

const config = {
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
            {
                test: /\.json$/,
                loader: "json-loader"
            }
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
    config.module.loaders.push({
        test: /\.js$/,
        loader: "babel-loader",
        include: path.resolve(__dirname, "deobfuscator/replace-scope-literal.js"),
        query: {
            plugins: [
                ["transform-es2015-for-of", {
                    "loose": true
                }]
            ],
        }
    })
}

module.exports = config;
