import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: ['dist/', 'coverage/', 'badges/']
    },
    {
        rules: {
            'semi': 'error',
            'prefer-const': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
            ]
        }
    },
    {
        files: ['**/__tests__/**/*.test.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off'
        }
    }
]);
