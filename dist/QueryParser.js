'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

var _rethinkdbProtoDef = require('rethinkdb/proto-def');

var _rethinkdbProtoDef2 = _interopRequireDefault(_rethinkdbProtoDef);

var _util = require('./util');

var _util2 = require('util');

// Map RethinkDB AST term ids to readable names. Add a special "query" term
// with id="query" and name="query".

var QUERY_TERM_ID = 'query';
var termIdToName = {};
termIdToName[QUERY_TERM_ID] = QUERY_TERM_ID;
Object.keys(_rethinkdbProtoDef2['default'].Term.TermType).forEach(function (termName) {
  var termId = _rethinkdbProtoDef2['default'].Term.TermType[termName];
  termIdToName[termId] = termName;
});

// RQ represents a parsed RethinkDB query or term. It can either be parsed from
// an incoming query over the JSON protocol via parseQuery(), or it can be
// manually constructed in a whitelist on the server as a "pattern query" to
// validate incoming queries.
//
// To manually create an RQ object, call RQ.<termname>(<args>). To set query
// options, call the .opt(key, value) method, which sets the option and returns
// the modified RQ object. RQ(...) is shorthand for RQ.query(...).
//
// For example, r.table('turtles').count() becomes:
// RQ(
//   RQ.COUNT(
//     RQ.TABLE("turtles")
//   )
// ).opt("db", RQ.DB("test"))
//
// When manually creating pattern queries, you will want to make use of pattern
// functions, RQ.ref(), and validate() functions. See QueryValidator.js for
// more information.
//
// This syntax is deprecated as of 0.4 and will be removed in a future version.
// Use vanilla ReQL syntax with RP from WhitelistSyntax.js instead.

var RQ = (0, _util2.deprecate)(function () {
  return RQ[QUERY_TERM_ID].apply(RQ, arguments);
}, 'RQ query whitelist syntax is deprecated in rethinkdb-websocket-server 0.4 ' + 'and will be removed in a future version. Use vanilla ReQL syntax with RP ' + 'instead. E.g. r.table("turtles") instead of RQ.TABLE("turtles")');
Object.keys(termIdToName).forEach(function (termId) {
  var termName = termIdToName[termId];
  RQ[termName] = function () {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    var options = [];
    var result = [termId, args, options];
    result.isRethinkQueryTerm = true;
    result.validateFns = [];
    result.opt = function (key, value) {
      options.push([key, value]);
      return result;
    };
    result.validate = function (fn) {
      result.validateFns.push(fn);
      return result;
    };
    return result;
  };
});

RQ.ref = function (refName) {
  return function (value, refs, session) {
    refs[refName] = value;
    return true;
  };
};

// Take an RQ object and return a nicely formatted string. Intended for actual
// queries, not pattern queries.
var rqToString = function rqToString(query) {
  var initialIndentLevel = arguments.length <= 1 || arguments[1] === undefined ? 0 : arguments[1];
  var spacesPerIndent = arguments.length <= 2 || arguments[2] === undefined ? 0 : arguments[2];

  var oneLineCharCutoff = 40;
  var termToString = function termToString(data, curLevel) {
    var result = [];
    var nextLevel = curLevel + 1;
    var curIndentSpace = (0, _util.repeatString)(' ', curLevel * spacesPerIndent);
    var nextIndentSpace = (0, _util.repeatString)(' ', nextLevel * spacesPerIndent);
    var newline = spacesPerIndent > 0 ? '\n' : '';

    var pushSequence = function pushSequence(prefix, suffix, elems) {
      result.push(prefix);
      var oneLine = elems.join(', ');
      if (oneLine.length <= oneLineCharCutoff && oneLine.indexOf('\n') < 0) {
        result.push(oneLine);
      } else {
        elems.forEach(function (elem, index) {
          result.push(newline, nextIndentSpace, elem);
          if (index === elems.length - 1) {
            result.push(newline, curIndentSpace);
          } else {
            result.push(',');
          }
        });
      }
      result.push(suffix);
    };

    if ((0, _util.isArr)(data) && data.isRethinkQueryTerm) {
      var _data = _slicedToArray(data, 3);

      var termId = _data[0];
      var args = _data[1];
      var options = _data[2];

      result.push('RQ');
      if (termId !== QUERY_TERM_ID) {
        result.push('.', termIdToName[termId]);
      }
      var argElems = args.map(function (x) {
        return termToString(x, nextLevel);
      });
      pushSequence('(', ')', argElems);
      options.forEach(function (_ref) {
        var _ref2 = _slicedToArray(_ref, 2);

        var key = _ref2[0];
        var value = _ref2[1];

        var optElems = [JSON.stringify(key), termToString(value, nextLevel)];
        pushSequence('.opt(', ')', optElems);
      });
    } else if ((0, _util.isArr)(data)) {
      var elems = data.map(function (x) {
        return termToString(x, nextLevel);
      });
      pushSequence('[', ']', elems);
    } else if ((0, _util.isObj)(data)) {
      var elems = Object.keys(data).map(function (key) {
        return JSON.stringify(key) + ': ' + termToString(data[key], nextLevel);
      });
      pushSequence('{', '}', elems);
    } else {
      result.push(JSON.stringify(data));
    }
    return result.join('');
  };

  return (0, _util.repeatString)(' ', initialIndentLevel * spacesPerIndent) + termToString(query, initialIndentLevel, spacesPerIndent);
};

// Parse a query and return an RQ object. The arguments query and queryOptions
// should come directly from the JSON format they were sent over the RethinkDB
// JSON wire protocol. May throw an exception if the query is ill formed.
var parseQuery = function parseQuery(query, queryOptions) {
  var parseTerm = function parseTerm(data) {
    if ((0, _util.isArr)(data)) {
      var _ret = (function () {
        var _data2 = _slicedToArray(data, 3);

        var termId = _data2[0];
        var args = _data2[1];
        var options = _data2[2];

        if (args === undefined) {
          args = [];
        }
        (0, _util.ensure)(data.length <= 3, 'Too many array elements');
        (0, _util.ensure)((0, _util.isArr)(args), 'Invalid args type');
        (0, _util.ensure)(options === undefined || (0, _util.isObj)(options), 'Invalid options type');
        var termName = termIdToName[termId];
        var result = RQ[termName].apply(RQ, _toConsumableArray(args.map(parseTerm)));
        Object.keys(options || {}).forEach(function (key) {
          result = result.opt(key, parseTerm(options[key]));
        });
        return {
          v: result
        };
      })();

      if (typeof _ret === 'object') return _ret.v;
    } else if ((0, _util.isObj)(data)) {
      var _ret2 = (function () {
        var result = {};
        Object.keys(data).forEach(function (key) {
          result[key] = parseTerm(data[key]);
        });
        return {
          v: result
        };
      })();

      if (typeof _ret2 === 'object') return _ret2.v;
    } else {
      return data;
    }
  };

  return parseTerm(['query', [query], queryOptions]);
};

exports.RQ = RQ;
exports.rqToString = rqToString;
exports.parseQuery = parseQuery;