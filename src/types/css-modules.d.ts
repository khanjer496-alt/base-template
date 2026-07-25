/**
 * Metro resolves `*.module.css` imports to an object of generated class names on web.
 * TypeScript needs this ambient declaration to understand the import.
 */
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
