import { createRoot } from "react-dom/client";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { API_BASE } from "./lib/api";
import { getToken } from "./lib/auth";
import App from "./App";
import "./index.css";

setBaseUrl(API_BASE);
setAuthTokenGetter(getToken);

createRoot(document.getElementById("root")!).render(<App />);
