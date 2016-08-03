var commonConfig = require('./karma.common.conf');
var _ = require('underscore');

var configuration = _.extend({}, commonConfig, {
  singleRun: true,
  browsers: ['PhantomJS', 'PhantomJS_custom'],
  customLaunchers: {
    'PhantomJS_custom': {
      base: 'PhantomJS',
      options: {
        windowName: 'my-window',
        settings: {
          webSecurityEnabled: false
        },
      },
      flags: ['--load-images=true'],
      debug: true
    }
  },
})

module.exports = function(config) {
  config.set(configuration);
};