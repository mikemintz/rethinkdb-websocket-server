import protodef from 'rethinkdb/proto-def';
import reqlTermExamples from './ReqlTermExamples';
import {isArr, isObj, ensure} from './util';

// Map RethinkDB AST term ids to their canonical names. This is simply and
// inverse mapping of protodef.Term.TermType.
const termIdToName = {};
Object.keys(protodef.Term.TermType).forEach(termName => {
  const termId = protodef.Term.TermType[termName];
  termIdToName[termId] = termName;
});


// Construct and return a rethinkdb driver AST term. The supplied termId is the
// numerical term id from the wire protocol. Args is the array of arguments
// that the term takes, and options is the optional options object that the
// term takes. Both args and options should be passed in as AST objects, not
// JSON wire protocol objects.
//
// E.g., buildAstTerm(15, ['abc']) returns the same thing as r.table('abc')
const buildAstTerm = (termId, args, options) => {
  const termName = termIdToName[termId];
  const termClass = reqlTermExamples[termName].constructor;
  const termSuperClass = termClass.__super__.constructor;
  if (termSuperClass.name === 'RDBOp') {
    const term = Object.create(termClass.prototype);
    return termSuperClass.call(term, options, ...args);
  } else if (termSuperClass.name === 'RDBConstant') {
    return new termClass(options, ...args);
  } else {
    throw new Error('Unexpected term type: ' + termSuperClass.name);
  }
};


// Parse a reql JSON term and return an AST object. The term parameter should
// come directly from the JSON format it was sent over the RethinkDB JSON wire
// protocol. May throw an exception if the term is ill formed.
const reqlJsonToAst = term => {
  if (isArr(term)) {
    const [termId, args, options] = term;
    ensure(term.length <= 3, 'Too many array elements');
    ensure(isArr(args), 'Invalid args type');
    ensure(options === undefined || isObj(options), 'Invalid options type');
    return buildAstTerm(termId, args.map(reqlJsonToAst), reqlJsonToAst(options));
  } else if (isObj(term)) {
    const result = {};
    Object.keys(term).forEach(key => {
      result[key] = reqlJsonToAst(term[key]);
    });
    return result;
  } else {
    return term;
  }
};


export {
  reqlJsonToAst,
};
