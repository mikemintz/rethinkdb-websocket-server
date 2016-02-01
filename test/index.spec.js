/*eslint-env mocha */

import assert from 'assert';
import http from 'http';
import reqlite from 'reqlite';
import {Promise} from 'bluebird';
import * as WsClient from 'rethinkdb-websocket-client/dist/node';
import * as WsServer from '../';

let nextDbPort = 28060;

function setupInstances({
  httpPath = '/',
  queryWhitelist = [],
  unsafelyAllowAnyQuery = false,
  sessionCreator = undefined,
}) {
  return new Promise(resolve => {
    const dbPort = nextDbPort++; // TODO Ideally reqlite would let us pass 0 for next free port
    const httpServer = http.createServer();

    const reqliteOpts = {
      'driver-port': dbPort,
      silent: true,
    };
    const reqliteServer = new reqlite(reqliteOpts); //eslint-disable-line no-unused-vars

    const wsServerOpts = {
      httpServer,
      httpPath,
      dbPort,
      queryWhitelist,
      unsafelyAllowAnyQuery,
      sessionCreator,
      loggingMode: 'none',
    };
    WsServer.listen(wsServerOpts);
    httpServer.on('listening', () => {
      const {port} = httpServer.address();
      const wsClientOpts = {
        host: 'localhost',
        port,
        path: httpPath,
        db: 'test',
      };
      WsClient.connect(wsClientOpts).then(conn => {
        resolve({
          conn,
          cleanup: () => {
            conn.close();
            httpServer.close();
            // TODO Close reqliteServer
          },
        });
      });
    });
    httpServer.listen(0);
  });
}


describe('RethinkdbWebsocketServer', () => {
  it('should blindly process simple queries with unsafelyAllowAnyQuery', done => {
    const opts = {
      unsafelyAllowAnyQuery: true,
    };
    setupInstances(opts).then(({conn, cleanup}) => {
      const r = WsClient.rethinkdb;
      const turtles = [{id: '1'}, {id: '2'}];
      r.dbCreate('test').run(conn).then(() => (
        r.tableCreate('turtles').run(conn)
      )).then(() => (
        r.table('turtles').insert(turtles).run(conn)
      )).then(() => (
        r.table('turtles').run(conn)
      )).then(results => {
        assert.deepEqual(results, turtles);
        cleanup();
        done();
      });
    });
  });
});
