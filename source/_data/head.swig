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

{# ===================== Atom Feed Discovery ===================== #}
<link rel="alternate" type="application/atom+xml" title="{{ config.title }}" href="{{ config.url }}/atom.xml">
