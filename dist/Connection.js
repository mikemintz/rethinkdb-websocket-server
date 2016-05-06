'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _colorsSafe = require('colors/safe');

var _colorsSafe2 = _interopRequireDefault(_colorsSafe);

var _util = require('./util');

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _tls = require('tls');

var _tls2 = _interopRequireDefault(_tls);

var _rethinkdbProtoDef = require('rethinkdb/proto-def');

var _rethinkdbProtoDef2 = _interopRequireDefault(_rethinkdbProtoDef);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

// A Connection instance wraps an incoming WebSocket (likely from a browser
// using rethinkdb-websocket-client) and an outgoing RethinkDB TCP socket. Once
// start() is called, it will forward traffic in both directions until either
// side disconnects. Each incoming WebSocket spawns a new outgoing TCP socket.

var Connection = (function () {
  function Connection(queryValidator, webSocket, loggingMode) {
    _classCallCheck(this, Connection);

    this.queryValidator = queryValidator;
    this.webSocket = webSocket;
    this.loggingMode = loggingMode;
    this.remoteAddress = webSocket._socket.remoteAddress;
    this.remotePort = webSocket._socket.remotePort;
  }

  _createClass(Connection, [{
    key: 'start',
    value: function start(_ref) {
      var _this = this;

      var sessionCreator = _ref.sessionCreator;
      var dbHost = _ref.dbHost;
      var dbPort = _ref.dbPort;
      var dbAuthKey = _ref.dbAuthKey;
      var dbSsl = _ref.dbSsl;

      var urlQueryParams = _url2['default'].parse(this.webSocket.upgradeReq.url, true).query;
      var req = this.webSocket.upgradeReq;
      this.sessionPromise = sessionCreator(urlQueryParams, req)['catch'](function (e) {
        _this.sendWebSocketMessage('rethinkdb-websocket-server session rejected\0');
        _this.cleanupAndLogErr('Error in sessionCreator', e);
      });
      this.dbAuthKey = dbAuthKey;
      this.wsInBuffer = new Buffer(0);
      this.handshakeComplete = false;
      this.isClosed = false;
      var options = {
        host: dbHost,
        port: dbPort
      };
      if (typeof dbSsl === 'boolean' && dbSsl) {
        this.dbSocket = _tls2['default'].connect(options);
      } else if (typeof dbSsl === 'object') {
        options = _extends({}, dbSsl, options);
        this.dbSocket = _tls2['default'].connect(options);
      } else {
        this.dbSocket = _net2['default'].connect(options);
      }
      this.dbAuthKey = dbAuthKey;
      this.setupDbSocket();
      this.setupWebSocket();
      if (this.loggingMode === 'all') {
        this.log('Connect');
      }
    }
  }, {
    key: 'sendWebSocketMessage',
    value: function sendWebSocketMessage(data) {
      if (this.webSocket.protocol === 'base64') {
        var b64EncodedData = new Buffer(data).toString('base64');
        this.webSocket.send(b64EncodedData);
      } else {
        this.webSocket.send(data, { binary: true });
      }
    }
  }, {
    key: 'setupDbSocket',
    value: function setupDbSocket() {
      var _this2 = this;

      this.dbSocket.setNoDelay();
      this.dbSocket.on('data', function (data) {
        if (!_this2.isClosed) {
          try {
            _this2.sendWebSocketMessage(data);
          } catch (e) {
            _this2.cleanupAndLogErr('Error recv dbSocket data', e);
          }
        }
      });
      this.dbSocket.on('end', function () {
        _this2.cleanup();
      });
      this.dbSocket.on('close', function () {
        if (_this2.loggingMode === 'all') {
          _this2.log('dbSocket closed');
        }
        _this2.cleanup();
      });
      this.dbSocket.on('error', function (e) {
        _this2.cleanupAndLogErr('dbSocket error', e);
      });
    }
  }, {
    key: 'setupWebSocket',
    value: function setupWebSocket() {
      var _this3 = this;

      this.webSocket.on('message', function (msg) {
        if (!_this3.isClosed) {
          try {
            _this3.handleWsMessage(msg);
          } catch (e) {
            _this3.cleanupAndLogErr('Error recv webSocket data', e);
          }
        }
      });
      this.webSocket.on('close', function () {
        if (_this3.loggingMode === 'all') {
          _this3.log('webSocket closed');
        }
        _this3.cleanup();
      });
      this.webSocket.on('error', function (e) {
        _this3.cleanupAndLogErr('webSocket error', e);
      });
    }
  }, {
    key: 'log',
    value: function log(msg, token) {
      var time = _colorsSafe2['default'].blue((0, _moment2['default'])().format('HH:mm:ss.SSS'));
      var addr = _colorsSafe2['default'].gray(this.remoteAddress + ':' + this.remotePort);
      var tokenStr = token ? _colorsSafe2['default'].yellow('tkn=' + token + ' ') : '';
      console.log(time + ' ' + addr + ' ' + tokenStr + msg);
    }
  }, {
    key: 'cleanup',
    value: function cleanup() {
      this.isClosed = true;
      this.dbSocket.destroy();
      this.webSocket.close();
    }
  }, {
    key: 'cleanupAndLogErr',
    value: function cleanupAndLogErr(msg, error) {
      this.cleanup();
      var fullMsg = error ? msg + '\n' + (0, _util.errToString)(error) : msg;
      this.log(_colorsSafe2['default'].red(fullMsg));
    }
  }, {
    key: 'processClientCommand',
    value: function processClientCommand(cmdBuf) {
      var _this4 = this;

      // https://github.com/rethinkdb/rethinkdb/blob/61692c0ed4/drivers/javascript/net.coffee#L269-L273
      var token = cmdBuf.readUInt32LE(0) + 0x100000000 * cmdBuf.readUInt32LE(4);
      var queryCmdBuf = cmdBuf.slice(12, cmdBuf.length);
      var logFn = this.log.bind(this);
      var validatePromise = this.sessionPromise.then(function (session) {
        return _this4.queryValidator.validateQueryCmd(token, queryCmdBuf, session, logFn);
      });
      return validatePromise.then(function (allow) {
        if (allow) {
          _this4.dbSocket.write(cmdBuf, 'binary');
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
  }, {
    key: 'validateClientHandshake',
    value: function validateClientHandshake(buf) {
      var protocolVersion = buf.readUInt32LE(0);
      if (protocolVersion !== _rethinkdbProtoDef2['default'].VersionDummy.Version.V0_4) {
        this.cleanupAndLogErr('Invalid protocolVersion ' + protocolVersion);
        return 0;
      }
      var keyLength = buf.readUInt32LE(4);
      if (keyLength !== 0) {
        this.cleanupAndLogErr('Auth key not supported');
        return 0;
      }
      var protocolType = buf.readUInt32LE(8);
      if (protocolType !== _rethinkdbProtoDef2['default'].VersionDummy.Protocol.JSON) {
        this.cleanupAndLogErr('Protocol type not supported ' + protocolType);
        return 0;
      }
      return 12;
    }
  }, {
    key: 'processNextMessage',
    value: function processNextMessage(buf) {
      var _this5 = this;

      if (!this.handshakeComplete) {
        if (buf.length >= 12) {
          var clientHandshakeLength = this.validateClientHandshake(buf);
          if (clientHandshakeLength > 0) {
            var authKey = this.dbAuthKey || '';
            var outBuf = new Buffer(12 + authKey.length);
            outBuf.writeUInt32LE(_rethinkdbProtoDef2['default'].VersionDummy.Version.V0_4, 0);
            outBuf.writeUInt32LE(authKey.length, 4);
            outBuf.write(authKey, 8);
            outBuf.writeUInt32LE(_rethinkdbProtoDef2['default'].VersionDummy.Protocol.JSON, 8 + authKey.length);
            this.dbSocket.write(outBuf, 'binary');
            this.handshakeComplete = true;
            return clientHandshakeLength;
          } else {
            return 0;
          }
        }
      } else {
        if (buf.length >= 12) {
          var encodedQueryLength = buf.readUInt32LE(8);
          var queryEndOffset = 12 + encodedQueryLength;
          if (queryEndOffset <= buf.length) {
            var cmdBuf = buf.slice(0, queryEndOffset);
            this.processClientCommand(cmdBuf)['catch'](function (e) {
              _this5.cleanupAndLogErr('Error in processClientCommand', e);
            });
            return queryEndOffset;
          }
        }
      }
      return 0;
    }
  }, {
    key: 'handleWsMessage',
    value: function handleWsMessage(msg) {
      var isBase64 = typeof msg === 'string' && this.webSocket.protocol === 'base64';
      var incomingBuffer = isBase64 ? new Buffer(msg, 'base64') : msg;
      this.wsInBuffer = Buffer.concat([this.wsInBuffer, incomingBuffer]);
      var keepGoing = true;
      while (keepGoing) {
        var bytesConsumed = this.processNextMessage(this.wsInBuffer);
        this.wsInBuffer = this.wsInBuffer.slice(bytesConsumed);
        keepGoing = bytesConsumed > 0;
      }
    }
  }]);

  return Connection;
})();

exports.Connection = Connection;