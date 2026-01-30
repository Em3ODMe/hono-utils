# Contributing to hono-utils

First off, thank you for considering contributing to `hono-utils`! It’s people like you who make the open-source community such an amazing place to learn, inspire, and create.

To maintain the quality of the utilities and ensure a smooth experience for all users, please take a moment to review these guidelines.

---

## 🛠️ Development Setup

### Prerequisites

- **Node.js**: `v18.0.0` or higher.
- **Package Manager**: `npm`, `pnpm`, or `yarn`.

### Getting Started

1. **Fork** the repository and clone it to your local machine.
2. Install dependencies:

```bash
npm install

```

3. Ensure **Husky** is initialized (this happens automatically via the `prepare` script):

```bash
npm run prepare

```

---

## 🚀 Development Workflow

We use a modern TypeScript toolchain to keep the codebase clean and efficient.

### Available Scripts

| Script            | Description                                                 |
| ----------------- | ----------------------------------------------------------- |
| `npm run dev`     | Starts `tsup` in watch mode for rapid development.          |
| `npm run build`   | Bundles the package into the `dist` folder.                 |
| `npm run test`    | Runs the test suite using **Vitest**.                       |
| `npm run test:ui` | Opens the Vitest UI for a visual testing experience.        |
| `npm run lint`    | Checks the code for style and syntax issues via **ESLint**. |
| `npm run format`  | Automatically fixes code formatting using **Prettier**.     |

---

## 📝 Contribution Guidelines

### 1. Branching Strategy

- Always create a new branch for your work (e.g., `feat/add-new-crypto-helper` or `fix/issue-123`).
- Avoid working directly on the `main` branch.

### 2. Coding Standards

- **TypeScript**: This project is strictly typed. Ensure your contributions do not use `any` unless absolutely necessary.
- **Linting**: Run `npm run lint:check` before committing. The project uses ESLint 9+ flat config.
- **Formatting**: We follow a strict Prettier config. You can run `npm run format` to fix most issues.

### 3. Testing

We strive for high test coverage.

- If you add a new utility, you **must** include a corresponding `.test.ts` file in the `src` directory.
- Check your coverage before submitting:

```bash
npm run coverage

```

### 4. Documentation

If you add a new feature (like a new middleware or router helper), please update:

1. The `README.md` usage section.
2. The relevant documentation file in the `docs/` directory.

---

## 📬 Pull Request Process

1. **Update the README/Docs**: If your change affects how a user interacts with the library, update the documentation.
2. **Verify Quality**: Ensure `npm run lint` and `npm run test` pass locally.
3. **Submit PR**: Provide a clear description of the changes and link any related issues.
4. **Review**: Once submitted, a maintainer will review your code. Please be open to feedback!

> **Note:** We have a `prepublishOnly` hook that runs linting, formatting, tests, and builds. If your PR fails CI, it’s likely due to one of these steps.

---

## 🐛 Reporting Issues

If you find a bug or have a feature request, please [open an issue](https://github.com/Em3ODMe/hono-utils/issues) with:

- A clear title and description.
- Steps to reproduce the issue.
- Expected vs. actual behavior.

---

Thank you for helping make `hono-utils` better!
