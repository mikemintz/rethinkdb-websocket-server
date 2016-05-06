'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
exports.listen = listen;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _ws = require('ws');

var _bluebird = require('bluebird');

var _Connection = require('./Connection');

var _QueryValidator = require('./QueryValidator');

var _rethinkdb = require('rethinkdb');

var _rethinkdb2 = _interopRequireDefault(_rethinkdb);

// Make sure to import r from rethinkdb-websocket-server instead of directly
// from rethinkdb to ensure you're using the same instance of the library when
// defining whitelisted queries.
var r = _rethinkdb2['default'];

exports.r = r;
// Use RP to construct query patterns for queryWhitelist. See
// WhitelistSyntax.js and QueryValidator.js for more information.

var _WhitelistSyntax = require('./WhitelistSyntax');

Object.defineProperty(exports, 'RP', {
  enumerable: true,
  get: function get() {
    return _WhitelistSyntax.ReqlPattern;
  }
});

// Use RQ to construct query patterns for queryWhitelist. See QueryParser.js and
// QueryValidator.js for more information.
//
// This syntax is deprecated as of 0.4 and will be removed in a future version.
// Use vanilla ReQL syntax with RP from WhitelistSyntax.js instead.

var _QueryParser = require('./QueryParser');

Object.defineProperty(exports, 'RQ', {
  enumerable: true,
  get: function get() {
    return _QueryParser.RQ;
  }
});

// Start a WebSocket server attached to the specified http.Server instance.
// Incoming WebSocket connections will parse incoming RethinkDB queries and
// forward them to the specified RethinkDB TCP address. Queries that don't pass
// validation of the queryWhitelist will not be forwarded.

function listen(_ref) {
  var

  // http.Server object, for new ws.Server({server: ...})
  httpServer = _ref.httpServer;
  var _ref$httpPath = _ref.httpPath;
  var

  // HTTP path to listen on, for new ws.Server({path: ...})
  httpPath = _ref$httpPath === undefined ? '/' : _ref$httpPath;
  var _ref$dbHost = _ref.dbHost;
  var

  // RethinkDB host to connect to
  dbHost = _ref$dbHost === undefined ? 'localhost' : _ref$dbHost;
  var _ref$dbPort = _ref.dbPort;
  var

  // RethinkDB port to connect to
  dbPort = _ref$dbPort === undefined ? 28015 : _ref$dbPort;
  var _ref$dbAuthKey = _ref.dbAuthKey;
  var

  // RethinkDB authKey for authenticated connections
  dbAuthKey = _ref$dbAuthKey === undefined ? null : _ref$dbAuthKey;
  var _ref$dbSsl = _ref.dbSsl;
  var

  // For TLS connections to RethinkDB, equivalent to ssl argument in r.connect
  dbSsl = _ref$dbSsl === undefined ? false : _ref$dbSsl;
  var _ref$queryWhitelist = _ref.queryWhitelist;
  var

  // List of pattern RQs, where an incoming query must match at least one
  // (see QueryValidator.js)
  queryWhitelist = _ref$queryWhitelist === undefined ? [] : _ref$queryWhitelist;
  var _ref$unsafelyAllowAnyQuery = _ref.unsafelyAllowAnyQuery;
  var

  // If true, all queries pass validation regardless of queryWhitelist
  unsafelyAllowAnyQuery = _ref$unsafelyAllowAnyQuery === undefined ? false : _ref$unsafelyAllowAnyQuery;
  var _ref$sessionCreator = _ref.sessionCreator;
  var

  // Function from URL query params object to promise that resolves to an
  // arbitrary session object. Session objects will be available during query
  // validation.
  sessionCreator = _ref$sessionCreator === undefined ? function (urlQueryParams) {
    return _bluebird.Promise.resolve({});
  } : _ref$sessionCreator;
  var _ref$loggingMode = _ref.loggingMode;
  var

  // Specify how much to log to the console
  // - 'all' logs everything
  // - 'denied' logs queries that aren't in the query whitelist
  // - 'none' logs nothing, other than exception stack traces
  loggingMode = _ref$loggingMode === undefined ? 'all' : _ref$loggingMode;

  var wsServer = new _ws.Server({
    server: httpServer,
    path: httpPath,
    perMessageDeflate: false });
  // necessary due to https://github.com/websockets/ws/issues/523
  var queryValidator = new _QueryValidator.QueryValidator({
    queryWhitelist: queryWhitelist,
    unsafelyAllowAnyQuery: unsafelyAllowAnyQuery,
    loggingMode: loggingMode
  });
  wsServer.on('connection', function (webSocket) {
    var connection = new _Connection.Connection(queryValidator, webSocket, loggingMode);
    connection.start({ sessionCreator: sessionCreator, dbHost: dbHost, dbPort: dbPort, dbAuthKey: dbAuthKey, dbSsl: dbSsl });
  });
}