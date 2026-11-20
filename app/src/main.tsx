// PC Pulse — kirish nuqtasi.
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/screens.css";
import { App } from "./App";
import { boot } from "./core/session";

createRoot(document.getElementById("root")!).render(<App />);
boot();
