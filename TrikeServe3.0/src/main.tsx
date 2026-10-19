
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import { clearAllUserScopedCaches } from "./app/contexts/AuthContext";
  import "./styles/index.css";

  clearAllUserScopedCaches();
  createRoot(document.getElementById("root")!).render(<App />);
