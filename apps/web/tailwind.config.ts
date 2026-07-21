import type { Config } from "tailwindcss";
import preset from "@nv/tailwind-preset/preset";

const config: Config = {
  presets: [preset],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/domain/src/**/*.{ts,tsx}",
  ],
};

export default config;
