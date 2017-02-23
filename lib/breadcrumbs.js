'use strict';

var path = require('path');
// var util = require('util');
// var utils = require('./utils.js');

/**
 * Polyfill a method
 * @param obj object e.g. `document`
 * @param name method name present on object e.g. `addEventListener`
 * @param replacement replacement function
 * @param track {optional} record instrumentation to an array
 */
function fill(obj, name, replacement, track) {
  var orig = obj[name];
  obj[name] = replacement(orig);
  if (track) {
    track.push([obj, name, orig]);
  }
}

var originals = [];

var wrappers = {
  console: function (Raven) {
    var wrapConsoleMethod = function (level) {
      if (!(level in console)) {
        return;
      }

      fill(console, level, function (originalConsoleLevel) {
        var sentryLevel = level === 'warn'
            ? 'warning'
            : level;

        return function () {
          var args = [].slice.call(arguments);

          var msg = '' + args.join(' ');
          var data = {
            level: sentryLevel,
            logger: 'console',
            extra: {
              'arguments': args
            }
          };

          Raven.captureBreadcrumb({
            message: msg,
            level: data.level,
            category: 'console'
          });

          originalConsoleLevel.apply(console, args);
        };
      }, originals);
    };

    ['debug', 'info', 'warn', 'error', 'log'].forEach(wrapConsoleMethod);
  },
};

// function instrument(key, Raven) {
//   try {
//     wrappers[key](Raven);
//     utils.consoleAlert('Enabled automatic breadcrumbs for ' + key);
//   } catch (e) {
//     // associated module not available
//   }
// }

function instrument(autoBreadcrumbs, Raven) {
  // var modulesToInstrument = ['http', 'https', 'pg'];
  var Module = require('module');
  fill(Module, '_load', function (origLoad) {
    return function (moduleName) {
      // todo: determine exact input guarantees on moduleName - is it exact same as string passed to require? will it ever have .js suffix?
      // todo generally be a lot more robust/defensive in this and probably come up with some better variable names
      var origExports = origLoad.apply(this, arguments);
      var moduleBasename = path.basename(moduleName);
      if (autoBreadcrumbs[moduleBasename]) {
        var instrumentationFile = path.join('instrumentations', moduleBasename);
        require(instrumentationFile)(Raven, origExports);
      }
      return origExports;
    };
  }, originals);
}

function restoreOriginals() {
  var original;
  // eslint-disable-next-line no-cond-assign
  while (original = originals.shift()) {
    var obj = original[0];
    var name = original[1];
    var orig = original[2];
    obj[name] = orig;
  }
}

module.exports = {
  instrument: instrument,
  restoreOriginals: restoreOriginals
};
