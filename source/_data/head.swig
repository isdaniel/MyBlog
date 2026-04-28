{# ===================== Hreflang Tags ===================== #}
{% if page.lang == 'en' %}
  <link rel="alternate" hreflang="en" href="{{ config.url }}/{{ page.path }}">
  <link rel="alternate" hreflang="x-default" href="{{ config.url }}/{{ page.path }}">
{% elif page.lang == 'zh-tw' %}
  <link rel="alternate" hreflang="zh-Hant-TW" href="{{ config.url }}/{{ page.path }}">
  <link rel="alternate" hreflang="x-default" href="{{ config.url }}/{{ page.path }}">
{% elif page.layout == 'post' %}
  <link rel="alternate" hreflang="zh-Hant-TW" href="{{ config.url }}/{{ page.path }}">
  <link rel="alternate" hreflang="x-default" href="{{ config.url }}/{{ page.path }}">
{% else %}
  <link rel="alternate" hreflang="zh-Hant-TW" href="{{ config.url }}/{{ page.path }}">
  <link rel="alternate" hreflang="x-default" href="{{ config.url }}/{{ page.path }}">
{% endif %}

{# ===================== Default OG Image Fallback ===================== #}
{% if page.layout == 'post' and (not page.photos or not page.photos.length) %}
  <meta property="og:image" content="{{ config.url }}/images/default-og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:image" content="{{ config.url }}/images/default-og-image.png">
{% endif %}

{# ===================== Atom Feed Discovery ===================== #}
<link rel="alternate" type="application/atom+xml" title="{{ config.title }}" href="{{ config.url }}/atom.xml">

{# ===================== JSON-LD: BlogPosting ===================== #}
{% if page.layout == 'post' %}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "{{ config.url }}/{{ page.path }}"
  },
  "headline": {{ page.title | dump | safe }},
  "description": {{ (page.description or page.excerpt or config.description) | dump | safe }},
  {% if page.photos and page.photos.length %}
  "image": "{{ page.photos[0] }}",
  {% else %}
  "image": "{{ config.url }}/images/default-og-image.png",
  {% endif %}
  "author": {
    "@type": "Person",
    "name": "{{ config.author }}",
    "url": "{{ config.url }}/about.html"
  },
  "publisher": {
    "@type": "Organization",
    "name": "{{ config.title }}",
    "logo": {
      "@type": "ImageObject",
      "url": "{{ config.url }}/images/favicon-32x32-next.png"
    }
  },
  "datePublished": "{{ page.date.toISOString() }}",
  "dateModified": "{{ (page.updated or page.date).toISOString() }}",
  {% if page.keywords %}
  "keywords": {{ page.keywords | dump | safe }},
  {% elif page.tags and page.tags.length %}
  "keywords": [{% for tag in page.tags.toArray() %}{{ tag.name | dump | safe }}{% if not loop.last %}, {% endif %}{% endfor %}],
  {% endif %}
  "inLanguage": "{{ page.lang or config.language }}"
}
</script>
{% endif %}

{# ===================== JSON-LD: WebSite with SearchAction ===================== #}
{% if not page.layout or page.layout == 'index' %}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": {{ config.title | dump | safe }},
  "url": "{{ config.url }}/",
  "description": {{ config.description | dump | safe }},
  "inLanguage": "{{ config.language }}",
  "author": {
    "@type": "Person",
    "name": "{{ config.author }}"
  },
  "potentialAction": {
    "@type": "SearchAction",
    "target": "{{ config.url }}/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
</script>
{% endif %}

{# ===================== JSON-LD: BreadcrumbList ===================== #}
{% if page.layout == 'post' %}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "{{ config.url }}/"
    },
    {% if page.categories and page.categories.length %}
    {
      "@type": "ListItem",
      "position": 2,
      "name": {{ page.categories.toArray()[0].name | dump | safe }},
      "item": "{{ config.url }}/categories/{{ page.categories.toArray()[0].name | urlencode }}/"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": {{ page.title | dump | safe }},
      "item": "{{ config.url }}/{{ page.path }}"
    }
    {% else %}
    {
      "@type": "ListItem",
      "position": 2,
      "name": {{ page.title | dump | safe }},
      "item": "{{ config.url }}/{{ page.path }}"
    }
    {% endif %}
  ]
}
</script>
{% endif %}
