'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
var isArr = Array.isArray;

exports.isArr = isArr;
var isObj = function isObj(x) {
  return !!x && typeof x === 'object' && !isArr(x);
};

exports.isObj = isObj;
var arrEq = function arrEq(a1, a2, elemEq) {
  return a1.length === a2.length && a1.every(function (x, i) {
    return elemEq(x, a2[i]);
  });
};

exports.arrEq = arrEq;
var strEq = function strEq(s1, s2) {
  return s1 === s2;
};

var objEq = function objEq(o1, o2, valueEq) {
  // It is safe to consider two objects in a reql query to be identical even if
  // their keys are ordered differently in JSON.
  // https://groups.google.com/forum/#!msg/rethinkdb/-3VjyzyfW9o/hmR3ZFCRBwAJ
  var keys1 = Object.keys(o1);
  var keys2 = Object.keys(o2);
  keys1.sort();
  keys2.sort();
  var sameKeys = arrEq(keys1, keys2, strEq);
  return sameKeys && keys1.every(function (k) {
    return valueEq(o1[k], o2[k]);
  });
};

exports.objEq = objEq;
var ensure = function ensure(value, msg) {
  if (!value) {
    throw new Error(msg);
  }
};

exports.ensure = ensure;
var repeatString = function repeatString(s, n) {
  return new Array(n + 1).join(s);
};

exports.repeatString = repeatString;
var errToString = function errToString(e) {
  return e.stack || e.message || JSON.stringify(e);
};
exports.errToString = errToString;