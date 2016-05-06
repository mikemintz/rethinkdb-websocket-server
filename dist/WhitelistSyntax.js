'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _util = require('./util');

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _rethinkdbProtoDef = require('rethinkdb/proto-def');

var _rethinkdbProtoDef2 = _interopRequireDefault(_rethinkdbProtoDef);

var _rethinkdb = require('rethinkdb');

var _rethinkdb2 = _interopRequireDefault(_rethinkdb);

var _ReqlTermExamples = require('./ReqlTermExamples');

var _ReqlTermExamples2 = _interopRequireDefault(_ReqlTermExamples);

var DatumTerm = _ReqlTermExamples2['default'].DATUM.constructor;
var RDBVal = DatumTerm.__super__.constructor;
var TermBase = RDBVal.__super__.constructor;

// Monkey-patch rethinkdb driver AST terms with a validate method. The validate
// method takes a validation function as its only argument and appends it to
// the list of validate functions stored with this AST term. The validate
// method returns the updated AST term so that it can be chained with other
// calls. See astQueryMatches() below for more information.
TermBase.prototype.validate = function (validateFn) {
  this.validateFns = this.validateFns || [];
  this.validateFns.push(validateFn);
  return this;
};

// Monkey-patch rethinkdb driver AST terms with an opt method, similar to
// validate() above. It stores excepted query option key/value pairs, so that
// pattern queries can check options like db and durability.
TermBase.prototype.opt = function (key, value) {
  this.queryOptions = this.queryOptions || {};
  this.queryOptions[key] = _rethinkdb2['default'].expr(value);
  return this;
};

// ReqlPatternTerm is an AST term that represents a pattern matching function
// inside a whitelist query.
//
// When an incoming query is matched against a pattern query, a term in the
// actual query that corresponds to this ReqlPatternTerm in the pattern query
// will cause us to run the supplied function as fn(actualTerm, refs, session),
// and it must return a boolean that determines whether the actual term matches
// the pattern.

var ReqlPatternTerm = (function (_DatumTerm) {
  _inherits(ReqlPatternTerm, _DatumTerm);

  function ReqlPatternTerm(fn) {
    _classCallCheck(this, ReqlPatternTerm);

    _get(Object.getPrototypeOf(ReqlPatternTerm.prototype), 'constructor', this).call(this);
    (0, _util.ensure)(fn instanceof Function, 'RP.check() requires a function argument');
    this.fn = fn;
  }

  // ReqlPattern (exported to clients as RP) provides methods to construct
  // whitelist queries that offer more sophisticated pattern matching than just
  // exact match.

  _createClass(ReqlPatternTerm, [{
    key: 'build',
    value: function build() {
      return this.fn;
    }
  }, {
    key: 'compose',
    value: function compose() {
      return this.fn.toString();
    }
  }]);

  return ReqlPatternTerm;
})(DatumTerm);

var ReqlPattern = {

  // When any term in a pattern query is created from RP.check(fn), it matches
  // the corresponding term in the actual query if and only if  fn(actualTerm,
  // refs, session) returns true. It must return a boolean, not a promise.
  //
  // The actualTerm argument is the JSON protocol encoding of the corresponding
  // term. For primitives (strings, numbers, and booleans), actualTerm will
  // just be that same primitive; but for arrays, objects, and other reql
  // terms, the JSON protocol encoding becomes relevant. The same applies for
  // RP.ref below.
  //
  // The refs argument is an object that can be used to keep track of terms in
  // the query so that the validate functions can refer to them easily. It starts
  // out as {} every time a query is validated. RP.check functions can mutate it.
  //
  // The session argument is used to track any state regarding the current
  // WebSocket client, for example the current user id. See the sessionCreator
  // option in index.js for more information.
  check: function check(fn) {
    return new ReqlPatternTerm(fn);
  },

  // When any term in a pattern query is created from RP.ref(refName), it
  // always matches and then stores the corresponding term from the actual
  // query in refs[refName]. Like RP.check, it stores the JSON protocol
  // encoding of the corresponding term.
  //
  // Use RP.ref() to simplify keeping track of terms for validations. For
  // example, instead of:
  //
  // r.table("turtles")
  //  .filter({"herdId": RP.check((herdId, refs, session) => {
  //    refs.herdId = herdId;
  //    return true;
  //  })})
  //  .validate((refs, session) => session.curHerdId === refs.herdId)
  //
  // Try this instead:
  //
  // r.table("turtles")
  //  .filter({"herdId": RP.ref("herdId")})
  //  .validate((refs, session) => session.curHerdId === refs.herdId)
  ref: function ref(refName) {
    return new ReqlPatternTerm(function (value, refs, session) {
      refs[refName] = value;
      return true;
    });
  }

};

// Return whether or not the specified object is a rethinkdb driver AST term.
var isReqlAstTerm = function isReqlAstTerm(obj) {
  return obj instanceof TermBase;
};

// Compare the pattern query to the actual query to see if they match, and
// return a promise that resolves to true (false) if they matched (didn't
// match). Both queries should be in rethinkdb AST term form.
//
// If the actual query matches the pattern query data, then all of validate functions
// set on the pattern query will be called as validateFn(refs, session). Resolve
// to true if they all return true (or promises that resolve to true) or there
// are no validate functions. Resolve to false if the query data doesn't match or
// any validate function doesn't return true.
var astQueryMatches = function astQueryMatches(patternQuery, actualQuery, actualQueryOptions, session) {
  // Track refs from RP.ref() for use in validate()
  var refs = {};

  // Map reql function var ids from pattern to actual, since they are generated
  // non-deterministically. This prevents us from rejecting incoming queries
  // that only differ from pattern queries in the numerical values of their var
  // ids.
  var varIdMap = {};

  // Check if the specified protocol JSON term is well formed
  var isValidTerm = function isValidTerm(term) {
    return term.length <= 3 && typeof term[0] === 'number' && (0, _util.isArr)(term[1]) && term[2] === undefined || (0, _util.isObj)(term[2]);
  };

  var deepMatch = function deepMatch(pattern, actual) {
    if (pattern instanceof Function) {
      return pattern(actual, refs, session);
    } else if ((0, _util.isArr)(pattern)) {
      var _pattern = _slicedToArray(pattern, 3);

      var patternTermId = _pattern[0];
      var patternArgs = _pattern[1];
      var patternOpts = _pattern[2];

      var _actual = _slicedToArray(actual, 3);

      var actualTermId = _actual[0];
      var actualArgs = _actual[1];
      var actualOpts = _actual[2];

      var metadataMatches = isValidTerm(pattern) && isValidTerm(actual) && patternTermId === actualTermId && deepMatch(patternOpts, actualOpts);
      if (!metadataMatches) {
        return false;
      }
      // Use varIdMap to compare var ids in FUNC and VAR terms
      if (patternTermId === _rethinkdbProtoDef2['default'].Term.TermType.FUNC) {
        var _ret = (function () {
          // The term looks like [FUNC, [[MAKE_ARRAY, [1, 2]], ...]]
          var isValidFuncArgs = function isValidFuncArgs(x) {
            return isValidTerm(x) && x[0] === _rethinkdbProtoDef2['default'].Term.TermType.MAKE_ARRAY && x[1].filter(function (y) {
              return typeof y !== 'number';
            }).length === 0 && Object.keys(x[2] || {}).length === 0;
          };
          // Check that first arg looks like [MAKE_ARRAY, [1, 2]]
          if (!isValidFuncArgs(patternArgs[0]) || !isValidFuncArgs(actualArgs[0])) {
            return {
              v: false
            };
          }
          var patternVarIds = patternArgs[0][1];
          var actualVarIds = actualArgs[0][1];
          if (patternVarIds.length !== actualVarIds.length) {
            return {
              v: false
            };
          }
          patternVarIds.forEach(function (patternVarId, index) {
            (0, _util.ensure)(!(patternVarId in varIdMap), 'Repeated var id in pattern query');
            varIdMap[patternVarId] = actualVarIds[index];
          });
          patternArgs = patternArgs.slice(1);
          actualArgs = actualArgs.slice(1);
        })();

        if (typeof _ret === 'object') return _ret.v;
      } else if (patternTermId === _rethinkdbProtoDef2['default'].Term.TermType.VAR) {
        // The term looks like [VAR, [1]]
        patternArgs = patternArgs.map(function (x) {
          return varIdMap[x];
        });
      }
      return (0, _util.arrEq)(patternArgs, actualArgs, deepMatch);
    } else if ((0, _util.isObj)(pattern)) {
      return (0, _util.isObj)(actual) && (0, _util.objEq)(pattern, actual, deepMatch);
    }
    return pattern === actual;
  };
  var buildOpts = function buildOpts(opts) {
    return _rethinkdb2['default'].expr(opts || {}).build();
  };
  var isMatch = deepMatch(patternQuery.build(), actualQuery.build()) && deepMatch(buildOpts(patternQuery.queryOptions), buildOpts(actualQueryOptions));
  if (isMatch) {
    var validateFns = patternQuery.validateFns || [];
    var promises = validateFns.map(function (fn) {
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

exports.ReqlPattern = ReqlPattern;
exports.isReqlAstTerm = isReqlAstTerm;
exports.astQueryMatches = astQueryMatches;