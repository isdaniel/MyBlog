'use strict';

hexo.extend.generator.register('llms-full', function (locals) {
  var posts = locals.posts.sort('-date');
  var lines = [];

  lines.push('# 石頭的coding之路 - Full Content Index');
  lines.push('');
  lines.push('> This file is auto-generated for LLM crawlers. It contains a structured index of all blog posts.');
  lines.push('> Last generated: ' + new Date().toISOString());
  lines.push('');
  lines.push('## Posts (' + posts.length + ' total)');
  lines.push('');

  posts.forEach(function (post) {
    var tags = [];
    if (post.tags && post.tags.length) {
      post.tags.forEach(function (tag) {
        tags.push(tag.name);
      });
    }

    var categories = [];
    if (post.categories && post.categories.length) {
      post.categories.forEach(function (cat) {
        categories.push(cat.name);
      });
    }

    var description = (post.description || '').trim();
    if (typeof description === 'object' && description.toString) {
      description = description.toString();
    }
    description = description.replace(/<[^>]*>/g, '').replace(/\n/g, ' ').substring(0, 500).trim();

    var excerpt = '';
    if (post.content) {
      excerpt = post.content
        .replace(/<[^>]*>/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\n{2,}/g, '\n')
        .trim()
        .substring(0, 500)
        .trim();
    }

    lines.push('### ' + post.title);
    lines.push('');
    lines.push('- URL: https://isdaniel.github.io/' + post.slug + '/');
    lines.push('- Date: ' + (post.date ? post.date.format('YYYY-MM-DD') : 'N/A'));

    if (post.updated && post.date && post.updated.format('YYYY-MM-DD') !== post.date.format('YYYY-MM-DD')) {
      lines.push('- Updated: ' + post.updated.format('YYYY-MM-DD'));
    }

    lines.push('- Language: ' + (post.lang || 'zh-tw'));

    if (tags.length) {
      lines.push('- Tags: ' + tags.join(', '));
    }
    if (categories.length) {
      lines.push('- Categories: ' + categories.join(', '));
    }
    if (description) {
      lines.push('- Description: ' + description);
    }
    if (excerpt) {
      lines.push('- Excerpt: ' + excerpt.replace(/\n/g, ' '));
    }

    lines.push('');
  });

  return {
    path: 'llms-full.txt',
    data: lines.join('\n')
  };
});
