# Element Locator

[简体中文](README.md) | [English](README_EN.md)

Element Locator is a Chrome extension that generates and validates stable, unique XPath and CSS selectors for web elements. It is useful for test automation, web debugging, data extraction, and other workflows that require reliable element locators.

## Features

- Generates both XPath and CSS selectors and verifies that they uniquely match the target
- Scores multiple candidates by stability and recommends the best result
- Selects elements through either the page context menu or DevTools `$0`
- Reports iframe information and locator details for open Shadow DOM
- Filters transient state classes such as `hover`, `active`, and `selected`
- Builds relative structural paths from stable ancestors when the target has no stable attribute
- Offers a structural mode that avoids volatile text
- Supports Java double-quote escaping and one-click copy

## Screenshots

Screenshots will be added after the interface becomes more stable. You can try the extension now by loading it in Chrome developer mode as described below.

## Installation

### Build from source

Requirements: Node.js 18 or later and Chrome or another Chromium-based browser.

```bash
npm install
npm run build
```

Then install it in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project root directory, not the `dist` directory.

After changing the source, run `npm run build` and reload the extension from the extensions page.

### Local library usage

This project also produces a local library for use by other projects. Build the library first:

```powershell
# Run from this project root
npm run build:library
```

The only supported import is the public package entry:

```ts
import {
  createDomEvaluator,
  generateLocator,
  type LocatorResult,
} from 'element-locator';
```

Consumers should install this package through a local `file:` dependency. Do not import the extension bundle or depend on unexported internal paths. The library provides DOM locator generation only.

## Usage

### Generate from the page context menu

1. Right-click the target element.
2. Select **Generate Element Locator**.
3. Review the recommended XPath and CSS selector in the panel at the bottom-right of the page.
4. If needed, use the breadcrumb to switch to an ancestor element.
5. Copy the desired locator.

The panel provides two optional settings:

- **Java quote escaping**: escapes `"` as `\"` when copying.
- **Structural mode**: excludes text candidates and prefers `href` or ancestor-based structural paths for pages with frequently changing text.

### Generate precisely through DevTools

1. Open Chrome DevTools.
2. Select the target in the **Elements** panel so that it becomes `$0`.
3. Open the **Element Locator** panel.
4. Click **Generate locator ($0)**.
5. Review, navigate ancestors, and copy the result from the page overlay.

## Locator strategy

Element Locator combines target attributes, text, stable ancestors, and DOM structure. Each candidate is evaluated in the current page and is eligible for recommendation only when it uniquely matches the target.

Common signals include:

- Stable `id` values
- Test attributes such as `data-testid`, `data-test`, `data-qa`, and `data-cy`
- `name`, ARIA attributes, and reliable `data-*` attributes
- Non-transient semantic classes
- Link `href` values
- Text or structural paths scoped to a stable ancestor

The extension does not treat interaction-state classes such as `unselct`, `unselect`, `hover`, or `active` as reliable signals. It also does not hard-code site-specific attributes such as `num`.

When the target has no stable attribute, a path may look like this:

```xpath
//div[@id='show']/ul[1]/li[1]
```

```css
#show > ul:nth-child(1) > li:nth-child(1)
```

These paths do not depend on pointer state, but they may change when list items are inserted, removed, or reordered.

## Development

| Command | Description |
| --- | --- |
| `npm run build` | Build the extension into `dist/` |
| `npm run watch` | Build once and watch source files for changes |
| `npm run typecheck` | Run TypeScript type checking |
| `npm test` | Run the automated test suite |

Project structure:

```text
src/
├─ background/   # Context menu and frame message routing
├─ content/      # Locator generation, validation, scoring, and page overlay
├─ devtools/     # DevTools panel
└─ inspected/    # DevTools $0 page injection entry
tests/           # node:test and jsdom tests
scripts/         # esbuild build scripts
dist/            # Generated output; not committed
```

## Browser verification checklist

Automated tests cover candidate generation, CSS validation, scoring, iframe routing, build entries, and panel behavior. Before publishing, also verify these cases in a real Chrome browser:

- Elements with stable id, test-id, or name attributes
- Multiple elements with identical text
- Frequently changing text with structural mode enabled
- Elements inside iframes
- Open and closed Shadow DOM scenarios
- Java escaping, copy actions, and ancestor breadcrumbs
- Locator generation from DevTools `$0`

## Known limitations

- A closed Shadow DOM cannot be traversed externally; the extension only reports the limitation.
- Cross-origin iframes prevent access to complete frame element information from the parent page.
- Pure positional paths are affected by DOM insertion, removal, and reordering.
- Full XPath behavior must be verified in a real browser because jsdom cannot reproduce every browser implementation detail.

## Privacy

The current implementation does not upload page content, generated locators, or browsing history. It contains no telemetry or analytics code. Locators are generated and validated locally in the active browser page.

The extension runs content scripts on visited pages and frames so that elements can be selected. Review [`manifest.json`](manifest.json) for the required permissions and match patterns before installation.

## Contributing

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening an issue or pull request. See [`CHANGELOG.md`](CHANGELOG.md) for version history.

## License

This project is licensed under the [MIT License](LICENSE). Copyright (c) 2026 ajiua.
