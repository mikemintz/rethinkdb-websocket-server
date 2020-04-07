import {Server as WebSocketServer} from 'ws';
import {Promise} from 'bluebird';
import {Connection} from './Connection';
import {QueryValidator} from './QueryValidator';
import rethinkdb from 'rethinkdb';

// Make sure to import r from rethinkdb-websocket-server instead of directly
// from rethinkdb to ensure you're using the same instance of the library when
// defining whitelisted queries.
export const r = rethinkdb;

// Use RP to construct query patterns for queryWhitelist. See
// WhitelistSyntax.js and QueryValidator.js for more information.
export {ReqlPattern as RP} from './WhitelistSyntax';

// Use RQ to construct query patterns for queryWhitelist. See QueryParser.js and
// QueryValidator.js for more information.
//
// This syntax is deprecated as of 0.4 and will be removed in a future version.
// Use vanilla ReQL syntax with RP from WhitelistSyntax.js instead.
export {RQ} from './QueryParser';

// Start a WebSocket server attached to the specified http.Server instance.
// Incoming WebSocket connections will parse incoming RethinkDB queries and
// forward them to the specified RethinkDB TCP address. Queries that don't pass
// validation of the queryWhitelist will not be forwarded.
//
// Return the underlying WebSocketServer object. This behavior is subject to change
// if the underlying transport library used in rethinkdb-websocket-server changes.
export function listen({

  // http.Server object, for new ws.Server({server: ...})
  httpServer,

  // HTTP path to listen on, for new ws.Server({path: ...})
  httpPath = '/',

  // RethinkDB host to connect to
  dbHost = 'localhost',

  // RethinkDB port to connect to
  dbPort = 28015,

  // RethinkDB authKey for authenticated connections
  dbAuthKey = null,

  // For TLS connections to RethinkDB, equivalent to ssl argument in r.connect
  dbSsl = false,

  // List of pattern RQs, where an incoming query must match at least one
  // (see QueryValidator.js)
  queryWhitelist = [],

  // If true, all queries pass validation regardless of queryWhitelist
  unsafelyAllowAnyQuery = false,

  // Function from URL query params object to promise that resolves to an
  // arbitrary session object. Session objects will be available during query
  // validation.
  sessionCreator = (urlQueryParams) => Promise.resolve({}),

  // Specify how much to log to the console
  // - 'all' logs everything
  // - 'denied' logs queries that aren't in the query whitelist
  // - 'none' logs nothing, other than exception stack traces
  loggingMode = 'all',

}) {
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: httpPath,
    perMessageDeflate: true,
  });
  const queryValidator = new QueryValidator({
    queryWhitelist,
    unsafelyAllowAnyQuery,
    loggingMode,
  });
  wsServer.on('connection', webSocket => {
    const connection = new Connection(queryValidator, webSocket, loggingMode);
    connection.start({sessionCreator, dbHost, dbPort, dbAuthKey, dbSsl});
  });
  return wsServer;
}
