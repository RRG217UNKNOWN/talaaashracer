import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import tsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

// Standalone TanStack Start config — independent of any third-party wrapper.
// Deployed as a Cloudflare Worker, so the Nitro/server preset targets that
// runtime directly (matches the existing src/server.ts fetch() entry point).
export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    // Keep a single copy of these in the dep graph — several UI/3D packages
    // (radix, react-three-fiber, tanstack router) otherwise pull their own
    // copies of React and break hooks across package boundaries.
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    tanstackStart({
      target: "cloudflare-module",
      server: { entry: "server" },
    }),
    viteReact(),
  ],
});
