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
export {RQ} from './QueryParser';

// Start a WebSocket server attached to the specified http.Server instance.
// Incoming WebSocket connections will parse incoming RethinkDB queries and
// forward them to the specified RethinkDB TCP address. Queries that don't pass
// validation of the queryWhitelist will not be forwarded.
export function listen({

  // http.Server object, for new ws.Server({server: ...})
  httpServer,

  // HTTP path to listen on, for new ws.Server({path: ...})
  httpPath = '/',

  // RethinkDB host to connect to
  dbHost = 'localhost',

  // RethinkDB port to connect to
  dbPort = 28015,

  // List of pattern RQs, where an incoming query must match at least one
  // (see QueryValidator.js)
  queryWhitelist = [],

  // If true, all queries pass validation regardless of queryWhitelist
  unsafelyAllowAnyQuery = false,

  // Function from URL query params object to promise that resolves to an
  // arbitrary session object. Session objects will be available during query
  // validation.
  sessionCreator = (urlQueryParams) => Promise.resolve({}),

}) {
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: httpPath,
    perMessageDeflate: false, // necessary due to https://github.com/websockets/ws/issues/523
  });
  const queryValidator = new QueryValidator({queryWhitelist, unsafelyAllowAnyQuery});
  wsServer.on('connection', webSocket => {
    const connection = new Connection(queryValidator, webSocket);
    connection.start({sessionCreator, dbHost, dbPort});
  });
}
