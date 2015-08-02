/*eslint-env mocha */

import assert from 'assert';
import {
  isArr,
  isObj,
  arrEq,
  ensure,
  repeatString,
} from '../src/util';

describe('util', () => {

  describe('isArr', () => {
    const arrays = [[], [1, 2, 3]];
    const nonArrays = [true, false, 0, '', undefined, null, {}, () => {}];
    it('returns true for arrays', () => {
      assert(arrays.every(isArr));
    });
    it('returns false for non-arrays', () => {
      assert(!nonArrays.some(isArr));
    });
  });

  describe('isObj', () => {
    const objects = [{}, {a: 1}];
    const nonObjects = [true, false, 0, '', undefined, null, [], () => {}];
    it('returns true for objects', () => {
      assert(objects.every(isObj));
    });
    it('returns false for non-objects', () => {
      assert(!nonObjects.some(isObj));
    });
  });

  describe('arrEq', () => {
    const strictEqual = (x, y) => x === y;
    const strictUnequal = (x, y) => x !== y;
    const equalArrays = [
      [[], [], strictEqual],
      [[], [], strictUnequal],
      [[1, 2, 3], [1, 2, 3], strictEqual],
      [[1, 2, 3], [4, 5, 6], strictUnequal],
    ];
    const unequalArrays = [
      [[], [1, 2, 3], strictEqual],
      [[1, 2, 3], [1, 2, 3], strictUnequal],
      [[1, 2, 3], [4, 5, 6], strictEqual],
    ];
    it('returns true for equal arrays', () => {
      assert(equalArrays.every(([a1, a2, elemEq]) => arrEq(a1, a2, elemEq)));
      assert(equalArrays.every(([a1, a2, elemEq]) => arrEq(a2, a1, elemEq)));
    });
    it('returns false for unequal arrays', () => {
      assert(!unequalArrays.some(([a1, a2, elemEq]) => arrEq(a1, a2, elemEq)));
      assert(!unequalArrays.some(([a1, a2, elemEq]) => arrEq(a2, a1, elemEq)));
    });
  });

  describe('objEq', () => {
    it.skip('works');
  });

  describe('ensure', () => {
    const truthyValues = [true, 1, 'a', [], {}];
    const falsyValues = [false, 0, '', undefined, null];
    it('does nothing for truthy values', () => {
      truthyValues.forEach(x => ensure(x, 'blah'));
    });
    it('throws errors for falsy values', () => {
      falsyValues.forEach(x => {
        assert.throws(() => ensure(x, 'blah'), /blah/);
      });
    });
  });

  describe('repeatString', () => {
    it('works', () => {
      assert.strictEqual(repeatString('abc', 3), 'abcabcabc');
      assert.strictEqual(repeatString('abc', 0), '');
    });
  });

  describe('errToString', () => {
    it.skip('works');
  });

});
