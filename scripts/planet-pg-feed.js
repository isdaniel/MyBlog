'use strict';

/**
 * Planet PostgreSQL syndication feed.
 *
 * planet.postgresql.org requires that a multi-topic blog supply a feed containing
 * ONLY its PostgreSQL posts, in English, with a named author and no advertising.
 * See https://www.postgresql.org/about/policies/planet-postgresql/
 *
 * hexo-generator-feed (^4.0.0) has no filtering option of any kind — its documented
 * options are enable/type/path/limit/hub/content/content_limit/content_limit_delim/
 * order_by/icon/autodiscovery — so this cannot be done in _config.yml. Hence a
 * dedicated generator, following the same registration pattern as
 * scripts/llms-full-generator.js.
 *
 * Output: /planet-postgresql/atom.xml
 * Submit that URL at https://planet.postgresql.org/add.html after creating a
 * PostgreSQL community account at https://www.postgresql.org/account/signup/
 */

var FEED_PATH = 'planet-postgresql/atom.xml';
var MAX_ENTRIES = 20;
var PG_PATTERN = /postgres|pgrx|pg_|pglogical|wal/i;

hexo.extend.generator.register('planet-postgresql', function (locals) {
  var config = hexo.config;
  var siteUrl = (config.url || '').replace(/\/$/, '');
  var author = config.author || 'Daniel Shih';

  var posts = locals.posts
    .filter(function (post) {
      if (String(post.lang || '').toLowerCase() !== 'en') return false;
      if (post.robots && /noindex/i.test(post.robots)) return false;

      var taxonomy = []
        .concat((post.categories || []).map ? post.categories.map(function (c) { return c.name; }) : [])
        .concat((post.tags || []).map ? post.tags.map(function (t) { return t.name; }) : [])
        .join(' ');

      return PG_PATTERN.test(taxonomy) || PG_PATTERN.test(post.slug || '');
    })
    .sort('-date')
    .limit(MAX_ENTRIES);

  var entries = [];
  posts.forEach(function (post) {
    entries.push(post);
  });

  if (!entries.length) {
    hexo.log.warn('[planet-postgresql] no qualifying posts — feed not generated.');
    return [];
  }

  var updated = entries[0].updated || entries[0].date;

  var xml = '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<feed xmlns="http://www.w3.org/2005/Atom">\n' +
    '  <title>' + esc(config.title) + ' — PostgreSQL</title>\n' +
    '  <subtitle>PostgreSQL internals, Rust extensions and performance work by ' + esc(author) + '</subtitle>\n' +
    '  <link href="' + esc(siteUrl + '/' + FEED_PATH) + '" rel="self"/>\n' +
    '  <link href="' + esc(siteUrl) + '/"/>\n' +
    '  <updated>' + iso(updated) + '</updated>\n' +
    '  <id>' + esc(siteUrl) + '/planet-postgresql/</id>\n' +
    '  <author>\n' +
    '    <name>' + esc(author) + '</name>\n' +
    '    <uri>' + esc(siteUrl) + '/about/</uri>\n' +
    '  </author>\n';

  entries.forEach(function (post) {
    var url = siteUrl + '/' + post.slug + '/';
    var description = String(post.description || '').replace(/<[^>]*>/g, '').trim();

    xml += '  <entry>\n' +
      '    <title>' + esc(post.title) + '</title>\n' +
      '    <link href="' + esc(url) + '"/>\n' +
      '    <id>' + esc(url) + '</id>\n' +
      '    <published>' + iso(post.date) + '</published>\n' +
      '    <updated>' + iso(post.updated || post.date) + '</updated>\n' +
      '    <author><name>' + esc(author) + '</name></author>\n' +
      (description ? '    <summary>' + esc(description) + '</summary>\n' : '') +
      '    <content type="html">' + esc(prepareContent(post.content, siteUrl)) + '</content>\n' +
      '  </entry>\n';
  });

  xml += '</feed>\n';

  hexo.log.info('[planet-postgresql] ' + entries.length + ' entries -> /' + FEED_PATH);

  return { path: FEED_PATH, data: xml };
});

/**
 * Planet renders this HTML on its own domain, so relative URLs must be absolute.
 * Ad markup is stripped defensively — the policy forbids advertising in syndicated posts.
 */
function prepareContent(content, siteUrl) {
  return String(content || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<ins\b[^>]*adsbygoogle[\s\S]*?<\/ins>/gi, '')
    .replace(/<amp-auto-ads[\s\S]*?<\/amp-auto-ads>/gi, '')
    .replace(/(\s(?:src|href))=(["'])\/(?!\/)/gi, '$1=$2' + siteUrl + '/');
}

function iso(d) {
  if (!d) return new Date(0).toISOString();
  if (typeof d.toISOString === 'function') return d.toISOString();
  return new Date(d).toISOString();
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
