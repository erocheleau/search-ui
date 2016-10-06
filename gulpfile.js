const gulp = require('gulp');
const requireDir = require('require-dir');
const del = require('del');
const runsequence = require('run-sequence');

requireDir('./gulpTasks');

gulp.task('default', ['build', 'buildLegacy']);

gulp.task('build', ['linkGitHooks', 'set-prod-node-env'], function (done) {
  runsequence('clean', ['fileTypes', 'sprites', 'strings', 'setup', 'templates'], 'prettify', 'src', done);
});

gulp.task('src', function (done) {
  runsequence('compile', 'definitions', done);
});

gulp.task('buildLegacy', function (done) {
  runsequence(['cssLegacy', 'fileTypesLegacy', 'spritesLegacy', 'templatesLegacy'], done);
});

gulp.task('clean', function () {
  return del(['./bin', './zip/**.zip']);
});
