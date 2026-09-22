import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * ESLint's flat config, which is the only kind ESLint 9 reads.
 *
 * `next lint` is gone in Next 16, so this runs as `eslint .` — and `.` means
 * everything, including build output that was never ours to lint. The old
 * `.eslintrc.json` never had to say so, because `next lint` only ever looked
 * at the source directories.
 */
export default defineConfig([
  globalIgnores([".next/**", "out/**", "coverage/**", "playwright-report/**", "test-results/**"]),

  { extends: [...nextCoreWebVitals] },

  {
    /**
     * `react-hooks` 6 — which arrived with eslint-config-next 16 — reads a
     * render function the way the React Compiler does. Two of its rules fire
     * across this codebase for reasons worth writing down rather than
     * silencing quietly.
     *
     * `set-state-in-effect` catches `useState` + a `useEffect` that sets it
     * straight away. Every one here is the same deliberate shape: a value the
     * server cannot know — `document.body`, a `localStorage` preference, the
     * hostname the page was opened on — read after mount so that the first
     * render matches the HTML the server sent. Reading it during render is
     * precisely the hydration mismatch this avoids. The rule is right that it
     * costs a second render; it is a warning here because the alternative it
     * is steering toward is worse for this app, and a warning keeps the list
     * visible.
     */
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },

  {
    /**
     * `react-hooks/refs` says a ref may not be read during render. dnd-kit's
     * `useSortable()` and `useDraggable()` return an object carrying
     * `setNodeRef` alongside plain values — `transform`, `transition`,
     * `isDragging` — and the rule treats a read of any of them as a ref
     * access. Passing `setNodeRef` to `ref=` and reading `transform` while
     * rendering is the documented way to use the library, so the rule is
     * wrong here specifically, and stays on everywhere else. It caught a real
     * one in FormattingToolbar on the way in.
     */
    files: [
      "src/components/blocks/Sortable.tsx",
      "src/components/editor/BlockPalette.tsx",
    ],
    rules: { "react-hooks/refs": "off" },
  },
]);
