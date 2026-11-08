# Vela

Vertical video with an algorithm you can see and steer.

- **Feed:** full-screen vertical videos with For You and Following tabs. Swipe or scroll, tap to pause, double-tap to like.
- **Create:** upload a video (MP4, WebM or MOV, up to 50 MB), write a caption with #hashtags, then post.
- **React:** like, comment, save to favorites and repost. Follow creators.
- **Algorithm Control:** sliders and switches that really change the ranking:
  - *Content weighting*: the mix of Following, Your interests and New creators in your For You feed
  - *Engagement priority*: how much likes, comments, saves and reposts count
  - *Reach adjustment*: raise or lower how widely your own videos are recommended (−50% to +50%)
  - *Distribution rules*: followers first, recommend to non-followers, nearby audience only, allow reposts
- **Why you're seeing this:** every For You video shows the reasons and scores behind its ranking.
- **Also:** Discover (search and trending hashtags), Inbox (activity on your videos) and Profile (your videos, saved videos, edit profile).

---

## Put it online with Render

Vela lives in the `vela-app/` folder of the **akuvox-backend** repo, on the branch
`claude/gifted-albattani-gxfkrb`. The Resident Portal on `main` is not affected.
The folder includes a `render.yaml` file, so Render sets everything up for you.

1. Go to **https://dashboard.render.com** and sign in with GitHub.
2. Click **New +**, then **Blueprint**.
3. Pick the **akuvox-backend** repository and the branch `claude/gifted-albattani-gxfkrb`. If you don't see the repo, click **Configure account** and give Render access to it.
4. Set **Blueprint Path** to `vela-app/render.yaml`.
5. Render shows one web service called `vela-app`. Click **Apply** (or **Deploy Blueprint**).
6. Wait 3 to 5 minutes for the first build. Your app will be live at an address like `https://vela-app.onrender.com` (the exact address appears at the top of the service page).

After that, every push to that branch redeploys automatically.

### About the free plan

The blueprint uses Render's **free** plan:

- The server **sleeps after 15 minutes without visitors**. The next visit takes about a minute to wake it.
- **Accounts, uploads, likes and comments are erased** whenever the server restarts, sleeps or redeploys. The three intro videos from @vela always come back.

The app shows a notice about this on the sign-in screen.

### Keeping data permanently (paid)

1. On Render, open the `vela-app` service. Go to **Settings > Instance Type** and pick **Starter**.
2. Go to **Disks > Add Disk**. Use mount path `/var/data` and a size of 1 GB or more.
3. Go to **Environment**. Add `DATA_DIR` = `/var/data` and delete `STORAGE_MODE`.
4. Save. Render redeploys, and from then on data is kept.

### Using your own domain (optional)

On the service page, open **Settings > Custom Domains** and add a domain such as `vela.yourdomain.com`. Render shows a CNAME record. Add that record at your DNS provider (for example GoDaddy).

---

## Running it on a computer (for developers)

Requires Node.js 22 or newer.

```bash
npm install
npm start            # http://localhost:3000
npm test             # API tests
```

| Variable        | Default        | Purpose                                              |
| --------------- | -------------- | ---------------------------------------------------- |
| `PORT`          | `3000`         | Port to listen on (Render sets this)                 |
| `DATA_DIR`      | `./data`       | Where the database and uploaded videos are stored    |
| `STORAGE_MODE`  | (unset)        | `ephemeral` shows the "demo server" notice           |
| `MAX_UPLOAD_MB` | `50`           | Largest video someone can upload                     |

### How it's built

- `server/`: Express + SQLite (better-sqlite3). Covers accounts and sessions, uploads, interactions and the ranking in `server/ranking.js`.
- `public/`: plain HTML, CSS and JavaScript with no build step.
- `seed/`: three short intro videos for the official @vela account.
