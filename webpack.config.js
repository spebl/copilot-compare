const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const common = {
  mode: 'development',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
  },
};

module.exports = [
  {
    ...common,
    entry: './src/index.ts',
    target: 'electron-main',
    output: {
      ...common.output,
      filename: 'index.js',
    },
  },
  {
    ...common,
    entry: './src/preload.ts',
    target: 'electron-preload',
    output: {
      ...common.output,
      filename: 'preload.js',
    },
  },
  {
    ...common,
    entry: './src/renderer.tsx',
    target: 'electron-renderer',
    module: {
      rules: [
        ...common.module.rules,
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    output: {
      ...common.output,
      filename: 'renderer.js',
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/index.html',
      }),
    ],
  },
];
