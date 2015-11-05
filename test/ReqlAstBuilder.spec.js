/*eslint-env mocha */

import assert from 'assert';
import r from 'rethinkdb';
import {reqlJsonToAst} from '../src/ReqlAstBuilder';

/*eslint-disable */
const queries = [
  // Other queries
  r.table('turtles').insert(r.expr({a: [1, 2, false, "", [3], {b: 9}, null]})),
  r.now().dayOfWeek().eq(r.monday),

  // Queries pulled from http://rethinkdb.com/api/javascript/
  r.dbCreate('superheroes'),
  r.dbDrop('superheroes'),
  r.dbList(),
  r.db('heroes').tableCreate('dc_universe'),
  r.db('test').tableDrop('dc_universe'),
  r.db('test').tableList(),
  r.table('comments').indexCreate('postId'),
  r.table('dc').indexDrop('code_name'),
  r.table('marvel').indexList(),
  r.table('comments').indexRename('postId', 'messageId'),
  r.table('test').indexStatus(),
  r.table('test').indexStatus('timestamp'),
  r.table('test').indexWait(),
  r.table('test').indexWait('timestamp'),
  r.table('games').changes(),
  r.table("posts").insert({
    id: 1,
    title: "Lorem ipsum",
    content: "Dolor sit amet"
  }),
  r.table("posts").get(1).update({status: "published"}),
  r.table("posts").get(1).replace({
    id: 1,
    title: "Lorem ipsum",
    content: "Aleas jacta est",
    status: "draft"
  }),
  r.table("comments").get("7eab9e63-73f1-4f33-8ce4-95cbea626f59").delete(),
  r.table('marvel').sync(),
  r.db('heroes').table('marvel'),
  r.table('marvel'),
  r.table('posts').get('a9849eef-7176-4411-935b-79a6e3c56a74'),
  r.table('marvel').getAll('man_of_steel', {index:'code_name'}),
  r.table('marvel').between(10, 20),
  r.table('users').filter({age: 30}),
  r.table('marvel').innerJoin(r.table('dc'), function(marvelRow, dcRow) {
    return marvelRow('strength').lt(dcRow('strength'))
  }).zip(),
  r.table('marvel').outerJoin(r.table('dc'), function(marvelRow, dcRow) {
    return marvelRow('strength').lt(dcRow('strength'))
  }),
  r.table('players').eqJoin('gameId', r.table('games')),
  r.table('marvel').eqJoin('main_dc_collaborator', r.table('dc')).zip(),
  r.expr([1, 2, 3, 4, 5]).map(function (val) {
    return val.mul(val);
  }),
  r.table('users').withFields('id', 'username', 'posts'),
  r.table('marvel').concatMap(function(hero) {
    return hero('defeatedMonsters')
  }),
  r.table('posts').orderBy({index: 'date'}),
  r.table('posts').indexCreate('date'),
  r.table('posts').orderBy({index: r.desc('date')}),
  r.table('marvel').orderBy('successMetric').skip(10),
  r.table('marvel').orderBy('belovedness').limit(10),
  r.table('players').orderBy({index: 'age'}).slice(3,6),
  r.expr([1,2,3]).nth(1),
  r.expr(['a','b','c']).offsetsOf('c'),
  r.table('marvel').isEmpty(),
  r.table('marvel').union(r.table('dc')),
  r.table('marvel').sample(3),
  r.table('games').group('player').max('points'),
  r.table('games')
  .group('player').max('points')('points')
  .ungroup().orderBy(r.desc('reduction')),
  r.table("posts").map(function(doc) {
    return 1
  }).reduce(function(left, right) {
    return left.add(right)
  }),
  r.table('marvel').count().add(r.table('dc').count()),
  r.expr([3, 5, 7]).sum(),
  r.expr([3, 5, 7]).avg(),
  r.expr([3, 5, 7]).min(),
  r.expr([3, 5, 7]).max(),
  r.table('marvel').concatMap(function(hero) {
    return hero('villainList')
  }).distinct(),
  r.table('marvel').get('ironman')('opponents').contains('superman'),
  r.table('users').filter(r.row('age').gt(5)),
  r.table('marvel').get('IronMan').pluck('reactorState', 'reactorPower'),
  r.table('marvel').get('IronMan').without('personalVictoriesList'),
  r.table('marvel').get('thor').merge(
    r.table('equipment').get('hammer'),
    r.table('equipment').get('pimento_sandwich')
  ),
  r.table('marvel').get('IronMan')('equipment').append('newBoots'),
  r.table('marvel').get('IronMan')('equipment').prepend('newBoots'),
  r.table('marvel').get('IronMan')('equipment').difference(['Boots']),
  r.table('marvel').get('IronMan')('equipment').setInsert('newBoots'),
  r.table('marvel').get('IronMan')('equipment').setUnion(['newBoots', 'arc_reactor']),
  r.table('marvel').get('IronMan')('equipment').setIntersection(['newBoots', 'arc_reactor']),
  r.table('marvel').get('IronMan')('equipment').setDifference(['newBoots', 'arc_reactor']),
  r.table('marvel').get('IronMan')('firstAppearance'),
  r.table('marvel').get('IronMan').getField('firstAppearance'),
  r.table('players').hasFields('games_won'),
  r.expr(["Iron Man", "Spider-Man"]).insertAt(1, "Hulk"),
  r.expr(["Iron Man", "Spider-Man"]).spliceAt(1, ["Hulk", "Thor"]),
  r(['a','b','c','d','e','f']).deleteAt(1),
  r.expr(["Iron Man", "Bruce", "Spider-Man"]).changeAt(1, "Hulk"),
  r.table('marvel').get('ironman').keys(),
  r.table('users').get(1).update({ data: r.literal({ age: 19, job: 'Engineer' }) }),
  r.object('id', 5, 'data', ['foo', 'bar']),
  r.table('users').filter(function(doc){
    return doc('name').match("^A")
  }),
  r.expr("foo  bar bax").split(),
  r.expr("Sentence about LaTeX.").upcase(),
  r.expr("Sentence about LaTeX.").downcase(),
  r.expr(2).add(2),
  r.expr(2).sub(2),
  r.expr(2).mul(2),
  r.expr(2).div(2),
  r.expr(2).mod(2),
  r.expr(true).or(false).and(true),
  r.table('users').get(1)('role').eq('administrator'),
  r.table('users').get(1)('role').ne('administrator'),
  r.table('players').get(1)('score').gt(10),
  r.table('players').get(1)('score').ge(10),
  r.table('players').get(1)('score').lt(10),
  r.table('players').get(1)('score').le(10),
  r(true).not(),
  r.not(true),
  r.random(),
  r.round(12.345),
  r.ceil(12.345),
  r.floor(12.345),
  r.table("users").insert({
    name: "John",
    subscription_date: r.now()
  }),
  r.table("user").get("John").update({birthdate: r.time(1986, 11, 3, 'Z')}),
  r.table("user").get("John").update({birthdate: r.epochTime(531360000)}),
  r.table("user").get("John").update({birth: r.ISO8601('1986-11-03T08:30:00-07:00')}),
  r.now().inTimezone('-08:00').hours(),
  r.table("users").filter( function(user) {
    return user("subscriptionDate").timezone().eq("-07:00")
  }),
  r.table("posts").filter(
    r.row('date').during(r.time(2013, 12, 1), r.time(2013, 12, 10))
  ),
  r.table("users").filter(function(user) {
    return user("birthdate").date().eq(r.now().date())
  }),
  r.table("posts").filter(
    r.row("date").timeOfDay().le(12*60*60)
  ),
  r.table("users").filter(function(user) {
    return user("birthdate").year().eq(1986)
  }),
  r.table("users").filter(
    r.row("birthdate").month().eq(11)
  ),
  r.table("users").filter(
    r.row("birthdate").day().eq(24)
  ),
  r.now().dayOfWeek(),
  r.table("users").filter(
    r.row("birthdate").dayOfYear().eq(1)
  ),
  r.table("posts").filter(function(post) {
    return post("date").hours().lt(4)
  }),
  r.table("posts").filter(function(post) {
    return post("date").minutes().lt(10)
  }),
  r.table("posts").filter(function(post) {
    return post("date").seconds().lt(30)
  }),
  r.now().toISO8601(),
  r.now().toEpochTime(),
  r.table('people').getAll('Alice', 'Bob'),
  r.table('people').getAll(r.args(['Alice', 'Bob'])),
  r.table('users').get(100).update({
    avatar: new Buffer("abc")
  }),
  r.table('players').get('f19b5f16-ef14-468f-bd48-e194761df255').do(
    function (player) {
      return player('gross_score').sub(player('course_handicap'));
    }
  ),
  r.table('marvel').map(
    r.branch(
      r.row('victories').gt(100),
      r.row('name').add(' is a superhero'),
      r.row('name').add(' is a hero')
    )
  ),
  r.table('marvel').forEach(function(hero) {
    return r.table('villains').get(hero('villainDefeated')).delete()
  }),
  r.range(4),
  r.table('marvel').get('IronMan').do(function(ironman) {
    return r.branch(ironman('victories').lt(ironman('battles')),
                    r.error('impossible code path'),
                    ironman)
  }),
  r.table("posts").map(function (post) {
    return {
      title: post("title"),
      author: post("author").default("Anonymous")
    }
  }),
  r.expr({a:'b'}).merge({b:[1,2,3]}),
  r.js("'str1' + 'str2'"),
  r.table('posts').map(function (post) {
    return post.merge({ comments: r.table('comments').getAll(post('id'), {index: 'postId'}).coerceTo('array')});
  }),
  r.expr("foo").typeOf(),
  r.table('marvel').info(),
  r.json("[1,2,3]"),
  r.table('hero').get(1).toJSON(),
  r.table('posts').insert(r.http('http://httpbin.org/get')),
  r.uuid(),
  r.table('geo').insert({
    id: 300,
    name: 'Hayes Valley',
    neighborhood: r.circle([-122.423246,37.779388], 1000)
  }),
  r.distance(r.point(-122.423246,37.779388), r.point(-117.220406,32.719464), {unit: 'km'}),
  r.table('geo').insert({
    id: 201,
    rectangle: r.line(
      [-122.423246,37.779388],
      [-122.423246,37.329898],
      [-121.886420,37.329898],
      [-121.886420,37.779388]
    )
  }),
  r.table('geo').get(201).update({
    rectangle: r.row('rectangle').fill()
  }, {nonAtomic: true}),
  r.table('geo').insert({
    id: 'sfo',
    name: 'San Francisco',
    location: r.geojson({'type': 'Point', 'coordinates': [ -122.423246, 37.779388 ]})
  }),
  r.table('geo').get('sfo')('location').toGeojson(),
  r.table('parks').getIntersecting(r.circle([-117.220406,32.719464], 10, {unit: 'mi'}), {index: 'area'}),
  r.table('hideouts').getNearest(r.point(-122.422876,37.777128), {index: 'location', maxDist: 5000}),
  r.circle(r.point(-117.220406,32.719464), 2000).includes(r.point(-117.206201,32.725186)),
  r.circle(r.point(-117.220406,32.719464), 2000).intersects(r.point(-117.206201,32.725186)),
  r.table('geo').insert({
    id: 101,
    route: r.line([-122.423246,37.779388], [-121.886420,37.329898])
  }),
  r.table('geo').insert({
    id: 1,
    name: 'San Francisco',
    location: r.point(-122.423246,37.779388)
  }),
  r.table('geo').insert({
    id: 101,
    rectangle: r.polygon(
      [-122.423246,37.779388],
      [-122.423246,37.329898],
      [-121.886420,37.329898],
      [-121.886420,37.779388]
    )
  }),
  r.polygon(
    [-122.4,37.7],
    [-122.4,37.3],
    [-121.8,37.3],
    [-121.8,37.7]
  ).polygonSub(r.polygon(
    [-122.3,37.4],
    [-122.3,37.6],
    [-122.0,37.6],
    [-122.0,37.4]
  )),
  r.table('users').config(),
  r.table('superheroes').rebalance(),
  r.table('superheroes').reconfigure({shards: 2, replicas: 1}),
  r.table('superheroes').status(),
  r.table('superheroes').wait(),
];
/*eslint-enable */


describe('ReqlAstBuilder', () => {
  it('returns queries that encode to the original input', () => {
    queries.forEach(query => {
      const oldJson = query.build();
      const newAst = reqlJsonToAst(oldJson);
      const newJson = newAst.build();
      assert.strictEqual(JSON.stringify(newJson), JSON.stringify(oldJson));
    });
  });
});
