'use strict';

hexo.extend.filter.register('after_render:html', function (str, data) {
  var page = data.page || data;
  var config = hexo.config;
  var siteUrl = config.url;

  var injection = '';

  // Keywords meta tag
  if (page.keywords) {
    injection += '<meta name="keywords" content="' + escapeHtml(page.keywords) + '">\n';
  } else if (page.tags && page.tags.length) {
    var tagNames = [];
    page.tags.forEach(function (tag) {
      tagNames.push(tag.name);
    });
    if (tagNames.length) {
      injection += '<meta name="keywords" content="' + escapeHtml(tagNames.join(',')) + '">\n';
    }
  } else if (config.keywords) {
    injection += '<meta name="keywords" content="' + escapeHtml(config.keywords) + '">\n';
  }

  // JSON-LD schemas using @graph
  var graphItems = [];

  var websiteSchema = {
    '@type': 'WebSite',
    'name': config.title,
    'url': siteUrl,
    'description': config.description,
    'inLanguage': config.language || 'zh-tw'
  };
  graphItems.push(websiteSchema);

  if (page.layout === 'post' || page.type === 'post') {
    var postUrl = siteUrl + '/' + (page.path || '');
    var description = page.description || '';
    if (typeof description === 'object' && description.toString) {
      description = description.toString();
    }
    description = description.replace(/<[^>]*>/g, '').substring(0, 200).trim();

    var keywords = [];
    if (page.keywords) {
      keywords = typeof page.keywords === 'string' ? page.keywords.split(',').map(function (k) { return k.trim(); }) : [];
    } else if (page.tags && page.tags.length) {
      page.tags.forEach(function (tag) {
        keywords.push(tag.name);
      });
    }

    var image = siteUrl + '/images/default-og-image.png';
    if (page.photos && page.photos.length) {
      image = page.photos[0];
      if (image.indexOf('http') !== 0) {
        image = siteUrl + '/' + image;
      }
    }

    // Word count
    var contentText = (page.content || '').replace(/<[^>]*>/g, '');
    var wordCount = contentText.replace(/\s+/g, ' ').trim().split(/\s+/).length;
    var cjkChars = contentText.match(/[一-鿿㐀-䶿]/g);
    if (cjkChars) {
      wordCount += cjkChars.length;
    }

    // Article section from first category
    var articleSection = '';
    if (page.categories && page.categories.length) {
      page.categories.forEach(function (cat) {
        if (!articleSection) {
          articleSection = cat.name;
        }
      });
    }

    var blogPostingSchema = {
      '@type': 'BlogPosting',
      'mainEntityOfPage': {
        '@type': 'WebPage',
        '@id': postUrl
      },
      'headline': page.title,
      'description': description,
      'datePublished': page.date ? page.date.toISOString() : '',
      'dateModified': page.updated ? page.updated.toISOString() : (page.date ? page.date.toISOString() : ''),
      'wordCount': wordCount,
      'author': {
        '@type': 'Person',
        'name': config.author,
        'url': siteUrl + '/about/',
        'sameAs': [
          'https://github.com/isdaniel',
          'https://stackoverflow.com/users/5176071/d-shih',
          'https://www.linkedin.com/in/bing-shiu-shih-a63151b5/',
          'https://www.facebook.com/profile.php?id=100001400319136'
        ]
      },
      'publisher': {
        '@type': 'Organization',
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
      'image': {
        '@type': 'ImageObject',
        'url': image
      },
      'url': postUrl,
      'inLanguage': page.lang || config.language || 'zh-tw'
    };

    if (articleSection) {
      blogPostingSchema.articleSection = articleSection;
    }

    if (keywords.length) {
      blogPostingSchema.keywords = keywords.join(',');
    }

    graphItems.push(blogPostingSchema);

    // BreadcrumbList
    var breadcrumbItems = [
      { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': siteUrl }
    ];

    if (page.categories && page.categories.length) {
      var pos = 2;
      page.categories.forEach(function (cat) {
        breadcrumbItems.push({
          '@type': 'ListItem',
          'position': pos,
          'name': cat.name,
          'item': siteUrl + '/' + cat.path
        });
        pos++;
      });
      breadcrumbItems.push({
        '@type': 'ListItem',
        'position': pos,
        'name': page.title,
        'item': postUrl
      });
    } else {
      breadcrumbItems.push({
        '@type': 'ListItem',
        'position': 2,
        'name': page.title,
        'item': postUrl
      });
    }

    graphItems.push({
      '@type': 'BreadcrumbList',
      'itemListElement': breadcrumbItems
    });
  }

  var graphObj = {
    '@context': 'https://schema.org',
    '@graph': graphItems
  };
  injection += '<script type="application/ld+json">' + JSON.stringify(graphObj) + '</script>\n';

  if (injection) {
    str = str.replace('</head>', injection + '</head>');
  }

  return str;
});

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
