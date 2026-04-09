# copilot-compare

Simple Electron app for comparing the same prompt or scenario across multiple GitHub Copilot configurations.

Built with Electron, React, TypeScript, electron-vite, and electron-builder.

## Requirements

- Node.js 24.6.0 for local development (`.nvmrc`)
- Supported local build range: Node.js 22.12.0 through 24.x
- Packaged runtime: Electron 41.2.0 with bundled Node.js 24.14.0
- A GitHub account with access to GitHub Copilot

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

## Preview Production Build

```bash
npm start
```

## Typecheck

```bash
npm run typecheck
```

## Package

```bash
npm run build
```

## Make Windows Installers

```bash
npm run make
```

## Authentication

```bash
copilot login
```

Or set one of the following environment variables:

- `COPILOT_GITHUB_TOKEN`
- `GH_TOKEN`
- `GITHUB_TOKEN`

## Data Storage

Each run report is written to the `%APPDATA%/copilot-compare/runs` directory as JSON.
Saved configuration groups default to `%APPDATA%/copilot-compare/configuration-groups`.
Saved prompt lists default to `%APPDATA%/copilot-compare/prompt-lists`.
