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
     * render function the way the React Compiler does. One of its rules fires
     * for a reason worth writing down rather than silencing quietly; see the
     * `react-hooks/refs` block below.
     *
     * `set-state-in-effect` was a warning through the Next 16 migration, with
     * eight instances and a note saying the alternative was worse. That was
     * true of the shape it was read as — a value the server cannot know, read
     * after mount so the first render matches the HTML that was sent — but it
     * was three different problems wearing one rule's name, and only the
     * hydration one had that defence. They are all gone now:
     *
     *   - A client-only value read once is `useSyncExternalStore` with a
     *     server snapshot, which is the API React provides for exactly this
     *     question and does not cost the extra render.
     *   - A preference that lives in `localStorage` is a store, not something
     *     to copy into state and re-seed on mount.
     *   - State reset when a prop changes is either an unmount or a line in
     *     the handler that caused the change.
     *
     * So it is an error: there is nothing left for it to catch that is not a
     * mistake.
     */
    rules: { "react-hooks/set-state-in-effect": "error" },
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
