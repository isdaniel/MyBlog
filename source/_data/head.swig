{# Default og:image fallback for posts without cover photos #}
{% if page.layout == 'post' and (not page.photos or not page.photos.length) %}
  <meta property="og:image" content="{{ config.url }}/images/favicon-32x32-next.png">
  <meta name="twitter:image" content="{{ config.url }}/images/favicon-32x32-next.png">
{% endif %}

{# Atom feed discovery #}
<link rel="alternate" type="application/atom+xml" title="{{ config.title }}" href="{{ config.url }}/atom.xml">
