import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/vendor', { recursive: true });
for (const file of ['index.html', 'app.js', 'menu.json', 'receipt-editor.html', 'receipt-editor.js', 'receipt-logo.png', 'till.js','print-settings.js','cancel-security.js']) await cp(file, `dist/${file}`);
await cp('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'dist/vendor/supabase.js');
await build({ entryPoints: ['native-print.js'], bundle: true, format: 'iife', target: 'safari15', outfile: 'dist/native-print.js' });
