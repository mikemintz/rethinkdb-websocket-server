'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

var _bind = Function.prototype.bind;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

var _rethinkdbProtoDef = require('rethinkdb/proto-def');

var _rethinkdbProtoDef2 = _interopRequireDefault(_rethinkdbProtoDef);

var _rethinkdb = require('rethinkdb');

var _rethinkdb2 = _interopRequireDefault(_rethinkdb);

var _ReqlTermExamples = require('./ReqlTermExamples');

var _ReqlTermExamples2 = _interopRequireDefault(_ReqlTermExamples);

var _util = require('./util');

// Map RethinkDB AST term ids to their canonical names. This is simply and
// inverse mapping of protodef.Term.TermType.
var termIdToName = {};
Object.keys(_rethinkdbProtoDef2['default'].Term.TermType).forEach(function (termName) {
  var termId = _rethinkdbProtoDef2['default'].Term.TermType[termName];
  termIdToName[termId] = termName;
});

// Construct and return a rethinkdb driver AST term. The supplied termId is the
// numerical term id from the wire protocol. Args is the array of arguments
// that the term takes, and options is the optional options object that the
// term takes. Both args and options should be passed in as AST objects, not
// JSON wire protocol objects.
//
// E.g., buildAstTerm(15, ['abc']) returns the same thing as r.table('abc')
var buildAstTerm = function buildAstTerm(termId, args, options) {
  var termName = termIdToName[termId];
  var termClass = _ReqlTermExamples2['default'][termName].constructor;
  var termSuperClass = termClass.__super__.constructor;
  if (termSuperClass.name === 'RDBOp') {
    var term = Object.create(termClass.prototype);
    return termSuperClass.call.apply(termSuperClass, [term, options].concat(_toConsumableArray(args)));
  } else if (termSuperClass.name === 'RDBConstant') {
    return new (_bind.apply(termClass, [null].concat([options], _toConsumableArray(args))))();
  } else {
    throw new Error('Unexpected term type: ' + termSuperClass.name);
  }
};

// Parse a reql JSON term and return an AST object. The term parameter should
// come directly from the JSON format it was sent over the RethinkDB JSON wire
// protocol. May throw an exception if the term is ill formed.
var reqlJsonToAst = function reqlJsonToAst(term) {
  if ((0, _util.isArr)(term)) {
    var _term = _slicedToArray(term, 3);

    var termId = _term[0];
    var args = _term[1];
    var options = _term[2];

    if (args === undefined) {
      args = [];
    }
    (0, _util.ensure)(term.length <= 3, 'Too many array elements');
    (0, _util.ensure)((0, _util.isArr)(args), 'Invalid args type');
    (0, _util.ensure)(options === undefined || (0, _util.isObj)(options), 'Invalid options type');
    return buildAstTerm(termId, args.map(reqlJsonToAst), reqlJsonToAst(options));
  } else if ((0, _util.isObj)(term)) {
    var _ret = (function () {
      var result = {};
      Object.keys(term).forEach(function (key) {
        result[key] = reqlJsonToAst(term[key]);
      });
      return {
        v: result
      };
    })();

    if (typeof _ret === 'object') return _ret.v;
  } else if (term === undefined) {
    return undefined;
  } else {
    return _rethinkdb2['default'].expr(term);
  }
};

exports.reqlJsonToAst = reqlJsonToAst;