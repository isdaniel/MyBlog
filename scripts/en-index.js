'use strict';

/**
 * /en/ — English content hub.
 *
 * The blog has 13 fully-English posts (CJK ratio 0.0000), 9 of them PostgreSQL/Rust,
 * but no English entry point existed: no index, no English category or tag landing
 * page. They were reachable only from paginated zh-tw archive pages.
 *
 * Generated rather than hand-written so it cannot go stale — add `lang: en` to a post
 * and it appears here on the next build.
 */

hexo.extend.generator.register('en-index', function (locals) {
  var config = hexo.config;
  var siteUrl = (config.url || '').replace(/\/$/, '');

  var posts = locals.posts
    .filter(function (post) {
      return String(post.lang || '').toLowerCase() === 'en' &&
        !(post.robots && /noindex/i.test(post.robots));
    })
    .sort('-date');

  var items = [];
  posts.forEach(function (post) { items.push(post); });

  if (!items.length) return [];

  // Group by theme so the hub gives descriptive anchor text per cluster rather than
  // one flat list — this is the internal-linking fix as much as the discovery fix.
  var groups = [
    {
      title: 'PostgreSQL Extensions in Rust (pgrx)',
      blurb: 'Building and debugging PostgreSQL extensions with Rust and the pgrx framework.',
      match: /pgrx|fdw|where-guard/i
    },
    {
      title: 'PostgreSQL Replication, WAL and CDC',
      blurb: 'Streaming the write-ahead log, logical replication and change data capture.',
      match: /wal|walstream|pg2any|migrator|logical/i
    },
    {
      title: 'PostgreSQL Monitoring and Performance',
      blurb: 'Per-backend monitoring, tuning and source-level debugging.',
      match: /pidstat|pgtuner|vscode|backup|monitor|performance/i
    },
    {
      title: 'Systems and Infrastructure',
      blurb: 'Container runtimes, observability and networking internals.',
      match: /.*/
    }
  ];

  var used = Object.create(null);
  var html = '<p>Long-form English write-ups, mostly on PostgreSQL internals and the ' +
    'Rust tooling built around them. Each post accompanies an open-source project — ' +
    'source links are in the posts.</p>\n';

  groups.forEach(function (group) {
    var matched = items.filter(function (post) {
      if (used[post.slug]) return false;
      var haystack = post.slug + ' ' + post.title;
      if (!group.match.test(haystack)) return false;
      used[post.slug] = true;
      return true;
    });

    if (!matched.length) return;

    html += '<h2>' + esc(group.title) + '</h2>\n';
    html += '<p>' + esc(group.blurb) + '</p>\n<ul>\n';

    matched.forEach(function (post) {
      var desc = stripTags(post.description).trim();
      html += '  <li><a href="' + esc(siteUrl + '/' + post.slug + '/') + '">' +
        esc(post.title) + '</a>' +
        ' <small>(' + (post.date ? post.date.format('YYYY-MM-DD') : '') + ')</small>' +
        (desc ? '<br>' + esc(desc) : '') +
        '</li>\n';
    });

    html += '</ul>\n';
  });

  html += '<h2>Feeds</h2>\n<ul>\n' +
    '  <li><a href="' + esc(siteUrl) + '/planet-postgresql/atom.xml">PostgreSQL-only Atom feed</a> — English PostgreSQL posts only.</li>\n' +
    '  <li><a href="' + esc(siteUrl) + '/atom.xml">Full site Atom feed</a> — all posts, mostly Traditional Chinese.</li>\n' +
    '</ul>\n';

  hexo.log.info('[en-index] ' + items.length + ' English posts -> /en/');

  return {
    path: 'en/index.html',
    layout: ['page', 'post', 'index'],
    data: {
      title: 'English Articles',
      description: 'English write-ups on PostgreSQL internals, Rust pgrx extensions, WAL streaming and database performance by Daniel Shih.',
      keywords: 'PostgreSQL,Rust,pgrx,WAL,logical-replication,CDC,database-internals',
      lang: 'en',
      comments: false,
      content: html,
      __page: true
    }
  };
});

/** Strips tags repeatedly so that removing one tag cannot reveal another. */
function stripTags(s) {
  var previous;
  var output = String(s == null ? '' : s);
  do {
    previous = output;
    output = output.replace(/<[^<>]*>/g, '');
  } while (output !== previous);
  return output;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
