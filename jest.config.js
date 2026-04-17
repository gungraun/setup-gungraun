module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/src"],
    testMatch: ["**/__tests__/**/*.test.ts"],
    coverageDirectory: "coverage",
    coverageReporters: ["json-summary", "lcov", "text"],
};
