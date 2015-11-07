import {isArr, isObj, arrEq, objEq, ensure} from './util';
import Promise from 'bluebird';
import reqlTermExamples from './ReqlTermExamples';

const DatumTerm = reqlTermExamples.DATUM.constructor;
const RDBVal = DatumTerm.__super__.constructor;
const TermBase = RDBVal.__super__.constructor;

// Monkey-patch rethinkdb driver AST terms with a validate method. The validate
// method takes a validation function as its only argument and appends it to
// the list of validate functions stored with this AST term. The validate
// method returns the updated AST term so that it can be chained with other
// calls. See astQueryMatches() below for more information.
TermBase.prototype.validate = function(validateFn) {
  this.validateFns = this.validateFns || [];
  this.validateFns.push(validateFn);
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
class ReqlPatternTerm extends DatumTerm {
  constructor(fn) {
    super();
    ensure(fn instanceof Function, 'RP.check() requires a function argument');
    this.fn = fn;
  }

  build() {
    return this.fn;
  }

  compose() {
    return this.fn.toString();
  }
}


// ReqlPattern (exported to clients as RP) provides methods to construct
// whitelist queries that offer more sophisticated pattern matching than just
// exact match.
const ReqlPattern = {

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
  check(fn) {
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
  ref(refName) {
    return new ReqlPatternTerm((value, refs, session) => {
      refs[refName] = value;
      return true;
    });
  },

};


// Return whether or not the specified object is a rethinkdb driver AST term.
const isReqlAstTerm = obj => obj instanceof TermBase;


// Compare the pattern query to the actual query to see if they match, and
// return a promise that resolves to true (false) if they matched (didn't
// match). Both queries should be in rethinkdb AST term form.
//
// If the actual query matches the pattern query data, then all of validate functions
// set on the pattern query will be called as validateFn(refs, session). Resolve
// to true if they all return true (or promises that resolve to true) or there
// are no validate functions. Resolve to false if the query data doesn't match or
// any validate function doesn't return true.
const astQueryMatches = (patternQuery, actualQuery, session) => {
  const refs = {};
  const deepMatch = (pattern, actual) => {
    if (pattern instanceof Function) {
      return pattern(actual, refs, session);
    } else if (isArr(pattern)) {
      const isValidTerm = x => x.length <= 3 && isArr(x[1]);
      const [patternTermId, patternArgs, patternOpts] = pattern;
      const [actualTermId, actualArgs, actualOpts] = actual;
      const metadataMatches = isValidTerm(pattern)
                              && isValidTerm(actual)
                              && patternTermId === actualTermId
                              && deepMatch(patternOpts, actualOpts);
      if (!metadataMatches) {
        return false;
      }
      return arrEq(patternArgs, actualArgs, deepMatch);
    } else if (isObj(pattern)) {
      return isObj(actual) && objEq(pattern, actual, deepMatch);
    }
    return pattern === actual;
  };
  if (deepMatch(patternQuery.build(), actualQuery.build())) {
    const validateFns = patternQuery.validateFns || [];
    const promises = validateFns.map(fn => fn(refs, session));
    return Promise.all(promises).then(results => results.every(x => x));
  } else {
    return Promise.resolve(false);
  }
};


export {
  ReqlPattern,
  isReqlAstTerm,
  astQueryMatches,
};
