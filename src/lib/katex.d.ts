declare module 'katex' {
  const katex: {renderToString(tex: string, options?: {output?: 'html' | 'mathml' | 'htmlAndMathml'; displayMode?: boolean; throwOnError?: boolean}): string};
  export default katex;
}
