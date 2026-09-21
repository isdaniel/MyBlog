'use strict';

/**
 * Injects keywords, JSON-LD (@graph), and repairs the social/meta tags NexT emits.
 *
 * Repairs applied here rather than in the theme template so they are version-independent:
 *   - og:image      NexT falls back to one generic image for every post. 119 of 135 posts
 *                   shared it, so every share of an architecture-diagram post rendered the
 *                   same placeholder card. Now falls back to the post's first inline image.
 *   - twitter:card  was `summary` (small square) against a 1200x630 image. Now
 *                   `summary_large_image`.
 *   - og:url        was the `/index.html` variant while rel=canonical was the clean URL,
 *                   so Facebook/LINE/Slack accrued shares to a different URL than Google
 *                   indexed. Now matches canonical exactly.
 *   - og:locale /   were hardcoded to the site language even on the 13 fully-English
 *     <html lang>   posts. Now follow the post's own `lang` frontmatter.
 */

var LOCALE_MAP = {
  'en': 'en_US',
  'zh-tw': 'zh_TW',
  'zh-TW': 'zh_TW',
  'zh-hant-tw': 'zh_TW'
};

var HTML_LANG_MAP = {
  'en': 'en',
  'zh-tw': 'zh-Hant-TW',
  'zh-TW': 'zh-Hant-TW',
  'zh-hant-tw': 'zh-Hant-TW'
};

hexo.extend.filter.register('after_render:html', function (str, data) {
  var page = data.page || data;
  var config = hexo.config;
  var siteUrl = (config.url || '').replace(/\/$/, '');

  var isPost = page.layout === 'post' || page.type === 'post';
  var pageLang = String(page.lang || config.language || 'zh-tw');
  var langKey = pageLang.toLowerCase();

  // ------------------------------------------------------------- resolve image
  var image = resolveImage(page, siteUrl);

  // ------------------------------------------------- repair NexT's social tags
  str = setMetaProperty(str, 'og:image', image);
  str = setMetaProperty(str, 'og:image:url', image);
  str = setMetaName(str, 'twitter:image', image);
  str = setMetaName(str, 'twitter:card', 'summary_large_image');

  // og:url must equal rel=canonical. NexT emits the /index.html variant.
  str = str.replace(
    /(<meta\s+property="og:url"\s+content=")([^"]*)(")/i,
    function (m, pre, url, post) {
      return pre + url.replace(/index\.html$/, '') + post;
    }
  );

  if (LOCALE_MAP[langKey]) {
    str = setMetaProperty(str, 'og:locale', LOCALE_MAP[langKey]);
  }
  if (HTML_LANG_MAP[langKey]) {
    str = str.replace(/(<html[^>]*\slang=")([^"]*)(")/i, '$1' + HTML_LANG_MAP[langKey] + '$3');
  }

  // --------------------------------------------------------------- injections
  var injection = '';

  if (page.keywords) {
    injection += '<meta name="keywords" content="' + escapeHtml(page.keywords) + '">\n';
  } else if (page.tags && page.tags.length) {
    var tagNames = [];
    page.tags.forEach(function (tag) { tagNames.push(tag.name); });
    if (tagNames.length) {
      injection += '<meta name="keywords" content="' + escapeHtml(tagNames.join(',')) + '">\n';
    }
  } else if (config.keywords) {
    injection += '<meta name="keywords" content="' + escapeHtml(config.keywords) + '">\n';
  }

  var graphItems = [{
    '@type': 'WebSite',
    'name': config.title,
    'url': siteUrl,
    'description': config.description,
    'inLanguage': config.language || 'zh-tw'
  }];

  if (isPost) {
    var postUrl = siteUrl + '/' + (page.path || '').replace(/index\.html$/, '');

    var description = page.description || '';
    if (typeof description === 'object' && description.toString) {
      description = description.toString();
    }
    description = description.replace(/<[^>]*>/g, '').substring(0, 200).trim();

    var keywords = [];
    if (page.keywords) {
      keywords = typeof page.keywords === 'string'
        ? page.keywords.split(',').map(function (k) { return k.trim(); })
        : [];
    } else if (page.tags && page.tags.length) {
      page.tags.forEach(function (tag) { keywords.push(tag.name); });
    }

    var contentText = (page.content || '').replace(/<[^>]*>/g, '');
    var wordCount = contentText.replace(/\s+/g, ' ').trim().split(/\s+/).length;
    var cjkChars = contentText.match(/[一-鿿㐀-䶿]/g);
    if (cjkChars) wordCount += cjkChars.length;

    var articleSection = '';
    if (page.categories && page.categories.length) {
      page.categories.forEach(function (cat) {
        if (!articleSection) articleSection = cat.name;
      });
    }

    var authorId = siteUrl + '/about/#person';

    var blogPostingSchema = {
      '@type': 'BlogPosting',
      '@id': postUrl + '#article',
      'mainEntityOfPage': { '@type': 'WebPage', '@id': postUrl },
      'headline': page.title,
      'description': description,
      'datePublished': page.date ? page.date.toISOString() : '',
      'dateModified': page.updated ? page.updated.toISOString() : (page.date ? page.date.toISOString() : ''),
      'wordCount': wordCount,
      'author': { '@id': authorId },
      'publisher': {
        '@type': 'Organization',
        '@id': siteUrl + '/#organization',
        'name': config.title,
        'url': siteUrl + '/',
        'logo': {
          '@type': 'ImageObject',
          'url': siteUrl + '/images/apple-touch-icon-next.png'
        },
        'sameAs': [
          'https://github.com/isdaniel',
          'https://stackoverflow.com/users/5176071/d-shih'
        ]
      },
      'image': { '@type': 'ImageObject', 'url': image },
      'url': postUrl,
      'inLanguage': pageLang
    };

    if (articleSection) blogPostingSchema.articleSection = articleSection;
    if (keywords.length) blogPostingSchema.keywords = keywords.join(',');

    graphItems.push(blogPostingSchema);

    // A single Person node, referenced by @id from every article, instead of 135
    // disconnected author blobs. Gives AI/search a resolvable entity for "Daniel Shih".
    graphItems.push({
      '@type': 'Person',
      '@id': authorId,
      'name': config.author,
      'url': siteUrl + '/about/',
      'jobTitle': 'Software Engineer',
      'knowsAbout': ['PostgreSQL', 'Rust', 'C#', 'Database Internals', 'pgrx'],
      'sameAs': [
        'https://github.com/isdaniel',
        'https://stackoverflow.com/users/5176071/d-shih',
        'https://www.linkedin.com/in/bing-shiu-shih-a63151b5/',
        'https://crates.io/users/isdaniel'
      ]
    });

    var breadcrumbItems = [
      { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': siteUrl }
    ];

    if (page.categories && page.categories.length) {
      var pos = 2;
      page.categories.forEach(function (cat) {
        breadcrumbItems.push({
          '@type': 'ListItem', 'position': pos, 'name': cat.name, 'item': siteUrl + '/' + cat.path
        });
        pos++;
      });
      breadcrumbItems.push({ '@type': 'ListItem', 'position': pos, 'name': page.title, 'item': postUrl });
    } else {
      breadcrumbItems.push({ '@type': 'ListItem', 'position': 2, 'name': page.title, 'item': postUrl });
    }

    graphItems.push({ '@type': 'BreadcrumbList', 'itemListElement': breadcrumbItems });
  }

  injection += '<script type="application/ld+json">' +
    JSON.stringify({ '@context': 'https://schema.org', '@graph': graphItems }) +
    '</script>\n';

  return str.replace('</head>', injection + '</head>');
});

// ------------------------------------------------------------------- helpers

// Images that are page furniture, not article content — never use them as the share card.
var NON_CONTENT_IMAGE = /default-og-image|donation-qr|stackoverflow\.com\/users\/flair|credly|flagcounter|badge|shields\.io/i;

function resolveImage(page, siteUrl) {
  if (page.photos && page.photos.length) {
    return absolutise(page.photos[0], siteUrl);
  }

  // Fall back to the post's own first inline image before the site-wide default,
  // so each post gets a distinct share card instead of 119 identical ones.
  var re = /<img[^>]+src=["']([^"']+)["']/gi;
  var m;
  while ((m = re.exec(String(page.content || ''))) !== null) {
    if (m[1] && !NON_CONTENT_IMAGE.test(m[1])) {
      return absolutise(m[1], siteUrl);
    }
  }

  return siteUrl + '/images/default-og-image.png';
}

function absolutise(url, siteUrl) {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.indexOf('//') === 0) return 'https:' + url;
  return siteUrl + (url.charAt(0) === '/' ? '' : '/') + url;
}

function setMetaProperty(str, prop, value) {
  var re = new RegExp('(<meta\\s+property="' + prop + '"\\s+content=")([^"]*)(")', 'i');
  if (re.test(str)) return str.replace(re, '$1' + escapeHtml(value) + '$3');
  return str;
}

function setMetaName(str, name, value) {
  var re = new RegExp('(<meta\\s+name="' + name + '"\\s+content=")([^"]*)(")', 'i');
  if (re.test(str)) return str.replace(re, '$1' + escapeHtml(value) + '$3');
  return str.replace('</head>', '<meta name="' + name + '" content="' + escapeHtml(value) + '">\n</head>');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
