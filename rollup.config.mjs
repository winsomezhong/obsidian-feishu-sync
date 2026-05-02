import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/main.ts',
  output: {
    dir: '.',
    format: 'cjs',
    sourcemap: 'inline',
    exports: 'default',
  },
  external: ['obsidian'],
  plugins: [
    typescript({ tsconfig: './tsconfig.json' }),
    nodeResolve({ browser: true }),
    commonjs(),
  ],
};
