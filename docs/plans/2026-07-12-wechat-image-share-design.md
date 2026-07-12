# WeChat Image Share Design

## Context

The current share card modal copies a text command to the clipboard. The user wants the action to feel like one-click sharing to WeChat, but the app does not have a WeChat Open Platform integration.

Without the WeChat SDK or a backend media flow, a web page cannot silently send content to a specific WeChat chat or Moments. The closest reliable experience is to generate a share image, invoke the browser or operating-system share sheet when available, and fall back to copying or downloading the same content.

## Goals

- Replace the copy-first action with a WeChat-first sharing action.
- Generate a PNG from the visible poster card so the user can share an image instead of plain text.
- Support both mobile and desktop browsers.
- Keep the existing share analytics event.
- Preserve the existing text command as a fallback.

## Recommended Approach

Use client-side poster rendering with DOM-to-canvas capture. When the user clicks the share button:

1. Build the existing text share payload.
2. Capture `#share-poster-card` as a PNG `File`.
3. On browsers that support `navigator.share()` with files, call the system share sheet with the PNG and text so mobile users can choose WeChat.
4. On desktop or unsupported browsers, copy the PNG to the clipboard when supported.
5. If image clipboard is unavailable, download the PNG and copy the text command.

This gives mobile users the most native WeChat path available without an SDK, and gives desktop users an asset they can paste or send in WeChat Desktop.

## UI

- Rename the primary button to "一键分享到微信".
- Use a WeChat-oriented action state:
  - Default: "一键分享到微信"
  - Preparing: "正在生成图片..."
  - Native share opened: "请选择微信发送"
  - Fallback ready: "图片已生成，去微信发送"
  - Error fallback: "已复制文字，去微信粘贴"
- Keep the button layout compact and icon-led.
- Keep the existing poster visual design unchanged.

## Error Handling

- If PNG generation fails, copy the existing text payload and show the text fallback state.
- If system share is cancelled or rejected, do not treat that as a hard app error. Provide the desktop fallback path.
- Clipboard writes may fail on insecure origins or unsupported browsers, so download remains the final fallback.

## Testing

- Unit-test copy selection and button copy changes through static rendering.
- Unit-test the share strategy helper so mobile file-share, image clipboard, and download/text fallback paths are deterministic without relying on a real browser.
- Run the existing component test file and TypeScript check.
