import {isArr, isObj, arrEq, objEq, ensure} from './util';
import Promise from 'bluebird';
import protodef from 'rethinkdb/proto-def';
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
  // Track refs from RP.ref() for use in validate()
  const refs = {};

  // Map reql function var ids from pattern to actual, since they are generated
  // non-deterministically. This prevents us from rejecting incoming queries
  // that only differ from pattern queries in the numerical values of their var
  // ids.
  const varIdMap = {};

  // Check if the specified protocol JSON term is well formed
  const isValidTerm = term => (
    term.length <= 3
    && typeof term[0] === 'number'
    && isArr(term[1])
    && term[2] === undefined || isObj(term[2])
  );

  const deepMatch = (pattern, actual) => {
    if (pattern instanceof Function) {
      return pattern(actual, refs, session);
    } else if (isArr(pattern)) {
      let [patternTermId, patternArgs, patternOpts] = pattern;
      let [actualTermId, actualArgs, actualOpts] = actual;
      const metadataMatches = isValidTerm(pattern)
                              && isValidTerm(actual)
                              && patternTermId === actualTermId
                              && deepMatch(patternOpts, actualOpts);
      if (!metadataMatches) {
        return false;
      }
      // Use varIdMap to compare var ids in FUNC and VAR terms
      if (patternTermId === protodef.Term.TermType.FUNC) {
        // The term looks like [FUNC, [[MAKE_ARRAY, [1, 2]], ...]]
        const isValidFuncArgs = x => (
          isValidTerm(x)
          && x[0] === protodef.Term.TermType.MAKE_ARRAY
          && x[1].filter(y => typeof y !== 'number').length === 0
          && Object.keys(x[2] || {}).length === 0
        );
        // Check that first arg looks like [MAKE_ARRAY, [1, 2]]
        if (!isValidFuncArgs(patternArgs[0]) || !isValidFuncArgs(actualArgs[0])) {
          return false;
        }
        const patternVarIds = patternArgs[0][1];
        const actualVarIds = actualArgs[0][1];
        if (patternVarIds.length !== actualVarIds.length) {
          return false;
        }
        patternVarIds.forEach((patternVarId, index) => {
          ensure(!(patternVarId in varIdMap), 'Repeated var id in pattern query');
          varIdMap[patternVarId] = actualVarIds[index];
        });
        patternArgs = patternArgs.slice(1);
        actualArgs = actualArgs.slice(1);
      } else if (patternTermId === protodef.Term.TermType.VAR) {
        // The term looks like [VAR, [1]]
        patternArgs = patternArgs.map(x => varIdMap[x]);
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
