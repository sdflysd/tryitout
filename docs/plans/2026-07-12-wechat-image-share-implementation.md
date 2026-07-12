# WeChat Image Share Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the share card's copy-only action with a WeChat-oriented image share flow that works on mobile and desktop without a WeChat API.

**Architecture:** Extract deterministic share text and browser share fallback logic into a helper module, then keep the React component focused on UI state and DOM poster capture. The component captures `#share-poster-card` as a PNG, asks the helper to share it through the best available browser capability, and falls back to copied text/downloaded image.

**Tech Stack:** React 19, TypeScript, Node test runner, `renderToStaticMarkup`, browser Web Share API, Clipboard API, `html-to-image` for DOM-to-PNG capture.

---

### Task 1: Add Share Strategy Tests

**Files:**
- Create: `frontend/src/components/share-card-sharing.ts`
- Modify: `frontend/src/components/ShareCard.test.tsx`

**Step 1: Write failing tests**

Add tests that import `sharePosterImageWithFallback` from `share-card-sharing.ts` and verify:

- native file sharing is used when `navigator.canShare({ files })` returns true;
- image clipboard is used when native file sharing is unavailable;
- download plus text clipboard is used when image clipboard is unavailable.

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/ShareCard.test.tsx
```

Expected: FAIL because `share-card-sharing.ts` does not exist.

**Step 3: Implement minimal helper**

Create `share-card-sharing.ts` with:

- `SharePosterOutcome` union;
- `SharePosterEnvironment` test seam;
- `sharePosterImageWithFallback(input, env)` that checks Web Share, then image clipboard, then download/text fallback.

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/components/ShareCard.test.tsx
```

Expected: PASS.

### Task 2: Extract Text Payload

**Files:**
- Modify: `frontend/src/components/share-card-sharing.ts`
- Modify: `frontend/src/components/ShareCard.tsx`
- Modify: `frontend/src/components/ShareCard.test.tsx`

**Step 1: Write failing test**

Add a test for `buildShareCardText(simulation)` that expects the same key content as the current clipboard payload: subject, probability, risk, recommended route if present, recommendation, and the first action plan item.

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/ShareCard.test.tsx
```

Expected: FAIL because `buildShareCardText` does not exist.

**Step 3: Implement text builder**

Move the existing text command construction into `buildShareCardText`. Keep the current simulation-specific copy and export the supporting copy functions already needed by tests.

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/components/ShareCard.test.tsx
```

Expected: PASS.

### Task 3: Capture Poster Image in Component

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/src/components/share-card-sharing.ts`
- Modify: `frontend/src/components/ShareCard.tsx`
- Modify: `frontend/src/components/ShareCard.test.tsx`

**Step 1: Add dependency**

Run:

```bash
npm install html-to-image
```

**Step 2: Write failing static render test**

Update the existing share card render test to expect the primary button text `一键分享到微信` and not `一键复制文字口令`.

**Step 3: Run test to verify it fails**

Run:

```bash
npm test -- src/components/ShareCard.test.tsx
```

Expected: FAIL because the old copy button text is still rendered.

**Step 4: Implement component flow**

In `ShareCard.tsx`:

- replace `copiedText` with a share status state;
- add a `useRef<HTMLDivElement>` to the poster card;
- on click, post the existing analytics event;
- call `renderSharePosterBlob(ref.current)`;
- pass the blob and text into `sharePosterImageWithFallback`;
- update button labels for preparing, native-share, fallback, and error states.

**Step 5: Run focused tests**

Run:

```bash
npm test -- src/components/ShareCard.test.tsx
```

Expected: PASS.

### Task 4: Verify Type Safety and Build Surface

**Files:**
- Verify only.

**Step 1: Run type check**

Run:

```bash
npm run lint
```

Expected: PASS.

**Step 2: Run focused tests again**

Run:

```bash
npm test -- src/components/ShareCard.test.tsx
```

Expected: PASS.

**Step 3: Review git diff**

Run:

```bash
git diff -- frontend/src/components/ShareCard.tsx frontend/src/components/ShareCard.test.tsx frontend/src/components/share-card-sharing.ts frontend/package.json frontend/package-lock.json
```

Expected: only the share image flow and related tests changed.
