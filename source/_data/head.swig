{# ===================== Meta Robots ===================== #}
{# Honours a per-post `robots:` key (used to keep the 30 iThome 鐵人賽 reprints out of
   the index without losing the link equity they pass on), and keeps paginated
   list pages out of the index. #}
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

{# NOTE: hreflang tags used to be emitted here, but every one of them pointed at the
   page's own URL — there are no translation pairs on this site (122 zh-tw posts and
   13 en posts, zero overlap). A self-referencing hreflang conveys no signal, so it
   was removed rather than left as SEO work that looks done but is not.
   Re-add it only when a post genuinely exists in two languages, mapping each to the
   other's URL. #}
