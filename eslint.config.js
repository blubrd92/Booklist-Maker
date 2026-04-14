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
    ignores: ["node_modules/", "eslint.config.js", "vitest.config.js", "tests/"],
  },
];
