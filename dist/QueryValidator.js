'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _colorsSafe = require('colors/safe');

var _colorsSafe2 = _interopRequireDefault(_colorsSafe);

var _util = require('./util');

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _rethinkdbProtoDef = require('rethinkdb/proto-def');

var _rethinkdbProtoDef2 = _interopRequireDefault(_rethinkdbProtoDef);

var _QueryParser = require('./QueryParser');

var _ReqlAstBuilder = require('./ReqlAstBuilder');

var _WhitelistSyntax = require('./WhitelistSyntax');

var QueryType = _rethinkdbProtoDef2['default'].Query.QueryType;
var START = QueryType.START;
var CONTINUE = QueryType.CONTINUE;
var STOP = QueryType.STOP;
var NOREPLY_WAIT = QueryType.NOREPLY_WAIT;

var queryTypeString = function queryTypeString(queryType) {
  return Object.keys(QueryType).filter(function (x) {
    return QueryType[x] === queryType;
  })[0];
};

// Compare the pattern RQ to the actual RQ to see if they match, and return a
// promise that resolves to true (false) if they matched (didn't match).
//
// When any term in the pattern RQ is a function, it matches the corresponding
// term in the actual RQ if and only if that function returns true. The
// function is called as fn(actualTerm, refs, session) and it must return
// a boolean, not a promise.
//
// The refs argument is an object that can be used to keep track of terms in
// the query so that the validate functions can refer to them easily. It starts
// out as {} every time a query is validated. Pattern functions can mutate it.
//
// The session argument is used to track any state regarding the current
// WebSocket client, for example the current user id. See the sessionCreator
// option in index.js for more information.
//
// If the actual RQ matches the pattern RQ data, then all of validate functions
// set on the pattern RQ will be called as validateFn(refs, session). Resolve
// to true if they all return true (or promises that resolve to true) or there
// are no validate functions. Resolve to false if the RQ data doesn't match or
// any validate function doesn't return true.
//
// Use the RQ.ref() function to simplify keeping track of terms for
// validations. For example, instead of:
//
// RQ(
//   RQ.FILTER(
//     RQ.TABLE("turtles"),
//     {"herdId": (herdId, refs, session) => {
//       refs.herdId = herdId;
//       return true;
//     }}
//   )
// ).validate((refs, session) => session.curHerdId === refs.herdId)
//
// Try this instead:
//
// RQ(
//   RQ.FILTER(
//     RQ.TABLE("turtles"),
//     {"herdId": RQ.ref("herdId")}
//   )
// ).validate((refs, session) => session.curHerdId === refs.herdId)

var queryMatches = function queryMatches(patternRQ, actualRQ, session) {
  var refs = {};
  var deepMatch = function deepMatch(pattern, actual) {
    return pattern === actual || typeof pattern === 'function' && pattern(actual, refs, session) || (0, _util.isArr)(pattern) && (0, _util.isArr)(actual) && (0, _util.arrEq)(pattern, actual, deepMatch) || (0, _util.isObj)(pattern) && (0, _util.isObj)(actual) && (0, _util.objEq)(pattern, actual, deepMatch);
  };
  if (deepMatch(patternRQ, actualRQ)) {
    var promises = patternRQ.validateFns.map(function (fn) {
      return fn(refs, session);
    });
    return _bluebird2['default'].all(promises).then(function (results) {
      return results.every(function (x) {
        return x;
      });
    });
  } else {
    return _bluebird2['default'].resolve(false);
  }
};

var QueryValidator = (function () {
  function QueryValidator(_ref) {
    var queryWhitelist = _ref.queryWhitelist;
    var unsafelyAllowAnyQuery = _ref.unsafelyAllowAnyQuery;
    var loggingMode = _ref.loggingMode;

    _classCallCheck(this, QueryValidator);

    this.queryWhitelist = queryWhitelist;
    this.unsafelyAllowAnyQuery = unsafelyAllowAnyQuery;
    this.loggingMode = loggingMode;
  }

  // Return a promise that resolves to true or false if the specified RQ
  // matched or didn't match any pattern RQ in the whitelist.

  _createClass(QueryValidator, [{
    key: 'queryInWhitelist',
    value: function queryInWhitelist(rq, ast, session) {
      var matchesPatternRQ = function matchesPatternRQ(patternRQ, index) {
        if (patternRQ.isRethinkQueryTerm) {
          return queryMatches(patternRQ, rq, session);
        } else if ((0, _WhitelistSyntax.isReqlAstTerm)(patternRQ)) {
          return (0, _WhitelistSyntax.astQueryMatches)(patternRQ, ast.query, ast.queryOptions, session);
        } else {
          throw new Error('Invalid whitelist query: index=' + index);
        }
      };
      var matchPromises = this.queryWhitelist.map(matchesPatternRQ);
      var matchArrayPromise = _bluebird2['default'].all(matchPromises);
      var hasAnyTrueValue = function hasAnyTrueValue(array) {
        return array.some(function (x) {
          return x;
        });
      };
      return matchArrayPromise.then(hasAnyTrueValue);
    }

    // Return a promise that resolves to true (false) if the specified query and
    // queryOptions (in the JSON format they were sent over the RethinkDB JSON
    // protocol) are allowed (denied) according to the queryWhitelist and
    // unsafelyAllowAnyQuery options. If the query is not well formed, the
    // returned Promise might be rejected instead of resolved to false.
    //
    // Log information to console using logFn about all queries passed in and
    // whether they were allowed. Also log a pretty parsed version of queries
    // missing from the whitelist so that developers can easily copy those into
    // their whitelist source file as they write new queries in the frontend.
    // Logging behavior depends on the value of loggingMode (see comment in
    // index.js).
  }, {
    key: 'validateQuery',
    value: function validateQuery(token, query, queryOptions, session, logFn) {
      var _this = this;

      return _bluebird2['default']['try'](_ReqlAstBuilder.reqlJsonToAst, [{ query: query, queryOptions: queryOptions }]).then(function (ast) {
        return _bluebird2['default']['try'](_QueryParser.parseQuery, [query, queryOptions]).then(function (rq) {
          return _this.queryInWhitelist(rq, ast, session).then(function (inWhitelist) {
            var allow = _this.unsafelyAllowAnyQuery || inWhitelist;
            var allowText = allow ? _colorsSafe2['default'].green('[ALLOW]') : _colorsSafe2['default'].red('[DENY]');
            var logMsgParts = [allowText, ' ', ast.query.toString()];
            Object.keys(ast.queryOptions || {}).forEach(function (x) {
              var key = JSON.stringify(x);
              var value = ast.queryOptions[x].toString();
              logMsgParts.push('.opt(', key, ', ', value, ')');
            });
            var shouldLog = _this.loggingMode === 'all' || _this.loggingMode === 'denied' && !inWhitelist;
            if (shouldLog) {
              logFn(logMsgParts.join(''), token);
            }
            return _bluebird2['default'].resolve(allow);
          });
        });
      });
    }

    // Parse the specified queryCmdBuf, a Buffer instance that spans the length
    // of an outgoing query command (not including the token and the query
    // length). Once parsed, make sure it passes validation with validateQuery.
    // Return a Promise that resolves to true (false) if the query is well-formed
    // and allowed (well-formed and denied), or rejected with an error if not
    // well-formed. Some non-well-formed queries may resolve to false instead of
    // reject.
  }, {
    key: 'validateQueryCmd',
    value: function validateQueryCmd(token, queryCmdBuf, session, logFn) {
      var _this2 = this;

      return _bluebird2['default']['try'](function () {
        var queryCmdJson = JSON.parse(queryCmdBuf);

        var _queryCmdJson = _slicedToArray(queryCmdJson, 3);

        var type = _queryCmdJson[0];
        var query = _queryCmdJson[1];
        var queryOptions = _queryCmdJson[2];

        if (type === START) {
          return _this2.validateQuery(token, query, queryOptions, session, logFn);
        } else if (type === CONTINUE || type === STOP || type === NOREPLY_WAIT) {
          if (query === undefined && queryOptions === undefined) {
            if (_this2.loggingMode === 'all') {
              logFn(queryTypeString(type), token);
            }
            return true;
          } else {
            throw new Error('Invalid ' + queryTypeString(type));
          }
        } else {
          throw new Error('Invalid queryType ' + type);
        }
      });
    }
  }]);

  return QueryValidator;
})();

exports.QueryValidator = QueryValidator;