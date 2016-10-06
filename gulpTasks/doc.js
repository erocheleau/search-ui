'use strict';
const gulp = require('gulp');
const TypeDoc = require('typedoc');
const fs = require('fs');

gulp.task('doc', ['copyBinToDoc'], function () {

  var app = new TypeDoc.Application({
    mode: 'file',
    target: 'ES5',
    experimentalDecorators: true,
    module: 'CommonJS',
    includeDeclarations: true,
    theme: 'docs/theme',
    name: 'Coveo search ui documentation',
    readme: 'README.md',
    externalPattern: '**/{typings,lib,node_modules}/**',
    ignoreCompilerErrors: true
  });
  var src = app.expandInputFiles(['src/Doc.ts']);
  var project = app.convert(src);
  app.generateDocs(project, 'docgen');
  app.generateJson(project, './bin/docgen/docgen.json', 'https://coveo.github.io/search-ui/');
});

gulp.task('copyBinToDoc', function () {
  return gulp.src('./bin/{js,image,css}/**/*')
      .pipe(gulp.dest('./docs/theme/assets/gen'))
})

function copyFile(source, target, cb) {
  var cbCalled = false;

  var rd = fs.createReadStream(source);
  rd.on("error", function (err) {
    done(err);
  });
  var wr = fs.createWriteStream(target);
  wr.on("error", function (err) {
    done(err);
  });
  wr.on("close", function (ex) {
    done();
  });
  rd.pipe(wr);

  function done(err) {
    if (!cbCalled) {
      cb(err);
      cbCalled = true;
    }
  }
}
