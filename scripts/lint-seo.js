'use strict';

/**
 * Build-time SEO guards.
 *
 * Fails the build on regressions that previously shipped to production silently:
 *   1. AI draft artefacts leaking into published posts
 *      (e.g. "Here's a well-structured draft for your technical blog post ...")
 *   2. In-body internal links pointing at slugs that do not exist
 *      (the /DBIndex-1/ vs /dbindex-1/ class of bug — GitHub Pages is case-sensitive)
 *   3. The post title not rendering as an <h1>
 *      (NexT's `seo: true` demotes it to <h2>)
 *
 * Run automatically on `hexo generate`.
 */

var fs = require('fs');
var path = require('path');

// ---------------------------------------------------------------- 1. AI tells

var AI_TELLS = [
  /here.s a (?:well[- ]structured|comprehensive|detailed) (?:draft|outline|version)/i,
  /as an AI language model/i,
  /certainly[!,]\s+here(?:'|’)?s/i,
  /I hope this helps[!.]?\s*$/i,
  /^\s*(?:Sure|Certainly)[!,]\s+(?:here|I)/im,
  /\[(?:insert|add|your) [^\]]*here\]/i,
  /Let me know if you(?:'|’)?d like/i
];

function checkAiTells(postDir) {
  var problems = [];
  if (!fs.existsSync(postDir)) return problems;

  fs.readdirSync(postDir)
    .filter(function (f) { return /\.md$/.test(f); })
    .forEach(function (file) {
      var body = fs.readFileSync(path.join(postDir, file), 'utf8');
      AI_TELLS.forEach(function (re) {
        var m = body.match(re);
        if (m) {
          var line = body.substring(0, m.index).split('\n').length;
          problems.push('  ' + file + ':' + line + '  AI draft artefact: "' + m[0].trim().substring(0, 70) + '"');
        }
      });
    });

  return problems;
}

// ------------------------------------------------------- 2. Internal link lint

// Pages that exist outside source/_posts/.
var STATIC_PATHS = [
  '', 'about', 'archives', 'categories', 'tags', 'en', 'course', '404'
];

function checkInternalLinks(hexo, postDir) {
  var problems = [];
  if (!fs.existsSync(postDir)) return problems;

  var siteUrl = (hexo.config.url || '').replace(/\/$/, '');
  var known = Object.create(null);

  hexo.locals.get('posts').forEach(function (p) {
    if (p.slug) known[String(p.slug).toLowerCase()] = true;
  });
  STATIC_PATHS.forEach(function (p) { known[p] = true; });

  // Matches ](/slug/) and ](https://isdaniel.github.io/slug/)
  var linkRe = /\]\(\s*(?:SITEURL)?(\/[^)\s#?]*)/g;

  fs.readdirSync(postDir)
    .filter(function (f) { return /\.md$/.test(f); })
    .forEach(function (file) {
      var body = fs.readFileSync(path.join(postDir, file), 'utf8');
      var re = new RegExp(linkRe.source.replace('SITEURL', escapeRe(siteUrl)), 'g');
      var m;

      while ((m = re.exec(body)) !== null) {
        var target = m[1];

        // Skip assets — images, downloads, and anything with a file extension.
        if (/^\/(?:images|downloads|js|css|lib)\//.test(target)) continue;
        if (/\.(?:png|jpe?g|gif|svg|webp|pdf|zip|txt|xml|ico)$/i.test(target)) continue;

        var slug = target.replace(/^\//, '').replace(/\/$/, '').replace(/\.html$/, '');
        if (slug === '') continue;

        // Only lint the first path segment; deeper taxonomy paths are generated.
        var head = slug.split('/')[0].toLowerCase();
        if (known[slug.toLowerCase()] || known[head]) continue;

        var line = body.substring(0, m.index).split('\n').length;
        problems.push('  ' + file + ':' + line + '  dead internal link -> ' + target);
      }
    });

  return problems;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ------------------------------------------------------------ 3. h1 sanity

function checkPostH1(hexo) {
  if (hexo.theme.config && hexo.theme.config.seo === true) {
    return ['  themes/next/_config.yml: `seo: true` demotes every post title to <h2>. Set it to false.'];
  }
  return [];
}

// ------------------------------------------------- 4. case-insensitive FS warning

/**
 * CI builds on Ubuntu (appveyor.yml `image: Ubuntu2204`), where /Ithelp-day1/ and
 * /ithelp-day1/ are two distinct files. On Windows/macOS they are the SAME file, so
 * the case-only redirect stubs from scripts/seo-redirects.js silently overwrite the
 * real page in a local `public/`. Production is fine; the local build is the liar.
 * Warn so nobody debugs a phantom.
 */
function warnIfCaseInsensitive(hexo) {
  var probe = path.join(hexo.base_dir, 'package.json');
  var upper = path.join(hexo.base_dir, 'PACKAGE.JSON');

  try {
    if (fs.existsSync(probe) && fs.existsSync(upper)) {
      hexo.log.warn(
        'Case-insensitive filesystem detected. Case-only redirect stubs ' +
        '(e.g. /Ithelp-day1/, /tags/postgresql/) overwrite their real counterparts in ' +
        'public/ locally. This does NOT happen on the Ubuntu CI builder — verify those ' +
        'URLs against the deployed site, not against this local build.'
      );
    }
  } catch (e) { /* probing is best-effort */ }
}

// ---------------------------------------------------------------- registration

hexo.extend.filter.register('after_generate', function () {
  var postDir = path.join(hexo.source_dir, '_posts');

  var problems = []
    .concat(checkAiTells(postDir))
    .concat(checkInternalLinks(hexo, postDir))
    .concat(checkPostH1(hexo));

  if (problems.length) {
    var msg = '\nSEO lint failed (' + problems.length + ' problem' +
      (problems.length === 1 ? '' : 's') + '):\n' + problems.join('\n') + '\n';
    throw new Error(msg);
  }

  warnIfCaseInsensitive(hexo);
  hexo.log.info('SEO lint passed: no AI artefacts, no dead internal links, post titles are h1.');
});
