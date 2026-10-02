import { RouterProvider } from 'react-router';
import { ThemeProvider } from 'next-themes';

import { router } from './routes.tsx';

export default function App() {
  return (
    // Default follows the device's light/dark setting; light and dark are the
    // explicit overrides. The choice is persisted per browser.
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="trikeserve_theme"
    >
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}