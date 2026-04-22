'use strict';

hexo.extend.filter.register('before_post_render', function (data) {
  if (!data.keywords && data.tags && data.tags.length) {
    var tagNames = [];
    data.tags.forEach(function(tag) {
      if (typeof tag === 'string') {
        tagNames.push(tag);
      } else if (tag.name) {
        tagNames.push(tag.name);
      }
    });
    if (tagNames.length) {
      data.keywords = tagNames.join(',');
    }
  }

  if (!data.lang) {
    data.lang = 'zh-tw';
  }

  if (data.description) {
    var desc = data.description.trim();
    var poorPatterns = /^前言[:：]?\s*$/;
    if (poorPatterns.test(desc) || desc.length < 10) {
      var extracted = extractDescription(data.raw || data.content || '');
      if (extracted) {
        data.description = extracted;
      }
    }
  }

  return data;
});

function extractDescription(content) {
  var text = content
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/^\s*[-*+]\s/gm, '')
    .replace(/\n{2,}/g, '\n');

  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.length > 20 && !/^前言/.test(line) && !/^<!--/.test(line) && !/^more$/.test(line)) {
      return line.substring(0, 200);
    }
  }
  return null;
}
