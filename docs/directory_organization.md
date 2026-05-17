# Keeguard Project Directory Organization

To maintain a professional, clean, and easily navigable codebase, the directory structure of the Keeguard (formerly SecureVault) project has been restructured. Scattered configuration drafts, logs, binary builds, and test folders have been organized into dedicated, logical subfolders.

---

## 📂 The New Directory Layout

The root folder has been decluttered and now contains only the essential entry points, environment variables, configuration files, and standard project folders.

```
Keeguard/
├── .env                              # Ignored — Environment variables
├── .firebase/                        # Ignored — Firebase CLI cache
├── .firebaserc                       # Firebase project configuration
├── .gitignore                        # Git ignore rules (updated)
├── index.html                        # Frontend app entry point
├── package.json                      # Node packages & scripts
├── package-lock.json                 # Lock file for dependencies
├── postcss.config.mjs                # PostCSS config
├── tsconfig.json                     # TypeScript compilation configuration
├── vite.config.ts                    # Vite build configuration
├── capacitor.config.ts               # Capacitor native bridge configuration
├── firestore.rules                   # Cloud Firestore security rules
├── README.md                         # Project read-me and intro
├── vault-app-ba6e2-firebase-admin... # Ignored — Firebase SDK Private Key
│
├── src/                              # Main frontend application source
│   ├── app/                          # Core React app code
│   │   ├── components/               # App views and pages
│   │   ├── services/                 # Firebase/auth/sync services
│   │   └── ...                       # Hooks, store, crypto utilities
│   ├── imports/                      # Legacy product spec imports
│   └── styles/                       # CSS themes and design tokens
│
├── android/                          # Native Android app workspace
│
├── api/                              # Backend / Serverless API routes
│
├── scripts/                          # Utility & automation scripts
│   └── test_firestore.js             # Moved — Firestore connection test script
│
├── docs/                             # 🌟 NEW — Clean documentation folder
│   ├── AGENT_RULES.md                # Branding and deployment guidelines for AI agents
│   ├── ATTRIBUTIONS.md               # Attributions and licensing notes
│   ├── AUTOFILL_ARCHITECTURE.md      # Android Autofill Native Service architecture
│   ├── GITHUB_RELEASE_GUIDE.md       # Step-by-step instructions for GitHub releases
│   ├── comprehensive_system_prompts... # System prompts and LLM contexts
│   ├── features.md                   # Detailed app features manifest
│   ├── guidelines.md                 # Design System & Visual Language Reference
│   ├── implementation_plan.md        # Feature roadmap & implementation phases
│   ├── overview.md                   # High-level product overview
│   └── releases/                     # Subfolder — Release logs and notes
│       └── release-notes-v4.0.0.md   # Release notes for version 4.0.0
│
├── releases/                         # 🌟 NEW — Ignored folder for large binary builds
│   ├── Keeguard_4.0.0_release.apk    # Production Android build
│   └── SecureVault-v3.2.2.apk        # Legacy Android build
│
├── backups/                          # 🌟 NEW — Ignored folder for code & log backups
│   ├── old_AuthScreen.tsx            # Backup of legacy authentication screen
│   ├── old_auth.ts                   # Backup of legacy auth utility functions
│   ├── diff.txt                      # Historical git diff logs
│   ├── temp_log.txt                  # Temp git log slice
│   └── firestore_update.json         # Old Firestore manual update payload
│
├── archive/                          # 🌟 NEW — Ignored folder for historical resources
│   ├── Gemini_Generated_Image_...    # Legacy UI mockups and design generations
│   ├── pdfs_info_securevault/        # Full archive of draft notes and specs (58 files)
│   └── test_extracts/                # Extracted build testing sites (test_extract_*)
│
└── audit/                            # Security, design, and AI audits
    ├── 2026-03-25-audit-tasks.md     # Audit checklist
    └── ai_audit_log.md               # Moved — AI-driven security audit logs
```

---

## 🛠️ Relocated Files & Rationale

| Original File / Folder | New Location | Rationale |
| :--- | :--- | :--- |
| `*.md` documentation files (9 files) | `docs/` | Consolidates all guides, plans, and architectural reference documents in one place to avoid root-level markdown clutter. |
| `release-notes-v4.0.0.md` | `docs/releases/` | Created a structured, history-friendly release logs directory. |
| `*.apk` (2 files) | `releases/` | Moves heavy binary packages (totaling ~45MB) out of the root, keeping it lightweight. |
| `old_AuthScreen.tsx`, `old_auth.ts` | `backups/` | Safely quarantines old reference code that is no longer imported, keeping `src/` clean. |
| `diff.txt`, `temp_log.txt`, `firestore_update.json` | `backups/` | Keeps temporary work logs and JSON parameters out of sight. |
| `test_firestore.js` | `scripts/` | Groups all JS/MJS scripts into a single script directory. |
| `ai_audit_log.md` | `audit/` | Groups AI security audits with regular developer audits. |
| `keeguard logo.png` | `public/assets/` | Moves design assets into the web-accessible asset directory. |
| `pdfs_info_securevault/` | `archive/` | Moves the massive folder of legacy draft notes and PDFs (58 files) to a dedicated archive. |
| `test_extract*` folders (5 folders) | `archive/test_extracts/` | Groups temporary HTML website extractions in a single local directory. |

---

## 🛡️ Git Ignore Protocol (Updated)

To ensure that heavy files, private credentials, and backups are never committed to the remote repository, `.gitignore` has been updated with leading-slash rules.

```gitignore
# Builds and releases
/releases/
*.apk

# Backups and archives
/backups/
/archive/
```

> [!NOTE]
> The leading slash (e.g., `/releases/`) ensures that only the **root** folder is ignored, preventing Git from accidentally ignoring folders inside subdirectories like `docs/releases/`.

---

*This directory layout keeps your workspace fresh, organized, and perfectly optimized for both manual developer workflows and autonomous AI development.*
