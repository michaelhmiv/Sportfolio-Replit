import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['**/*.test.ts', '**/*.spec.ts'],
        exclude: ['node_modules', 'dist'],
        coverage: {
            reporter: ['text', 'html'],
            exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/*.spec.ts'],
        },
        // Alias resolution matching main project
        alias: {
            '@shared': path.resolve(__dirname, './shared'),
        },
    },
});
