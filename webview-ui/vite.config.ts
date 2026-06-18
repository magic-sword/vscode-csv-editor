import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
    plugins: [react()],
    // Replace Node.js globals that React references but are undefined in a browser webview.
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
        outDir: resolve(__dirname, '../out/webview'),
        emptyOutDir: true,
        // IIFE: single self-contained bundle, no ES module import needed in the HTML
        lib: {
            entry: resolve(__dirname, 'src/main.tsx'),
            formats: ['iife'],
            name: 'CsvEditorApp',
        },
        rollupOptions: {
            output: {
                entryFileNames: 'main.js',
                assetFileNames: 'main.[ext]',
            },
        },
        cssCodeSplit: false,
        minify: false,
    },
});
