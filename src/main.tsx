import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installEnglishValidation } from "./validation";
import "./style.css";
installEnglishValidation();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
