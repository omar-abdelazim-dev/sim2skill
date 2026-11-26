// Minimal router: exact segments and :params. Options per route: maxBody (bytes), raw (skip JSON parsing).
export const STATUS = Symbol('status');
export const withStatus = (status, body) => ({ [STATUS]: status, body });

export function createRouter() {
  const routes = [];
  const add = method => (pattern, handler, opts = {}) => {
    routes.push({ method, parts: pattern.split('/').filter(Boolean), handler, opts });
  };
  return {
    get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE'),
    match(method, segments) {
      const m = method === 'HEAD' ? 'GET' : method;
      for (const route of routes) {
        if (route.method !== m || route.parts.length !== segments.length) continue;
        const params = {};
        let ok = true;
        for (let i = 0; i < route.parts.length && ok; i++) {
          const part = route.parts[i];
          if (part.startsWith(':')) {
            const v = decodeURIComponent(segments[i]);
            if (!/^[A-Za-z0-9_-]{1,80}$/.test(v)) ok = false; else params[part.slice(1)] = v;
          } else ok = part === segments[i];
        }
        if (ok) return { route, params };
      }
      return null;
    }
  };
}
