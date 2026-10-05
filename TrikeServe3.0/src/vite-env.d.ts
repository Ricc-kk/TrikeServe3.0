/// <reference types="vite/client" />

// Gives the compiler the ambient types a Vite app relies on: `import.meta.env`
// for configuration, and module declarations for the asset imports the UI uses
// (`.png`, `.jpg`, `.svg`). Without this, importing a logo from `src/assets`
// type-errors even though the bundler handles it correctly.
