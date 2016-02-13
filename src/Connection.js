import colors from 'colors/safe';
import {errToString} from './util';
import moment from 'moment';
import net from 'net';
import protodef from 'rethinkdb/proto-def';
import url from 'url';

// A Connection instance wraps an incoming WebSocket (likely from a browser
// using rethinkdb-websocket-client) and an outgoing RethinkDB TCP socket. Once
// start() is called, it will forward traffic in both directions until either
// side disconnects. Each incoming WebSocket spawns a new outgoing TCP socket.
export class Connection {
  constructor(queryValidator, webSocket, loggingMode) {
    this.queryValidator = queryValidator;
    this.webSocket = webSocket;
    this.loggingMode = loggingMode;
    this.remoteAddress = webSocket._socket.remoteAddress;
    this.remotePort = webSocket._socket.remotePort;
  }

  start({sessionCreator, dbHost, dbPort}) {
    const urlQueryParams = url.parse(this.webSocket.upgradeReq.url, true).query;
    this.sessionPromise = sessionCreator(urlQueryParams).catch(e => {
      this.cleanupAndLogErr('Error in sessionCreator', e);
    });
    this.wsInBuffer = new Buffer(0);
    this.handshakeComplete = false;
    this.isClosed = false;
    this.dbSocket = net.createConnection(dbPort, dbHost);
    this.setupDbSocket();
    this.setupWebSocket();
    if (this.loggingMode === 'all') {
      this.log('Connect');
    }
  }

  setupDbSocket() {
    this.dbSocket.setNoDelay();
    this.dbSocket.on('data', data => {
      if (!this.isClosed) {
        try {
          if (this.webSocket.protocol === 'base64') {
            const b64EncodedData = (new Buffer(data)).toString('base64');
            this.webSocket.send(b64EncodedData);
          } else {
            this.webSocket.send(data, {binary: true});
          }
        } catch (e) {
          this.cleanupAndLogErr('Error recv dbSocket data', e);
        }
      }
    });
    this.dbSocket.on('end', () => {
      this.cleanup();
    });
    this.dbSocket.on('close', () => {
      if (this.loggingMode === 'all') {
        this.log('dbSocket closed');
      }
      this.cleanup();
    });
    this.dbSocket.on('error', e => {
      this.cleanupAndLogErr('dbSocket error', e);
    });
  }

  setupWebSocket() {
    this.webSocket.on('message', msg => {
      if (!this.isClosed) {
        try {
          this.handleWsMessage(msg);
        } catch (e) {
          this.cleanupAndLogErr('Error recv webSocket data', e);
        }
      }
    });
    this.webSocket.on('close', () => {
      if (this.loggingMode === 'all') {
        this.log('webSocket closed');
      }
      this.cleanup();
    });
    this.webSocket.on('error', e => {
      this.cleanupAndLogErr('webSocket error', e);
    });
  }

  log(msg, token) {
    const time = colors.blue(moment().format('HH:mm:ss.SSS'));
    const addr = colors.gray(this.remoteAddress + ':' + this.remotePort);
    const tokenStr = token ? colors.yellow(`tkn=${token} `) : '';
    console.log(`${time} ${addr} ${tokenStr}${msg}`);
  }

  cleanup() {
    this.isClosed = true;
    this.dbSocket.destroy();
    this.webSocket.close();
  }

  cleanupAndLogErr(msg, error) {
    this.cleanup();
    const fullMsg = error ? msg + '\n' + errToString(error) : msg;
    this.log(colors.red(fullMsg));
  }

  processClientCommand(cmdBuf) {
    // https://github.com/rethinkdb/rethinkdb/blob/61692c0ed4/drivers/javascript/net.coffee#L269-L273
    const token = cmdBuf.readUInt32LE(0) + 0x100000000 * cmdBuf.readUInt32LE(4);
    const queryCmdBuf = cmdBuf.slice(12, cmdBuf.length);
    const logFn = this.log.bind(this);
    const validatePromise = this.sessionPromise.then(session => (
      this.queryValidator.validateQueryCmd(token, queryCmdBuf, session, logFn)
    ));
    return validatePromise.then(allow => {
      if (allow) {
        this.dbSocket.write(cmdBuf, 'binary');
      }
      // TODO It might be nice to send a response back to the client of type
      // CLIENT_ERROR. However, we'd need to parse every message back from
      // the db in order to avoid injecting our response in the middle of a
      // large response.
      //
      // Right now, the query will be silently ignored in the frontend and
      // logged in the backend. This might lead to some sort of memory leak
      // in the frontend if it's waiting for responses from queries. This is
      // not very important, because properly written frontends should avoid
      // submitting queries that are denied.
      //
      // Alternatively, we could close the connection after a denied query,
      // as an easier to debug fail-fast option.
    });
  }

  validateClientHandshake(buf) {
    const protocolVersion = buf.readUInt32LE(0);
    if (protocolVersion !== protodef.VersionDummy.Version.V0_4) {
      this.cleanupAndLogErr('Invalid protocolVersion ' + protocolVersion);
      return 0;
    }
    const keyLength = buf.readUInt32LE(4);
    if (keyLength !== 0) {
      this.cleanupAndLogErr('Auth key not supported');
      return 0;
    }
    const protocolType = buf.readUInt32LE(8);
    if (protocolType !== protodef.VersionDummy.Protocol.JSON) {
      this.cleanupAndLogErr('Protocol type not supported ' + protocolType);
      return 0;
    }
    return 12;
  }

  processNextMessage(buf) {
    if (!this.handshakeComplete) {
      if (buf.length >= 12) {
        const clientHandshakeLength = this.validateClientHandshake(buf);
        if (clientHandshakeLength > 0) {
          this.dbSocket.write(buf.slice(0, clientHandshakeLength), 'binary');
          this.handshakeComplete = true;
          return clientHandshakeLength;
        } else {
          return 0;
        }
      }
    } else {
      if (buf.length >= 12) {
        const encodedQueryLength = buf.readUInt32LE(8);
        const queryEndOffset = 12 + encodedQueryLength;
        if (queryEndOffset <= buf.length) {
          const cmdBuf = buf.slice(0, queryEndOffset);
          this.processClientCommand(cmdBuf).catch(e => {
            this.cleanupAndLogErr('Error in processClientCommand', e);
          });
          return queryEndOffset;
        }
      }
    }
    return 0;
  }

  handleWsMessage(msg) {
    const isBase64 = typeof msg === 'string' && this.webSocket.protocol === 'base64';
    const incomingBuffer = isBase64 ? new Buffer(msg, 'base64') : msg;
    this.wsInBuffer = Buffer.concat([this.wsInBuffer, incomingBuffer]);
    let keepGoing = true;
    while (keepGoing) {
      let bytesConsumed = this.processNextMessage(this.wsInBuffer);
      this.wsInBuffer = this.wsInBuffer.slice(bytesConsumed);
      keepGoing = bytesConsumed > 0;
    }
  }
}
