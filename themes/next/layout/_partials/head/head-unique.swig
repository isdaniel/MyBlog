{% if page.photos and page.photos.length %}
{{ open_graph({image: page.photos[0]}) }}
{% else %}
{{ open_graph({image: config.url + '/images/default-og-image.png'}) }}
{% endif %}

{{ canonical() }}

{# Exports some front-matter variables to Front-End #}
<script id="page-configurations">
  // https://hexo.io/docs/variables.html
  CONFIG.page = {
    sidebar: {{ page.sidebar | json }},
    isHome : {{ is_home() }},
    isPost : {{ is_post() }}
  };
</script>
