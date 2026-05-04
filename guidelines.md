# Keeguard Design System & Visual Language Reference

> **Branding alias:** This app was previously called **SecureVault** and is now called **Keeguard**. They are the same app. All references to "SecureVault" in this document mean "Keeguard". Internal identifiers (package name `com.mohdj.securevault`, storage keys `securevault_*`) keep the old name to protect existing user data.

> This document describes every visual and structural decision in the Keeguard app so that any AI or developer can build new screens, add features, or modify existing ones while keeping the look, feel, and logic 100 % consistent.


---

## 1. Design Philosophy

| Principle | What it means in practice |
|---|---|
| **Minimalist trust** | A password manager must look calm, clean, and serious. No playful illustrations, no decorative gradients on backgrounds, no busy textures. |
| **Depth through darkness** | The UI uses a layered dark-surface system. Deeper surfaces are darker; raised surfaces (cards, inputs) are slightly lighter. This creates perceived depth without shadows or borders. |
| **Restrained colour** | Colour is used *only* for meaning: the brand accent (cyan-to-blue gradient) signals primary actions; category colours distinguish item types; red signals destruction. Everything else is greyscale. |
| **Mobile-first, Web-Sync** | The app is designed as a phone-width single-column layout (max-width `max-w-md`, centered with `mx-auto`). It is built as a Web App to ensure real-time syncing across all user devices (Mobile and Desktop). |
| **Tactile feedback** | Interactive elements respond on press with `active:scale-[0.98]` or `active:scale-95`. Transitions use `transition-colors` or `transition-all` for smooth state changes. |

---

## 2. Colour Palette (Exact Hex / Tailwind Tokens)

### 2.1 Background Layers

| Token / Role | Value | Tailwind Class | Usage |
|---|---|---|---|
| **Page background** | `#1a1a2e` | `bg-[#1a1a2e]` | Every screen's root `div`. The single consistent canvas colour. |
| **Card / Input surface** | `#16213e` | `bg-[#16213e]` | Cards, grouped list containers, form inputs, dropdown menus, modal bodies. One step lighter than page background. |
| **Subtle surface** | `white` at 5 % opacity | `bg-white/5` | Inline read-only fields, password display rows, empty-state placeholders inside cards. |
| **Hover / Active overlay** | `white` at 5 % / 10 % | `hover:bg-white/5` `active:bg-white/10` | Applied on top of any interactive surface (list rows, icon buttons). |

### 2.2 Text Hierarchy

| Role | Tailwind Classes | Example |
|---|---|---|
| **Heading / Title** | `text-white` | Screen titles (`h2`), item title in list |
| **Body / Value** | `text-white text-sm` | Username, revealed password |
| **Secondary text** | `text-gray-300 text-sm` | Notes, metadata values |
| **Muted label** | `text-gray-400 text-xs` | Form labels, subtitle copy |
| **Placeholder / Tertiary** | `text-gray-500 text-xs` or `text-sm` | Input placeholders, empty states, helper text, section headers |
| **Disabled / Divider** | `text-gray-600` | Chevron arrows, count badges |
| **Error** | `text-red-400 text-sm` | Validation error messages |

### 2.3 Brand Accent (Primary Action)

| Element | Style |
|---|---|
| **Gradient** | `bg-gradient-to-r from-cyan-500 to-blue-600` (horizontal) or `bg-gradient-to-br from-cyan-500 to-blue-600` (diagonal, used for logo and FAB). |
| **Shadow glow** | `shadow-lg shadow-cyan-500/20` (buttons) or `shadow-cyan-500/30` (FAB). Gives the gradient a soft "glow" on the dark background. |
| **Accent text** | `text-cyan-400` for links, active dropdown items, edit-action text. |
| **Accent border** | `border-cyan-500/50` for outlined accent buttons (e.g. Edit). |
| **Focus ring on inputs** | `focus:border-cyan-500` (lock screen) or `focus:border-cyan-500/50` (forms). |

### 2.4 Category Colour Map

Each vault item type has its own icon colour and tinted background. These are used in list rows and detail headers:

| Type | Icon colour | Background | Icon (Lucide) |
|---|---|---|---|
| Website | `text-cyan-400` | `bg-cyan-500/10` | `Globe` |
| App | `text-purple-400` | `bg-purple-500/10` | `Smartphone` |
| Phone | `text-green-400` | `bg-green-500/10` | `Phone` |
| Door Lock | `text-amber-400` | `bg-amber-500/10` | `DoorOpen` |
| Card | `text-pink-400` | `bg-pink-500/10` | `CreditCard` |
| Other | `text-gray-400` | `bg-gray-500/10` | `KeyRound` |

**Rule:** If a new item type is added, pick a Tailwind colour that isn't already used, follow the same `text-{colour}-400` / `bg-{colour}-500/10` pattern, and choose a semantically relevant Lucide icon.

### 2.5 Destructive / Danger

| Element | Style |
|---|---|
| Delete button (outlined) | `border border-red-500/50 text-red-400 hover:bg-red-500/10` |
| Delete button (filled, in modal) | `bg-red-500 text-white hover:bg-red-600` |
| Required-field asterisk | `text-red-400` |
| Validation errors | `text-red-400 text-sm` |

### 2.6 Success / Confirmation

| Element | Style |
|---|---|
| Copy-confirmed checkmark | `text-green-400` (replaces the Copy icon for 2 seconds) |

---

## 3. Typography

The app relies on the system/default font stack defined in `theme.css`. No custom fonts are imported.

| HTML Element | Size (from theme.css) | Weight | Line-height |
|---|---|---|---|
| `h1` | `--text-2xl` (1.5 rem) | 500 (medium) | 1.5 |
| `h2` | `--text-xl` (1.25 rem) | 500 | 1.5 |
| `h3` | `--text-lg` (1.125 rem) | 500 | 1.5 |
| `h4`, `label`, `button` | `--text-base` (1 rem) | 500 | 1.5 |
| `input` | `--text-base` (1 rem) | 400 (normal) | 1.5 |

**In components**, most body text uses `text-sm` (0.875 rem) and labels use `text-xs` (0.75 rem) via Tailwind utility classes, which override the base styles.

---

## 4. Spacing & Layout Rules

### 4.1 Page Structure

```
<div class="min-h-screen bg-[#1a1a2e] flex flex-col">
  <!-- Sticky header -->
  <!-- Scrollable content (flex-1 overflow-y-auto) -->
  <!-- Optional sticky footer -->
</div>
```

- The outermost app shell constrains width: `max-w-md mx-auto min-h-screen`.
- Every screen is a full-height flex column.
- Content area uses `flex-1 overflow-y-auto` so only the content scrolls while header/footer stay fixed.

### 4.2 Spacing Values

| Context | Value | Tailwind |
|---|---|---|
| Page horizontal padding | 16 px | `px-4` |
| Header vertical padding | 12 px | `py-3` |
| Content top/bottom padding | 20 px | `py-5` |
| Space between sections | 20 px | `space-y-5` |
| Space between form fields | 20 px | `space-y-5` |
| Card internal padding | 16 px | `p-4` |
| Space between items inside a card | 16 px | `space-y-4` |
| Bottom padding for list (above FAB) | 96 px | `pb-24` |
| Footer actions padding | 16 px | `px-4 py-4` |
| Gap between action buttons | 12 px | `gap-3` |

### 4.3 Icon Sizing

| Context | Size | Tailwind |
|---|---|---|
| Header logo icon | 16 px (inside 32 px container) | `w-4 h-4` |
| Lock screen logo icon | 40 px (inside 80 px container) | `w-10 h-10` |
| Header action icons | 20 px | `w-5 h-5` |
| List row type icons | 20 px (inside 40 px container) | `w-5 h-5` |
| Input prefix icons | 18 px | `w-4.5 h-4.5` |
| Inline action icons (copy, eye) | 16 px | `w-4 h-4` |
| FAB icon | 24 px | `w-6 h-6` |
| Empty state icon | 32 px (inside 64 px container) | `w-8 h-8` |

---

## 5. Component Patterns

### 5.1 Sticky Header Bar

```
<div class="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5">
  <div class="flex items-center justify-between px-4 py-3">
    <!-- Left: back arrow or logo + title -->
    <!-- Right: action icons -->
  </div>
</div>
```

- Semi-transparent background (`/95`) with `backdrop-blur-sm` for a glass effect when content scrolls underneath.
- Bottom border `border-white/5` is barely visible, just enough separation.
- Left side: either the app logo (home) or a back arrow (sub-screens).
- Right side: icon buttons (`p-2 rounded-lg hover:bg-white/5 text-gray-400`).

### 5.2 Content Card

```
<div class="bg-[#16213e] rounded-xl p-4 space-y-4">
  <!-- Card contents -->
</div>
```

- Always `rounded-xl` (12 px radius).
- Internal padding `p-4`.
- Multiple cards on a screen are separated by `space-y-5`.
- If the card contains a list of rows, use `divide-y divide-white/5` instead of `space-y` for internal separation.

### 5.3 Grouped List (Home Screen)

```
<!-- Section label -->
<span class="text-gray-500 text-xs uppercase tracking-wider">Website</span>

<!-- List container -->
<div class="bg-[#16213e] rounded-xl overflow-hidden divide-y divide-white/5">
  <!-- Row buttons -->
  <button class="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 active:bg-white/10 text-left">
    <div class="w-10 h-10 rounded-xl {typeColor} flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-white text-sm truncate">Title</p>
      <p class="text-gray-500 text-xs truncate mt-0.5">Subtitle</p>
    </div>
    <ChevronRight class="w-4 h-4 text-gray-600 shrink-0" />
  </button>
</div>
```

- Each group has: a label above, then a card containing clickable rows.
- Icon containers are `w-10 h-10 rounded-xl` with the category tint.
- Text truncates with `truncate` and `min-w-0` on the flex child.
- A subtle chevron on the right signals "tappable".

### 5.4 Form Input

```
<div>
  <label class="text-gray-400 text-xs mb-1.5 block">Label</label>
  <input class="w-full bg-[#16213e] border border-gray-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition-colors" />
</div>
```

- Inputs always sit inside `bg-[#16213e]` with a soft border `border-gray-700/50`.
- Corner radius: `rounded-xl`.
- Vertical padding `py-3` gives comfortable touch targets (~48 px height).
- Focus state: border shifts to cyan (`focus:border-cyan-500/50`).
- Labels are always above the input, `text-gray-400 text-xs`, with `mb-1.5` gap.
- For password fields, an eye toggle icon sits `absolute right-3 top-1/2 -translate-y-1/2`.
- For fields with left icons, the icon is `absolute left-3 top-1/2 -translate-y-1/2` and the input gets `pl-10`.

### 5.5 Dropdown / Select

```
<button class="w-full bg-[#16213e] border border-gray-700/50 rounded-xl py-3 px-4 text-white flex items-center justify-between">
  <span>{value}</span>
  <ChevronDown class="w-4 h-4 text-gray-500" />
</button>
 
<!-- Dropdown panel (absolutely positioned below) -->
<div class="absolute top-full left-0 right-0 mt-1 bg-[#16213e] border border-gray-700/50 rounded-xl overflow-hidden z-20 shadow-xl">
  <button class="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 text-white">
    Option
  </button>
</div>
```

- Same visual as an input but with a chevron.
- Active/selected option: `text-cyan-400 bg-white/5`.

### 5.6 Primary Button (Gradient CTA)

```
<button class="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3 rounded-xl disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-cyan-500/20">
  Save
</button>
```

- Always uses the brand gradient.
- Full-width on lock screen, inline on forms.
- Disabled state: `disabled:opacity-50` or `disabled:opacity-40`.
- Press feedback: `active:scale-[0.98]`.
- Cyan glow shadow.

### 5.7 Secondary / Outlined Button

```
<button class="px-6 py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:bg-white/5 transition-colors">
  Cancel
</button>
```

- Transparent background, gray border and text.
- Hover lifts slightly with `bg-white/5`.

### 5.8 Floating Action Button (FAB)

```
<button class="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/30 active:scale-95 transition-transform z-20">
  <Plus class="w-6 h-6" />
</button>
```

- Fixed position, bottom-right (`bottom-6 right-6`).
- Perfect circle (`rounded-full`, `w-14 h-14`).
- Brand gradient with stronger glow (`shadow-cyan-500/30`).
- The list screen adds `pb-24` to content so the FAB doesn't overlap the last item.

### 5.9 Modal / Dialog

```
<!-- Backdrop -->
<div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6">
  <!-- Modal body -->
  <div class="bg-[#16213e] rounded-2xl p-6 w-full max-w-sm shadow-xl">
    <h3 class="text-white mb-2">Title</h3>
    <p class="text-gray-400 text-sm mb-6">Description</p>
    <div class="flex gap-3 justify-end">
      <!-- Cancel + Confirm buttons -->
    </div>
  </div>
</div>
```

- Backdrop: `bg-black/60`, click-to-dismiss via `onClick` on backdrop.
- Modal card: `rounded-2xl` (slightly rounder than content cards), `p-6`.
- Max width `max-w-sm` keeps it phone-friendly.
- Buttons right-aligned with `justify-end`.

### 5.10 Empty State

```
<div class="flex flex-col items-center justify-center py-16 px-6">
  <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
    <Icon class="w-8 h-8 text-gray-500" />
  </div>
  <p class="text-gray-400 text-center">Primary message</p>
  <p class="text-gray-500 text-sm text-center mt-1">Secondary hint</p>
</div>
```

- Centered vertically within available space.
- Muted icon in a soft circular container.
- Two lines of text: one slightly brighter, one dimmer.

### 5.11 Metadata Row

```
<div class="flex justify-between">
  <span class="text-gray-500 text-xs">Label</span>
  <span class="text-gray-300 text-xs">Value</span>
</div>
```

- Used inside a card for key-value metadata (Type, Created, Last changed).
- Items stacked with `space-y-2`.

### 5.12 Sticky Footer (Form Actions)

```
<div class="sticky bottom-0 bg-[#1a1a2e]/95 backdrop-blur-sm border-t border-white/5 px-4 py-4 flex gap-3 justify-end">
  <!-- Cancel + Save buttons -->
</div>
```

- Mirrors the header's glass effect, but at the bottom with `border-t`.
- Buttons right-aligned.

---

## 6. Border & Radius System

| Element | Radius | Tailwind |
|---|---|---|
| Content cards | 12 px | `rounded-xl` |
| Input fields | 12 px | `rounded-xl` |
| Buttons | 12 px | `rounded-xl` |
| Modal dialogs | 16 px | `rounded-2xl` |
| FAB | Full circle | `rounded-full` |
| Icon containers (list) | 12 px | `rounded-xl` |
| Header logo (small) | 8 px | `rounded-lg` |
| Lock screen logo | 16 px | `rounded-2xl` |
| Icon buttons (hit area) | 8 px | `rounded-lg` |
| Empty state circle | Full circle | `rounded-full` |

| Border style | Tailwind | Where used |
|---|---|---|
| Header/footer separator | `border-white/5` | Top and bottom of sticky bars |
| Card row dividers | `divide-white/5` | Between list items inside a group |
| Input borders | `border-gray-700/50` | Form fields |
| Lock screen input borders | `border-gray-700` | Slightly more visible on the unlock form |

---

## 7. Iconography

All icons come from `lucide-react`. The project uses **only** Lucide icons for consistency.

### Key icons used:

| Icon | Context |
|---|---|
| `Shield` | App logo |
| `Lock` | Lock vault action, confirm password field |
| `KeyRound` | Master password field, generic key icon, "Other" type |
| `Eye` / `EyeOff` | Toggle password visibility |
| `Copy` | Copy to clipboard |
| `Check` | Copy-confirmed state (green) |
| `Search` | Search toggle, search input |
| `X` | Clear search |
| `Plus` | FAB (add new item) |
| `ArrowLeft` | Back navigation |
| `ChevronDown` | Dropdown indicator |
| `Pencil` | Edit action |
| `Trash2` | Delete action |
| `Share2` | Share action |
| `ExternalLink` | Open URL in browser |
| `Globe` | Website type |
| `Smartphone` | App type |
| `Phone` | Phone type |
| `DoorOpen` | Door Lock type |
| `CreditCard` | Card type |

**Rule:** When adding new features, always check if Lucide has an appropriate icon before creating custom SVGs.

---

## 8. Interaction & Animation Patterns

| Pattern | Implementation |
|---|---|
| **Button press** | `active:scale-[0.98]` on primary buttons, `active:scale-95` on FAB |
| **Colour transitions** | `transition-colors` on all hover states |
| **General transitions** | `transition-all` on primary action buttons |
| **Transform transitions** | `transition-transform` on FAB |
| **Dropdown chevron rotation** | `transition-transform` + conditional `rotate-180` |
| **Copy feedback** | Icon swaps from `Copy` to `Check` (green) for 2 seconds via `setTimeout` |
| **Modal entry** | No animation (instant appear). Dismissed by clicking backdrop. |
| **No page transitions** | Screen changes are instant via React Router. (Motion library is available if transitions are desired in the future.) |

---

## 9. Screen Architecture & Navigation

### 9.1 Routing (React Router v7, Data Mode)

| Path | Component | Description |
|---|---|---|
| `/` | `HomeWrapper` -> `PasswordList` | Main list of saved items |
| `/add` | `AddEditForm` | Add new password form |
| `/item/:id` | `ItemDetail` | View a saved password |
| `/edit/:id` | `AddEditForm` | Edit an existing password |

All routes are children of `AppShell`, which controls the lock/unlock gate.

### 9.2 Lock Gate (AppShell)

- The `AppShell` component holds `unlocked` state.
- If `unlocked === false`, the `LockScreen` component renders (outside the router outlet).
- The lock screen handles both first-time setup (create master password) and returning-user unlock (verify password).
- Locking is done via the Lock icon in the header, which calls `onLock()` passed through React Router's outlet context.

### 9.3 Navigation Patterns

| From | To | Method |
|---|---|---|
| List -> Detail | Tap a row | `navigate('/item/{id}')` |
| List -> Add | Tap FAB | `navigate('/add')` |
| Detail -> Edit | Tap Edit button | `navigate('/edit/{id}')` |
| Detail -> List | Tap back arrow | `navigate('/')` |
| Add/Edit -> Back | Tap back arrow or Cancel | `navigate(-1)` |
| Add -> Detail | Save new item | `navigate('/item/{newId}', { replace: true })` |
| Edit -> Detail | Save edits | `navigate('/item/{id}', { replace: true })` |
| Delete -> List | Confirm delete in modal | `navigate('/', { replace: true })` |

---

## 10. Data Layer

### 10.1 Storage

- All data is stored in `localStorage` (keys: `securevault_items`, `securevault_master_hash`).
- Master password is SHA-256 hashed before storage.
- Vault items are stored as a JSON array.

### 10.2 Data Model

```typescript
type ItemType = 'Website' | 'App' | 'Phone' | 'Door Lock' | 'Card' | 'Other';

interface VaultItem {
  id: string;           // UUID
  title: string;        // Required
  username: string;     // Optional (empty string if none)
  password: string;     // Required
  type: ItemType;
  url: string;          // Optional (empty string if none)
  note: string;         // Optional (empty string if none)
  createdAt: string;    // ISO timestamp
  updatedAt: string;    // ISO timestamp
}
```

### 10.3 CRUD Operations (store.ts)

| Function | Purpose |
|---|---|
| `getVaultItems()` | Read all items |
| `getVaultItem(id)` | Read one item by ID |
| `addVaultItem(data)` | Create new item (auto-generates id, timestamps) |
| `updateVaultItem(id, updates)` | Update fields + refresh `updatedAt` |
| `deleteVaultItem(id)` | Remove item |
| `seedSampleData()` | Populate demo data on first setup |

---

## 11. File Structure

```
/src/app/
  App.tsx                  # Root: wraps RouterProvider in dark mode container
  routes.ts                # React Router config (createBrowserRouter)
  store.ts                 # Data model, localStorage CRUD, auth helpers
  components/
    AppShell.tsx            # Layout: lock gate + Outlet with context
    LockScreen.tsx          # Master password setup/unlock screen
    HomeWrapper.tsx         # Thin wrapper: passes onLock from outlet context to PasswordList
    PasswordList.tsx        # Home screen: grouped list, search, FAB
    AddEditForm.tsx         # Add / Edit form (shared component, mode from URL param)
    ItemDetail.tsx          # Detail view: show, copy, edit, delete

/src/styles/
  theme.css                # Tailwind v4 theme tokens (do not modify unless changing design system)
  fonts.css                # Font imports (currently empty)

/src/imports/
  app-spec.md              # Product spec document
  DESIGN_SYSTEM.md         # This file
```

---

## 12. Guidelines for Adding New Features

### Adding a new screen
1. Create the component in `/src/app/components/NewScreen.tsx`.
2. Add a route in `/src/app/routes.ts` as a child of the root layout.
3. Use the standard screen structure: sticky header -> flex-1 scrollable content -> optional sticky footer.
4. Use `bg-[#1a1a2e]` as the screen background.
5. Use `bg-[#16213e]` for any cards or grouped containers.

### Adding a new item type
1. Add the type string to the `ItemType` union in `store.ts`.
2. Add an entry to `typeIcons` and `typeColors` maps in both `PasswordList.tsx` and `ItemDetail.tsx`.
3. Add it to the `itemTypes` array in `AddEditForm.tsx`.
4. Pick a unique Tailwind colour from: `rose`, `orange`, `teal`, `indigo`, `emerald`, `violet`, `sky`, `lime`, `fuchsia`.
5. Follow the `text-{colour}-400` / `bg-{colour}-500/10` pattern.

### Adding a settings screen
1. Create `/src/app/components/Settings.tsx`.
2. Add route: `{ path: 'settings', Component: Settings }`.
3. Add a gear icon (`Settings` from Lucide) in the home header.
4. Use toggle switches for boolean settings, the standard dropdown for selection settings.
5. Group related settings in content cards (`bg-[#16213e] rounded-xl p-4`).

### Adding a bottom tab bar
1. Create a `TabBar.tsx` component.
2. Fix it to the bottom: `fixed bottom-0 left-0 right-0 max-w-md mx-auto`.
3. Use `bg-[#1a1a2e]/95 backdrop-blur-sm border-t border-white/5` (same glass pattern as sticky header).
4. Tab icons: `w-5 h-5`, active = `text-cyan-400`, inactive = `text-gray-500`.
5. Adjust content `pb-` values to account for tab bar height.
6. Move the FAB above the tab bar or replace it with a centre tab action.

### Adding animations
1. The `motion` package is already installed.
2. Import: `import { motion } from 'motion/react'`.
3. Keep animations subtle: 200-300ms duration, ease-out curves.
4. Good candidates: page transitions (`motion.div` with fade/slide), modal enter/exit, list item stagger.
5. Don't animate colour changes (CSS transitions handle those).

### Toast / Snackbar notifications
1. The `sonner` package is already installed.
2. Import: `import { toast } from 'sonner'`.
3. Add `<Toaster />` inside the `App.tsx` root div.
4. Use for: "Copied to clipboard", "Item saved", "Item deleted" confirmations.
5. Style the Toaster to match the dark theme.

---

## 13. Do's and Don'ts

### Do
- Use `bg-[#1a1a2e]` for page backgrounds and `bg-[#16213e]` for elevated surfaces.
- Use `rounded-xl` for cards, inputs, and buttons; `rounded-2xl` for modals and logos.
- Use `text-gray-400 text-xs` for form labels.
- Use the cyan-blue gradient only for primary CTAs and the app logo.
- Use `lucide-react` for all icons.
- Use `transition-colors` on hover states.
- Give buttons `active:scale-[0.98]` tactile feedback.
- Keep everything single-column, vertically scrolling.
- Use `space-y-5` between sections, `space-y-4` inside cards, `gap-3` between buttons.

### Don't
- Don't use solid background colours other than the two defined surfaces.
- Don't introduce new accent colours for actions (stick to cyan/blue for positive, red for destructive).
- Don't use box shadows on cards (depth comes from colour layering, not shadows).
- Don't add horizontal scroll containers.
- Don't use different border radii for the same type of element.
- Don't put text directly on the page background without a card when it's a data field.
- Don't use `border-white` or thick borders. Keep borders at `border-white/5` or `border-gray-700/50`.
- Don't override the base typography in `theme.css` unless specifically requested.
- Don't use emoji or decorative elements in the UI.

---

## 14. Terminal & Git Interface Guidelines (For AI Agents)

> [!IMPORTANT]
> **PowerShell Compatibility:** This project runs on Windows (PowerShell). Standard Unix command chaining (`&&`) is NOT supported in default PowerShell 5.1 and will cause a ParserError.

### 14.1 Command Chaining
- **DO NOT USE `&&`** for chaining commands in terminal calls.
- **USE `;`** (semicolon) to run commands sequentially in PowerShell.
- **Example Git Command:** `git add . ; git commit -m "..." ; git push`

### 14.2 Environment Awareness
- Always verify the current working directory (`Cwd`) before running shell commands.
- Only create project-specific rule files (like `.cursorrules`) if explicitly requested, as the team primarily uses Gemini and Claude agents.

### 14.3 Android APK Building
- **Prefer Terminal Builds:** When a native APK rebuild is required, ALWAYS prefer building it directly from the terminal using the Gradle wrapper (`cd android ; .\gradlew.bat assembleDebug`). Do not instruct the user to open Android Studio unless explicitly requested.