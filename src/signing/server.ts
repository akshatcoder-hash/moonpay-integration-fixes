import { createSigningApp } from "./backend.js";

createSigningApp().listen(3001, "127.0.0.1", () => {
  console.log("Reference signing backend: http://127.0.0.1:3001 (fake test key only)");
});
