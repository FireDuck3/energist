// Хеш-маршрутизація: '#/spot/3' → routes['/spot/:id']({ id: '3' }, root).
export function currentPath() {
  return location.hash.replace(/^#/, '') || '/';
}

export function startRouter(routes, root, { onChange } = {}) {
  const table = Object.entries(routes).map(([pattern, view]) => ({
    re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`),
    view,
  }));
  let cleanup = null;

  function handle() {
    const path = currentPath();
    const hit = table.map((r) => ({ view: r.view, m: path.match(r.re) })).find((x) => x.m);
    if (!hit) {
      location.replace('#/map');
      return;
    }
    if (typeof cleanup === 'function') cleanup();
    root.replaceChildren();
    window.scrollTo(0, 0);
    cleanup = hit.view(hit.m.groups ?? {}, root);
    onChange?.(path);
  }

  window.addEventListener('hashchange', handle);
  handle();
}
