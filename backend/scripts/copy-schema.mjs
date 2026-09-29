import { mkdir, copyFile } from 'node:fs/promises';
await mkdir(new URL('../dist/db/', import.meta.url), { recursive: true });
await copyFile(new URL('../src/db/schema.sql', import.meta.url), new URL('../dist/db/schema.sql', import.meta.url));
await copyFile(new URL('../src/db/catalogos-fixos.json', import.meta.url), new URL('../dist/db/catalogos-fixos.json', import.meta.url));
