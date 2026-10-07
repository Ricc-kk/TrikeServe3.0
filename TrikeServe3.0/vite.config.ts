import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
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
      // resolved to `C:\...\src\lib\foo` while the same file reached by a
      // relative import resolved to `C:/...\src/lib/foo`. Vite treated those as
      // two different module ids and served the first as `/@fs/C:/...`, so the
      // app ended up with two copies of AuthContext -- and `useAuth` then
      // reported "must be used within an AuthProvider" because the context the
      // provider created was not the one the hook read. "/src" resolves to the
      // same id as a relative import, so one file is one module.
      '@': '/src',
    },
  },

  // react must resolve to a single copy, or hooks read from one React instance
  // while the tree renders with another.
  resolveDedupe: ['react', 'react-dom', 'react-router'],

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
