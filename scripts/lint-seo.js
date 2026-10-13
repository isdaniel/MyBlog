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
 *   4. robots.txt named groups that silently drop the `User-agent: *` Disallow rules
 *   5. sitemap.xml listing noindex pages, /index.html variants, tag/category pages,
 *      a Baidu sitemap, or missing the /en/ hub
 *   6. No menu item linking to the /en/ English hub
 *   7. llms.txt linking to URLs that are not generated
 *   8. Rendered pages with corrupted/missing JSON-LD, an og:image that is not https or contains
 *      a "/../" segment, or an empty body (render failures leave 0-byte files, exit code 0)
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

// ------------------------------------------- 5. robots.txt group inheritance

/**
 * RFC 9309: a crawler obeys only the single most specific group that matches it and
 * does NOT merge it with `User-agent: *`. A named group that lists only `Allow: /`
 * therefore silently drops every Disallow written under `*`.
 */
function checkRobotsGroups(hexo) {
  var file = path.join(hexo.source_dir, 'robots.txt');
  if (!fs.existsSync(file)) return [];

  var groups = [];
  var current = null;
  var prevWasAgent = false;

  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(function (raw) {
    var m = raw.replace(/#.*$/, '').trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) return;
    var key = m[1].toLowerCase();
    var value = m[2].trim();

    if (key === 'user-agent') {
      if (!current || !prevWasAgent) {
        current = { agents: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      prevWasAgent = true;
      return;
    }
    prevWasAgent = false;
    if (key === 'disallow' && value && current) current.disallow.push(value);
  });

  var star = groups.filter(function (g) { return g.agents.indexOf('*') !== -1; })[0];
  if (!star) return [];

  var problems = [];
  groups.forEach(function (g) {
    if (g === star) return;
    var missing = star.disallow.filter(function (rule) { return g.disallow.indexOf(rule) === -1; });
    if (missing.length) {
      problems.push('  source/robots.txt: group "' + g.agents.join(', ') + '" omits `Disallow: ' +
        missing.join(', ') + '` from `User-agent: *` (a crawler obeys only its most specific group)');
    }
  });
  return problems;
}

// ------------------------------------------------------- 6. sitemap hygiene

function normUrl(u) {
  try { u = decodeURI(u); } catch (e) { /* keep raw */ }
  return u.replace(/index\.html$/, '');
}

// `after_generate` runs before Hexo writes public/, so read generated files from the router.
function readRoute(hexo, routePath) {
  var stream = hexo.route.get(routePath);
  if (!stream) return Promise.resolve(null);

  return new Promise(function (resolve, reject) {
    var chunks = [];
    stream.on('data', function (c) { chunks.push(Buffer.from(c)); });
    stream.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    stream.on('error', reject);
  });
}

function checkSitemap(hexo, xml) {
  if (xml === null) return ['  sitemap.xml was not generated'];

  var siteUrl = (hexo.config.url || '').replace(/\/$/, '');
  var problems = [];

  var noindexed = Object.create(null);
  ['posts', 'pages'].forEach(function (name) {
    hexo.locals.get(name).forEach(function (p) {
      if (p.robots && /noindex/i.test(p.robots)) noindexed[normUrl(p.permalink)] = true;
    });
  });

  var locs = [];
  var re = /<loc>([^<]+)<\/loc>/g;
  var m;
  while ((m = re.exec(xml)) !== null) locs.push(m[1]);

  locs.forEach(function (loc) {
    var url = normUrl(loc);
    if (/index\.html$/.test(loc)) problems.push('  sitemap.xml lists an /index.html variant: ' + loc);
    if (noindexed[url]) problems.push('  sitemap.xml lists a noindex page: ' + loc);
    if (/\/(?:tags|categories)\/[^/]+/.test(url)) problems.push('  sitemap.xml lists a tag/category page: ' + loc);
  });

  if (!locs.some(function (l) { return normUrl(l) === siteUrl + '/en/'; })) {
    problems.push('  sitemap.xml does not list the /en/ hub');
  }
  if (hexo.route.list().indexOf('baidusitemap.xml') !== -1) {
    problems.push('  baidusitemap.xml is still generated (remove hexo-generator-baidu-sitemap)');
  }
  return problems;
}

// ----------------------------------------------- 7. /en/ is reachable from nav

function checkEnglishEntryPoint(hexo) {
  var hasEnglish = hexo.locals.get('posts').toArray().some(function (p) {
    return String(p.lang || '').toLowerCase() === 'en' && !(p.robots && /noindex/i.test(p.robots));
  });
  if (!hasEnglish) return [];

  var menu = (hexo.theme.config && hexo.theme.config.menu) || {};
  var linked = Object.keys(menu).some(function (k) {
    return /^\/en\/?\s*(?:\|\||$)/.test(String(menu[k]).trim());
  });
  return linked ? [] : ['  themes/next/_config.yml: no `menu:` item links to /en/ although English posts exist'];
}

// ------------------------------------------------- 8. llms.txt link integrity

function checkLlmsTxtLinks(hexo) {
  var file = path.join(hexo.source_dir, 'llms.txt');
  if (!fs.existsSync(file)) return [];

  var siteUrl = (hexo.config.url || '').replace(/\/$/, '');
  var routes = Object.create(null);
  hexo.route.list().forEach(function (r) { routes[r] = true; });

  var problems = [];
  var body = fs.readFileSync(file, 'utf8');
  var re = new RegExp(escapeRe(siteUrl) + '/([^\\s)>\\]]*)', 'g');
  var m;

  while ((m = re.exec(body)) !== null) {
    var rel = m[1];
    var ok = rel === ''
      ? routes['index.html']
      : (routes[rel] || routes[rel.replace(/\/?$/, '/') + 'index.html']);
    if (!ok) problems.push('  source/llms.txt links to a URL that is not generated: ' + m[0]);
  }
  return problems;
}

// -------------------------------------- 9. rendered pages: JSON-LD and og:image

/**
 * Pages render lazily when their route is read, and a render error only logs
 * "Render HTML failed" and leaves a 0-byte file while `hexo generate` exits 0. A throw
 * inside an `after_render:html` filter therefore cannot fail the build, so the output
 * checks live here, where a throw does.
 */
function checkRenderedPage(routePath, html, postTitle) {
  var where = '  ' + routePath + ': ';
  if (!html) return [where + 'rendered page is empty'];

  var problems = [];
  var og = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i);
  if (og && !/^https:\/\//i.test(og[1])) problems.push(where + 'og:image is not an https URL: ' + og[1]);
  if (og && /\/\.\.\//.test(og[1])) problems.push(where + 'og:image contains a "/../" segment: ' + og[1]);

  var ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  var isPost = postTitle !== undefined;
  if (!ld) {
    if (isPost) problems.push(where + 'JSON-LD block is missing');
    return problems;
  }

  try {
    var graph = JSON.parse(ld[1])['@graph'] || [];
    if (isPost) {
      var article = graph.filter(function (n) { return n['@type'] === 'BlogPosting'; })[0];
      if (!article || article.headline !== postTitle) {
        problems.push(where + 'BlogPosting headline does not match the post title (string-replace corruption?)');
      }
    }
  } catch (e) {
    problems.push(where + 'JSON-LD is not valid JSON: ' + e.message);
  }
  return problems;
}

function checkRenderedPages(hexo) {
  var titles = Object.create(null);
  hexo.locals.get('posts').forEach(function (p) { titles[hexo.route.format(p.path)] = p.title; });

  var problems = [];
  return hexo.route.list()
    .filter(function (r) { return /\.html$/.test(r); })
    .reduce(function (chain, routePath) {
      return chain.then(function () {
        return readRoute(hexo, routePath).then(function (html) {
          problems = problems.concat(checkRenderedPage(routePath, html, titles[routePath]));
        }, function (err) {
          problems.push('  ' + routePath + ': render failed: ' + (err && err.message));
        });
      });
    }, Promise.resolve())
    .then(function () { return problems; });
}

// ---------------------------------------------------------------- registration

hexo.extend.filter.register('after_generate', function () {
  var postDir = path.join(hexo.source_dir, '_posts');

  var problems = []
    .concat(checkAiTells(postDir))
    .concat(checkInternalLinks(hexo, postDir))
    .concat(checkPostH1(hexo))
    .concat(checkRobotsGroups(hexo))
    .concat(checkEnglishEntryPoint(hexo))
    .concat(checkLlmsTxtLinks(hexo));

  return readRoute(hexo, 'sitemap.xml').then(function (xml) {
    problems = problems.concat(checkSitemap(hexo, xml));
    return checkRenderedPages(hexo);
  }).then(function (pageProblems) {
    problems = problems.concat(pageProblems);

    if (problems.length) {
      var msg = '\nSEO lint failed (' + problems.length + ' problem' +
        (problems.length === 1 ? '' : 's') + '):\n' + problems.join('\n') + '\n';
      throw new Error(msg);
    }

    warnIfCaseInsensitive(hexo);
    hexo.log.info('SEO lint passed: no AI artefacts, no dead links, h1 titles, robots/sitemap/llms.txt consistent, JSON-LD and og:image sane.');
  });
});
