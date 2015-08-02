import protodef from 'rethinkdb/proto-def';
import {isArr, isObj, ensure, repeatString} from './util';

// Map RethinkDB AST term ids to readable names. Add a special "query" term
// with id="query" and name="query".

const QUERY_TERM_ID = 'query';
const termIdToName = {};
termIdToName[QUERY_TERM_ID] = QUERY_TERM_ID;
Object.keys(protodef.Term.TermType).forEach(termName => {
  const termId = protodef.Term.TermType[termName];
  termIdToName[termId] = termName;
});


// RQ represents a parsed RethinkDB query or term. It can either be parsed from
// an incoming query over the JSON protocol via parseQuery(), or it can be
// manually constructed in a whitelist on the server as a "pattern query" to
// validate incoming queries.
//
// To manually create an RQ object, call RQ.<termname>(<args>). To set query
// options, call the .opt(key, value) method, which sets the option and returns
// the modified RQ object. RQ(...) is shorthand for RQ.query(...).
//
// For example, r.table('turtles').count() becomes:
// RQ(
//   RQ.COUNT(
//     RQ.TABLE("turtles")
//   )
// ).opt("db", RQ.DB("test"))
//
// When manually creating pattern queries, you will want to make use of pattern
// functions, RQ.ref(), and validate() functions. See QueryValidator.js for
// more information.

const RQ = (...args) => RQ[QUERY_TERM_ID](...args);
Object.keys(termIdToName).forEach(termId => {
  const termName = termIdToName[termId];
  RQ[termName] = (...args) => {
    const options = [];
    const result = [termId, args, options];
    result.isRethinkQueryTerm = true;
    result.validateFns = [];
    result.opt = (key, value) => {
      options.push([key, value]);
      return result;
    };
    result.validate = fn => {
      result.validateFns.push(fn);
      return result;
    };
    return result;
  };
});

RQ.ref = refName => (value, refs, session) => {
  refs[refName] = value;
  return true;
};


// Take an RQ object and return a nicely formatted string. Intended for actual
// queries, not pattern queries.
const rqToString = (query, initialIndentLevel = 0, spacesPerIndent = 0) => {
  const oneLineCharCutoff = 40;
  const termToString = (data, curLevel) => {
    const result = [];
    const nextLevel = curLevel + 1;
    const curIndentSpace = repeatString(' ', curLevel * spacesPerIndent);
    const nextIndentSpace = repeatString(' ', nextLevel * spacesPerIndent);
    const newline = spacesPerIndent > 0 ? '\n' : '';

    const pushSequence = (prefix, suffix, elems) => {
      result.push(prefix);
      const oneLine = elems.join(', ');
      if (oneLine.length <= oneLineCharCutoff && oneLine.indexOf('\n') < 0) {
        result.push(oneLine);
      } else {
        elems.forEach((elem, index) => {
          result.push(newline, nextIndentSpace, elem);
          if (index === elems.length - 1) {
            result.push(newline, curIndentSpace);
          } else {
            result.push(',');
          }
        });
      }
      result.push(suffix);
    };

    if (isArr(data) && data.isRethinkQueryTerm) {
      const [termId, args, options] = data;
      result.push('RQ');
      if (termId !== QUERY_TERM_ID) {
        result.push('.', termIdToName[termId]);
      }
      const argElems = args.map(x => termToString(x, nextLevel));
      pushSequence('(', ')', argElems);
      options.forEach(([key, value]) => {
        const optElems = [JSON.stringify(key), termToString(value, nextLevel)];
        pushSequence('.opt(', ')', optElems);
      });

    } else if (isArr(data)) {
      const elems = data.map(x => termToString(x, nextLevel));
      pushSequence('[', ']', elems);

    } else if (isObj(data)) {
      const elems = Object.keys(data).map(key => (
        JSON.stringify(key) + ': ' + termToString(data[key], nextLevel)
      ));
      pushSequence('{', '}', elems);

    } else {
      result.push(JSON.stringify(data));

    }
    return result.join('');
  };

  return (
    repeatString(' ', initialIndentLevel * spacesPerIndent)
    +
    termToString(query, initialIndentLevel, spacesPerIndent)
  );
};


// Parse a query and return an RQ object. The arguments query and queryOptions
// should come directly from the JSON format they were sent over the RethinkDB
// JSON wire protocol. May throw an exception if the query is ill formed.
const parseQuery = (query, queryOptions) => {
  const parseTerm = data => {
    if (isArr(data)) {
      const [termId, args, options] = data;
      ensure(data.length <= 3, 'Too many array elements');
      ensure(isArr(args), 'Invalid args type');
      ensure(options === undefined || isObj(options), 'Invalid options type');
      const termName = termIdToName[termId];
      let result = RQ[termName](...args.map(parseTerm));
      Object.keys(options || {}).forEach(key => {
        result = result.opt(key, parseTerm(options[key]));
      });
      return result;
    } else if (isObj(data)) {
      const result = {};
      Object.keys(data).forEach(key => {
        result[key] = parseTerm(data[key]);
      });
      return result;
    } else {
      return data;
    }
  };

  return parseTerm(['query', [query], queryOptions]);
};


export {
  RQ,
  rqToString,
  parseQuery,
};
