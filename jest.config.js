export default {
  preset: "ts-jest",
  testEnvironment: "node",

  roots: ["<rootDir>/tests"],

  testMatch: ["**/*.test.ts"],

  transform: {
    "^.+\\.ts$": "ts-jest",
    "^.+\\.js$": ["ts-jest", {
      tsconfig: {
        allowJs: true,
        module: "CommonJS",
        verbatimModuleSyntax: false,
        noUncheckedSideEffectImports: false,
      },
      diagnostics: false,
    }],
  },

  transformIgnorePatterns: [
    "/node_modules/(?!(@bpmn-io|min-dash)/)"
  ],

  setupFiles: ["<rootDir>/tests/setup.js"],

  moduleFileExtensions: ["ts", "js"],

  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },

  clearMocks: true,

  collectCoverage: true,

  coverageDirectory: "coverage",

  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/types/**",
    "!src/database.ts"
  ]
};