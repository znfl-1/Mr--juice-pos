import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/vendor', { recursive: true });
await cp('web', 'dist', { recursive: true });
await cp('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'dist/vendor/supabase.js');

const { build } = await import('esbuild');
await build({ entryPoints: ['web/native-print.js'], bundle: true, format: 'iife', target: 'safari15', outfile: 'dist/native-print.js' });
