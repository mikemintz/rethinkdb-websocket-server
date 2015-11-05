import colors from 'colors/safe';
import {isArr, isObj, arrEq, objEq} from './util';
import Promise from 'bluebird';
import protodef from 'rethinkdb/proto-def';
import {parseQuery, rqToString} from './QueryParser';
import {reqlJsonToAst} from './ReqlAstBuilder';

const QueryType = protodef.Query.QueryType;
const {START, CONTINUE, STOP, NOREPLY_WAIT} = QueryType;

const queryTypeString = queryType => (
  Object.keys(QueryType).filter(x => QueryType[x] === queryType)[0]
);

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

const queryMatches = (patternRQ, actualRQ, session) => {
  const refs = {};
  const deepMatch = (pattern, actual) => (
    (
      pattern === actual
    ) || (
      typeof pattern === 'function' && pattern(actual, refs, session)
    ) || (
      isArr(pattern) && isArr(actual) && arrEq(pattern, actual, deepMatch)
    ) || (
      isObj(pattern) && isObj(actual) && objEq(pattern, actual, deepMatch)
    )
  );
  if (deepMatch(patternRQ, actualRQ)) {
    const promises = patternRQ.validateFns.map(fn => fn(refs, session));
    return Promise.all(promises).then(results => results.every(x => x));
  } else {
    return Promise.resolve(false);
  }
};


export class QueryValidator {
  constructor({queryWhitelist, unsafelyAllowAnyQuery}) {
    this.queryWhitelist = queryWhitelist;
    this.unsafelyAllowAnyQuery = unsafelyAllowAnyQuery;
  }

  // Return a promise that resolves to true or false if the specified RQ
  // matched or didn't match any pattern RQ in the whitelist.
  queryInWhitelist(rq, session) {
    const matchesPatternRQ = patternRQ => queryMatches(patternRQ, rq, session);
    const matchPromises = this.queryWhitelist.map(matchesPatternRQ);
    const matchArrayPromise = Promise.all(matchPromises);
    const hasAnyTrueValue = array => array.some(x => x);
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
  validateQuery(token, query, queryOptions, session, logFn) {
    return Promise.try(reqlJsonToAst, [query]).then(queryAst => {
      return Promise.try(parseQuery, [query, queryOptions]).then(rq => {
        return this.queryInWhitelist(rq, session).then(inWhitelist => {
          const allow = this.unsafelyAllowAnyQuery || inWhitelist;
          const allowText = allow ? colors.green('[ALLOW]') : colors.red('[DENY]');
          const logMsgParts = [allowText, ' ', queryAst.toString()];
          if (!inWhitelist) {
            logMsgParts.push('\n\n', colors.cyan(rqToString(rq, 1, 2)), ',\n');
          }
          logFn(logMsgParts.join(''), token);
          return Promise.resolve(allow);
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
  validateQueryCmd(token, queryCmdBuf, session, logFn) {
    return Promise.try(() => {
      const queryCmdJson = JSON.parse(queryCmdBuf);
      const [type, query, queryOptions] = queryCmdJson;
      if (type === START) {
        return this.validateQuery(token, query, queryOptions, session, logFn);
      } else if (type === CONTINUE || type === STOP || type === NOREPLY_WAIT) {
        if (query === undefined && queryOptions === undefined) {
          logFn(queryTypeString(type), token);
          return true;
        } else {
          throw new Error(`Invalid ${queryTypeString(type)}`);
        }
      } else {
        throw new Error(`Invalid queryType ${type}`);
      }
    });
  }
}
