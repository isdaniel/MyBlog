'use strict';

var siteUrl = 'https://isdaniel.github.io';

var redirects = [
  { from: 'modify-sourcecode/index.html', to: '/nosourcecode-modifycode/' },
  { from: 'categories/Turning/index.html', to: '/categories/Tuning/' },
  { from: 'tags/Turning/index.html', to: '/tags/Tuning/' }
];

hexo.extend.generator.register('seo-redirects', function () {
  return redirects.map(function (r) {
    return {
      path: r.from,
      data: '<!DOCTYPE html><html><head>' +
        '<meta charset="utf-8">' +
        '<meta http-equiv="refresh" content="0;url=' + r.to + '">' +
        '<link rel="canonical" href="' + siteUrl + r.to + '">' +
        '<title>Redirecting...</title>' +
        '</head><body><p>Redirecting to <a href="' + r.to + '">' + r.to + '</a></p></body></html>'
    };
  });
});
