import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import "./index.css";
import "./App.css";

import WebsiteLayout from "./components/WebsiteLayout.jsx";
import App from "./App.jsx";
import FireAlarms from "./pages/FireAlarms.jsx";
import FireExtinguishers from "./pages/FireExtinguishers.jsx";
import EmergencyLighting from "./pages/EmergencyLighting.jsx";
import NotFound from "./pages/NotFound.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<WebsiteLayout />}>
          <Route path="/" element={<App />} />
          <Route path="/products/fire-alarms" element={<FireAlarms />} />
          <Route
            path="/products/fire-extinguishers"
            element={<FireExtinguishers />}
          />
          <Route
            path="/products/emergency-lighting"
            element={<EmergencyLighting />}
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);