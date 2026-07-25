/**
 * Metro understands CSS imports; Jest does not. Global stylesheets become a no-op
 * and `*.module.css` imports echo back the class name that was asked for.
 */
module.exports = new Proxy(
  {},
  {
    get: (_target, key) => (typeof key === 'string' ? key : undefined),
  }
);
