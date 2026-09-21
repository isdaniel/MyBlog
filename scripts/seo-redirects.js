'use strict';

/**
 * Redirect shims for URLs that used to serve HTTP 200.
 *
 * GitHub Pages cannot issue server-side 301s, so each entry emits a tiny HTML file
 * carrying `<meta http-equiv="refresh">` + `<link rel="canonical">` + `noindex, follow`.
 * That is the strongest signal available on this host.
 *
 * IMPORTANT: a taxonomy entry only takes effect once the corresponding tag/category
 * has been removed from EVERY post's frontmatter — otherwise hexo-generator-tag /
 * hexo-generator-category regenerates the real page and silently overwrites the shim.
 */

// --------------------------------------------------------- historical post slugs
//
// Posts were bulk-lowercased in commit 3854696 ("to lowercase.", 2021-04-05).
// Every inbound link created before that date — including the "此篇同步發布在筆者Blog"
// backlink at the bottom of all 30 iThome 鐵人賽 articles — still points at the
// original CamelCase URL and has been landing on a 404 ever since.
//
// Derived from `git log --diff-filter=RC --name-status -- source/_posts` and
// verified against the live site. The ~74 underscore variants (ithelp_day1 …) are
// deliberately excluded: they existed for five days in March 2021 and never earned links.

var LOWERCASED_SLUGS = [
  'AOP-Lock-Mechanism', 'Autofac-AOP', 'Autofac-introduce', 'AwesomeProxy-Net',
  'Bridge-Pattern', 'CTE-RECURSIVE', 'DBIndex-1', 'DBIndex-2', 'DBLock-1',
  'Decorator-Pattern', 'Deploy-OwnNuget', 'Dynamic-pivot', 'GitHub-With-NugetDeploy',
  'HttpHandler-HttpModule', 'InvoiceTW-Framework', 'Join-Index-Improve',
  'JsonConvert-SerializeObject', 'Mediator-Pattern', 'NoSourceCode-ModifyCode',
  'Oracle-CONNECT-BY', 'RabbitMQ-Fanout', 'SQL-Gaps-and-Islands-problem',
  'SQLQueryStress-Intro', 'SQLServer-Merge-condition-problem', 'SQLServer-Statistics',
  'Template-Pattern'
];

// The 30-day iThome series — the highest-authority inbound links the blog has.
for (var d = 1; d <= 30; d++) {
  LOWERCASED_SLUGS.push('Ithelp-day' + d);
}

// Renames where lowercasing alone does not produce the current slug.
// Each mapping confirmed from the rename commit in git history.
var RENAMED_SLUGS = {
  'SQL-Server-Statistics': 'sqlserver-statistics',
  'floatvsdouble': 'float-double',
  'high-concurrency-atomic-CAS': 'high-concurrency-atomic-cas-algorithm',
  'kubernetes-': 'kubernetes-first',
  'redis-cluster-introduce1': 'redis-cluster-introduce-01',
  'modify-sourcecode': 'nosourcecode-modifycode',
  'ithelp_day7': 'ithelp-day7'
};

// ------------------------------------------------------------- taxonomy renames

var TAXONOMY_REDIRECTS = {
  'categories/Turning/index.html': '/categories/Tuning/',
  'tags/Turning/index.html': '/tags/Tuning/',
  'categories/sql-server/index.html': '/categories/SQL-Server/',
  'categories/postgresql/index.html': '/categories/PostgreSQL/',
  'categories/Postgresql/index.html': '/categories/PostgreSQL/',
  'categories/DataBase/index.html': '/categories/Database/',
  'categories/k8s/index.html': '/categories/Kubernetes/',
  'tags/sql-server/index.html': '/tags/SQL-Server/',
  'tags/Sql-server/index.html': '/tags/SQL-Server/',
  'tags/DataBase/index.html': '/tags/Database/',
  'tags/postgresql/index.html': '/tags/PostgreSQL/',
  'tags/Postgresql/index.html': '/tags/PostgreSQL/',
  'tags/k8s/index.html': '/tags/Kubernetes/',

  // Case variants normalised in the frontmatter so each topic has ONE hub page.
  'tags/C/index.html': '/tags/csharp/',
  'tags/lock/index.html': '/tags/Lock/',
  'tags/open-source/index.html': '/tags/Open-Source/',
  'tags/netcore/index.html': '/tags/NetCore/',
  'tags/performance/index.html': '/tags/Performance/',
  'tags/MSSql/index.html': '/tags/MSSQL/'
};

// ------------------------------------------------------------------- generator

hexo.extend.generator.register('seo-redirects', function () {
  var siteUrl = (hexo.config.url || '').replace(/\/$/, '');
  var map = {};

  LOWERCASED_SLUGS.forEach(function (slug) {
    map[slug + '/index.html'] = '/' + slug.toLowerCase() + '/';
  });

  Object.keys(RENAMED_SLUGS).forEach(function (slug) {
    map[slug + '/index.html'] = '/' + RENAMED_SLUGS[slug] + '/';
  });

  Object.keys(TAXONOMY_REDIRECTS).forEach(function (from) {
    map[from] = TAXONOMY_REDIRECTS[from];
  });

  return Object.keys(map).map(function (from) {
    var to = map[from];
    return {
      path: from,
      data: '<!DOCTYPE html><html lang="zh-Hant-TW"><head>' +
        '<meta charset="utf-8">' +
        '<meta name="robots" content="noindex, follow">' +
        '<meta http-equiv="refresh" content="0;url=' + to + '">' +
        '<link rel="canonical" href="' + siteUrl + to + '">' +
        '<title>Redirecting…</title>' +
        '</head><body><p>This page has moved to <a href="' + to + '">' + to + '</a>.</p></body></html>'
    };
  });
});
