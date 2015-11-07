import Promise from 'bluebird';
import reqlTermExamples from './ReqlTermExamples';

const DatumTerm = reqlTermExamples.DATUM.constructor;
const RDBVal = DatumTerm.__super__.constructor;
const TermBase = RDBVal.__super__.constructor;

// Monkey-patch rethinkdb driver AST terms with a validate method. The validate
// method takes a validation function as its only argument and appends it to
// the list of validate functions stored with this AST term. The validate
// method returns the updated AST term so that it can be chained with other
// calls. See QueryValidator.js for more information.
TermBase.prototype.validate = function(validateFn) {
  this.validateFns = this.validateFns || [];
  this.validateFns.push(validateFn);
  return this;
};


// Return whether or not the specified object is a rethinkdb driver AST term.
const isReqlAstTerm = obj => obj instanceof TermBase;


// Compare the pattern query to the actual query to see if they match, and
// return a promise that resolves to true (false) if they matched (didn't
// match). Both queries should be in rethinkdb AST term form.
//
// Right now, this only supports exact query patterns, but it will soon be
// updated to support pattern functions and refs.
const astQueryMatches = (patternQuery, actualQuery, session) => {
  const refs = {};
  const deepMatch = (pattern, actual) => {
    return JSON.stringify(pattern.build()) === JSON.stringify(actual.build());
  };
  if (deepMatch(patternQuery, actualQuery)) {
    const validateFns = patternQuery.validateFns || [];
    const promises = validateFns.map(fn => fn(refs, session));
    return Promise.all(promises).then(results => results.every(x => x));
  } else {
    return Promise.resolve(false);
  }
};

export {
  isReqlAstTerm,
  astQueryMatches,
};
