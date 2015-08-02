export const isArr = Array.isArray;

export const isObj = x => !!x && typeof x === 'object' && !isArr(x);

export const arrEq = (a1, a2, elemEq) => (
  a1.length === a2.length && a1.every((x, i) => elemEq(x, a2[i]))
);

const strEq = (s1, s2) => s1 === s2;

export const objEq = (o1, o2, valueEq) => {
  // TODO This returns false if the objects have different key orderings. While
  // that's technically incorrect, it may be necessary if RethinkDB's behavior
  // depends on object key ordering. This requires further investigation.
  const keys1 = Object.keys(o1);
  const keys2 = Object.keys(o2);
  const sameKeys = arrEq(keys1, keys2, strEq);
  return sameKeys && keys1.every(k => valueEq(o1[k], o2[k]));
};

export const ensure = (value, msg) => {
  if (!value) {
    throw new Error(msg);
  }
};

export const repeatString = (s, n) => new Array(n + 1).join(s);

export const errToString = e => e.stack || e.message || JSON.stringify(e);
