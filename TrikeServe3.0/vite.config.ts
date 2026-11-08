import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // BrowserRouter serves deep links such as /rider/active-ride. Root-based
  // asset URLs keep the production entry bundle reachable after a page refresh
  // on those paths. Android builds override this to './' for Capacitor's WebView.
  base: '/',
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory.
      //
      // Deliberately the root-relative URL path, not an absolute filesystem
      // path. With `path.resolve(__dirname, './src')` on Windows, `@/lib/foo`
      // could resolve to a different module id than a relative import and be
      // served through `/@fs/C:/...`. For shared contexts, providers and hooks
      // should consistently import through this alias so they share one
      // context instance.
      '@': '/src',
    },
  },

  // react must resolve to a single copy, or hooks read from one React instance
  // while the tree renders with another.
  resolveDedupe: ['react', 'react-dom', 'react-router'],

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
