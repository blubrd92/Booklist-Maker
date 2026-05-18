import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["assets/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        Image: "readonly",
        HTMLElement: "readonly",
        HTMLCanvasElement: "readonly",
        MutationObserver: "readonly",
        IntersectionObserver: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        getComputedStyle: "readonly",
        matchMedia: "readonly",
        alert: "readonly",
        confirm: "readonly",
        performance: "readonly",
        DOMParser: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        KeyboardEvent: "readonly",
        DragEvent: "readonly",
        NodeFilter: "readonly",
        crypto: "readonly",
        indexedDB: "readonly",
        globalThis: "readonly",
        // CDN library globals
        Sortable: "readonly",
        jspdf: "readonly",
        html2canvas: "readonly",
        QRCode: "readonly",
        location: "readonly",
        // CDN library globals (defined in separate script files loaded before app.js)
        BooklistApp: "off",
        CONFIG: "readonly",
        BookUtils: "readonly",
        openTab: "off",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-redeclare": "error",
      "no-constant-condition": "warn",
      "no-debugger": "warn",
      "no-duplicate-case": "error",
      "no-empty": "warn",
      "no-unreachable": "warn",
      "eqeqeq": ["warn", "smart"],
      "no-useless-assignment": "warn",
      "no-var": "warn",
      "prefer-const": ["warn", { destructuring: "all" }],
    },
  },
  {
    // ES module files (Firebase integration + admin console). These use
    // `import`/`export` and top-level `await`, so they need sourceType
    // "module". They run only on branded library instances or in the
    // admin console — the public tool never loads them.
    files: [
      "assets/js/firebase-init.js",
      "assets/js/library-config.js",
      "assets/js/auth.js",
      "admin/admin.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        URLSearchParams: "readonly",
        // Browser globals legitimately used across module files
        // (admin console, library-config, auth). Mirror as needed
        // when adding new files; keep this list narrow.
        crypto: "readonly",
        fetch: "readonly",
        confirm: "readonly",
        location: "readonly",
        requestAnimationFrame: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-var": "warn",
      "prefer-const": ["warn", { destructuring: "all" }],
    },
  },
  {
    // Browser extension (extension/). MV3 service worker + content
    // script + popup. Plain JS, sourceType "script" because we don't
    // use ES module imports inside the extension files (each file runs
    // in its own MV3 context — service worker, isolated content world,
    // popup). The vendored webextension-polyfill is excluded from
    // linting via the ignores block below.
    files: ["extension/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        // Browser globals available in content scripts + popup
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        location: "readonly",
        fetch: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        requestAnimationFrame: "readonly",
        // Service worker globals (background.js)
        btoa: "readonly",
        importScripts: "readonly",
        // Extension API. All extension code calls `browser.*` (the
        // webextension-polyfill provides it in Chrome/Edge; Firefox
        // has it natively).
        browser: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-redeclare": "error",
      "no-empty": "warn",
      "eqeqeq": ["warn", "smart"],
      "no-var": "warn",
      "prefer-const": ["warn", { destructuring: "all" }],
    },
  },
  {
    // Build tooling that runs in Node, not in a browser or extension
    // runtime. Separate block so we don't inherit the extension's
    // browser/service-worker globals.
    files: ["extension/build-zips.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",
    },
  },
  {
    ignores: [
      "node_modules/",
      "eslint.config.js",
      "vitest.config.js",
      "tests/",
      // Vendored third-party library, shipped as-is; not our code to lint.
      "extension/vendor/",
    ],
  },
];
