# Universal Image Viewer

A small website that accepts public ImgBB, Imgur, and direct image URLs, then resolves and displays the image.

## Run locally

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run:

```bash
npm install
npm start
```

4. Open:

```text
http://localhost:3000
```

## Deploy on Render

- Create a new Web Service.
- Upload this project to GitHub.
- Build Command: `npm install`
- Start Command: `npm start`
- Environment: Node
- Render will provide the public URL.

## Important limitations

- The first version supports ImgBB and Imgur domains.
- Only public, accessible images can be resolved.
- Private, deleted, expired, login-protected, anti-bot-protected, or hotlink-blocked images may fail.
- The resolver uses public page metadata such as `og:image`; it does not bypass authentication or access controls.
- Add more domains to `ALLOWED_HOSTS` only after implementing strict validation and SSRF protection.
