// Ambient declaration so TypeScript accepts `import cssText from './panel.css'` (esbuild inlines it).
declare module '*.css' {
  const content: string;
  export default content;
}
