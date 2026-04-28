{# ===================== Hreflang Tags ===================== #}
{% if page.lang == 'en' %}
  <link rel="alternate" hreflang="en" href="{{ config.url }}/{{ page.path }}">
{% else %}
  <link rel="alternate" hreflang="zh-Hant-TW" href="{{ config.url }}/{{ page.path }}">
{% endif %}
<link rel="alternate" hreflang="x-default" href="{{ config.url }}/{{ page.path }}">

{# ===================== Meta Robots ===================== #}
{% if page.robots %}
  <meta name="robots" content="{{ page.robots }}">
{% elif page.current and page.current > 1 %}
  <meta name="robots" content="noindex, follow">
{% endif %}

{# ===================== Preconnect Hints ===================== #}
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="dns-prefetch" href="https://cdn.jsdelivr.net">

{# ===================== Atom Feed Discovery ===================== #}
<link rel="alternate" type="application/atom+xml" title="{{ config.title }}" href="{{ config.url }}/atom.xml">
