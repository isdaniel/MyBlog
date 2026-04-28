'use strict';

var redirects = [
  { from: 'modify-sourcecode/index.html', to: '/nosourcecode-modifycode/' },
  { from: 'categories/Turning/index.html', to: '/categories/Tuning/' },
  { from: 'tags/Turning/index.html', to: '/tags/Tuning/' },
  { from: 'categories/sql-server/index.html', to: '/categories/SQL-Server/' },
  { from: 'categories/postgresql/index.html', to: '/categories/PostgreSQL/' },
  { from: 'categories/Postgresql/index.html', to: '/categories/PostgreSQL/' },
  { from: 'categories/DataBase/index.html', to: '/categories/Database/' },
  { from: 'categories/k8s/index.html', to: '/categories/Kubernetes/' },
  { from: 'tags/sql-server/index.html', to: '/tags/SQL-Server/' },
  { from: 'tags/Sql-server/index.html', to: '/tags/SQL-Server/' },
  { from: 'tags/DataBase/index.html', to: '/tags/Database/' },
  { from: 'tags/postgresql/index.html', to: '/tags/PostgreSQL/' },
  { from: 'tags/Postgresql/index.html', to: '/tags/PostgreSQL/' },
  { from: 'tags/k8s/index.html', to: '/tags/Kubernetes/' }
];

hexo.extend.generator.register('seo-redirects', function () {
  var siteUrl = hexo.config.url;
  return redirects.map(function (r) {
    return {
      path: r.from,
      data: '<!DOCTYPE html><html><head>' +
        '<meta charset="utf-8">' +
        '<meta name="robots" content="noindex, follow">' +
        '<meta http-equiv="refresh" content="0;url=' + r.to + '">' +
        '<link rel="canonical" href="' + siteUrl + r.to + '">' +
        '<title>Redirecting...</title>' +
        '</head><body><p>Redirecting to <a href="' + r.to + '">' + r.to + '</a></p></body></html>'
    };
  });
});
