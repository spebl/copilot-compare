# copilot-compare

Simple Electron app for comparing the same prompt or scenario across multiple GitHub Copilot configurations.

Built with Electron, React, TypeScript, and webpack.

## Requirements

- Node.js 24 or newer
- A GitHub account with access to GitHub Copilot

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

## Run

```bash
npm start
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
