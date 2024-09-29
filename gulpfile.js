// Preprocessor and file watch settings
const preprocessor = 'sass';
const filesWatch = 'html,htm,txt,json,md,woff,woff2';

import pkg from 'gulp';
const { src, dest, parallel, series, watch } = pkg;

import browserSync from 'browser-sync';
import bssi from 'browsersync-ssi';
import ssi from 'ssi';
import webpackStream from 'webpack-stream';
import webpack from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';
import gulpSass from 'gulp-sass';
import * as dartSass from 'sass';
import sassGlob from 'gulp-sass-glob';
import postCss from 'gulp-postcss';
import cssNano from 'cssnano';
import autoPrefixer from 'autoprefixer';
import imageMin from 'gulp-imagemin';
import changed from 'gulp-changed';
import concat from 'gulp-concat';
import rsync from 'gulp-rsync';
import { deleteAsync } from 'del';

const sass = gulpSass(dartSass);

/**
 * Initialize BrowserSync server with SSI middleware
 */
function browserSyncInit() {
  browserSync.init({
    server: {
      baseDir: 'src/',
      middleware: bssi({ baseDir: 'src/', ext: '.html' }),
    },
    ghostMode: { clicks: false },
    notify: false,
    online: true,
  });
}

/**
 * Compile and minify JavaScript files using Webpack and Babel
 * @returns {Stream} Gulp stream
 */
function compileScripts() {
  return src(['src/js/*.js', '!src/js/*.min.js'])
  .pipe(
    webpackStream(
      {
        mode: 'production',
        performance: { hints: false },
        plugins: [
          new webpack.ProvidePlugin({
            $: 'jquery',
            jQuery: 'jquery',
            'window.jQuery': 'jquery',
          }), // jQuery (npm i jquery)
        ],
        module: {
          rules: [
            {
              test: /\.m?js$/,
              exclude: /(node_modules)/,
              use: {
                loader: 'babel-loader',
                options: {
                  presets: ['@babel/preset-env'],
                  plugins: ['babel-plugin-root-import'],
                },
              },
            },
          ],
        },
        optimization: {
          minimize: true,
          minimizer: [
            new TerserPlugin({
              terserOptions: { format: { comments: false } },
              extractComments: false,
            }),
          ],
        },
      },
      webpack,
    ),
  )
  .on('error', function handleError() {
    this.emit('end');
  })
  .pipe(concat('app.min.js'))
  .pipe(dest('src/js'))
  .pipe(browserSync.stream());
}

/**
 * Compile and minify stylesheets (Sass or other preprocessors)
 * @returns {Stream} Gulp stream
 */
function compileStyles() {
  return src([
    `src/styles/${preprocessor}/*.*`,
    `!src/styles/${preprocessor}/_*.*`,
  ])
  .pipe(eval(`${preprocessor}Glob`)())
  .pipe(
    eval(preprocessor)({
      'include css': true,
      silenceDeprecations: ['legacy-js-api'],
    })
  )
  .pipe(
    postCss([
      autoPrefixer({ grid: 'autoplace' }),
      cssNano({
        preset: ['default', { discardComments: { removeAll: true } }],
      }),
    ]),
  )
  .pipe(concat('app.min.css'))
  .pipe(dest('src/css'))
  .pipe(browserSync.stream());
}

/**
 * Optimize and cache images
 * @returns {Stream} Gulp stream
 */
function optimizeImages() {
  return src(['src/images/src/**/*'], { encoding: false })
  .pipe(changed('src/images/dist'))
  .pipe(imageMin())
  .pipe(dest('src/images/dist'))
  .pipe(browserSync.stream());
}

/**
 * Copy built files to the 'dist' directory
 * @returns {Stream} Gulp stream
 */
function copyBuildFiles() {
  return src(
    [
      '{src/js,src/css}/*.min.*',
      'src/images/**/*.*',
      '!src/images/src/**/*',
      'src/fonts/**/*',
    ],
    { base: 'src/', encoding: false },
  ).pipe(dest('dist'));
}

/**
 * Compile HTML files using Server Side Includes (SSI)
 */
async function compileHTML() {
  const includes = new ssi('src/', 'dist/', '/**/*.html');
  includes.compile();
  await deleteAsync('dist/partials', { force: true });
}

/**
 * Clean the 'dist' directory
 */
async function cleanDist() {
  await deleteAsync('dist/**/*', { force: true });
}

/**
 * Deploy the 'dist' directory to a remote server using Rsync
 * @returns {Stream} Gulp stream
 */
function deployToServer() {
  return src('dist/').pipe(
    rsync({
      root: 'dist/',
      hostname: 'username@yousite.com',
      destination: 'yousite/public_html/',
      clean: true, // Mirror copy with file deletion
      // include: ['*.htaccess'], // Includes files to deploy
      exclude: ['**/Thumbs.db', '**/*.DS_Store'], // Excludes files from deploy
      recursive: true,
      archive: true,
      silent: false,
      compress: true,
    }),
  );
}

/**
 * Watch for file changes and re-run tasks
 */
function startWatch() {
  watch([`src/styles/${preprocessor}/**/*`], { usePolling: true }, compileStyles);
  watch(
    ['src/js/**/*.js', '!src/js/**/*.min.js'],
    { usePolling: true },
    compileScripts,
  );
  watch(['src/images/src/**/*'], { usePolling: true }, optimizeImages);
  watch([`src/**/*.{${filesWatch}}`], { usePolling: true }).on(
    'change',
    browserSync.reload,
  );
}

// Export tasks
export { compileScripts as scripts, compileStyles as styles, optimizeImages as images, deployToServer as deploy };
export const assets = series(compileScripts, compileStyles, optimizeImages);
export const build = series(
  cleanDist,
  optimizeImages,
  compileScripts,
  compileStyles,
  copyBuildFiles,
  compileHTML,
);

// Default Gulp task
export default series(
  compileScripts,
  compileStyles,
  optimizeImages,
  parallel(browserSyncInit, startWatch),
);
