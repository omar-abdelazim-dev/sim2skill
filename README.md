# Sim2Skill (React)

Home: three accessible experiment cards beside a dedicated chat with Nour. A compact introduction, clear objectives, estimated experiment times, and direct lab entry help students get started. The optional **Explore the lab gallery** panel retains the animated 3D ring without covering the chat or the experiments. The page scrolls naturally and stacks on narrow screens; no simulated loading intro is required.

## Run it
```
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm test           # circuit formulas, builder, guide, and platform integration checks
```
Open the built site through a server (`npm run preview`), not by double-clicking dist/index.html.

## Where things are
| Path | What it is |
| --- | --- |
| `src/App.jsx` | Nav, routing (#home, #lab, #dashboard), role-aware navigation and lab entry |
| `src/home/Home.jsx` | Homepage introduction, experiment cards, instructor panel, optional gallery |
| `src/home/home.css` | Responsive homepage styles |
| `src/home/guide.js` | Offline lab routing and roadmap answers |
| `src/home/Ring.jsx` | The ring of lab cards: geometry, spin, drag, wheel, hover tilt |
| `src/home/CardFace.jsx` | Drawn previews for each lab card |
| `src/home/Chat.jsx` | Chat with Nour: Claude when available, keyword answers otherwise |
| `src/labs.js` | The lab list (7 live, 7 coming soon) |
| `src/lab/core.js` | Simulator, mistake detector, hint ladder |
| `src/lab/store.js` | Lab state and actions shared by React and the 3D scene |
| `src/lab/scene3d.js` | The three.js lab room |
| `src/lab/LabView.jsx`, `Dashboard.jsx` | Lab panels and the instructor dashboard |

## The chat's AI
You can chat with Nour on the home page and inside every lab (the box under her messages). Both
chats go through `src/nour.js`, which tries three sources in order:

1. **Claude inside claude.ai**: the artifact's `sample` capability.
2. **The local server with Google Gemini**: `POST /api/nour` in `server/platform.mjs`, used when
   `GEMINI_API_KEY` is set. The key stays on the server, and the browser never sees it.
3. **Offline answers**: keyword matching on the home page, and in labs, answers built from the live bench
   state (goal, readings, the detected mistake, and the hint ladder).

In a lab, Nour's prompt carries the simulator's real state (`labContext()` in `src/lab/store.js`), so she
talks about the student's actual circuit and is told never to invent readings. The prompts live in
`shared/nourPrompt.js`.

To turn on Gemini answers, copy `.env.example` to `.env` in the project folder and paste your key from
Google AI Studio after `GEMINI_API_KEY=`. `.env` is git-ignored, so the key is never committed. Restart
`npx vite --host` after changing it. A key set in the shell (`$env:GEMINI_API_KEY="..."`) also works and
takes priority. The default model is `gemini-3.5-flash-lite`; set `GEMINI_MODEL` to use another.

If Gemini fails or is busy, Nour falls back to the offline answers. The server limits each IP to 60 Nour requests per 10 minutes.

## Platform (v2)

Requires **Node 22.13 or newer** (the server uses Node's built-in `node:sqlite`). Run `npm install && npm run dev`, or `npm run build && npm start` and open `http://127.0.0.1:3002/`. `PORT` changes the production port and `DATA_DIR` the data folder. Settings go in a git-ignored `.env` (copy `.env.example`): `GEMINI_API_KEY`, `GEMINI_MODEL`, `DEMO_MODE`, `PAYMENT_PROVIDER`, `ADMIN_EMAILS`, `COOKIE_SECURE`, `MOCK_WEBHOOK_SECRET`.

If your network inspects HTTPS (Node errors like `UNABLE_TO_VERIFY_LEAF_SIGNATURE`), start with `NODE_OPTIONS=--use-system-ca` so Node trusts the Windows certificate store.

### Accounts and creating labs

There are no student or tutor roles any more: **every account can practise and create labs** in the **Lab studio**. Administrators are set with `ADMIN_EMAILS` and only moderate. New accounts get a 14-day Pro trial.

1. **Lab studio → Create a lab**: pick a simulation, set its parameters, write the teaching content and choose **Public** or **Private**.
2. **Private** labs get an 8-character access code (or your own 6–64 character password). It is shown once; the studio can make a new one, remove everyone's access, and list who has access.
3. **Submit** publishes a new immutable version. Practice records point at the version the student used. **Unpublish** returns the lab to drafts for editing.
4. Anyone signed in can **report** a lab. Admins review reports at `#admin` and can take a lab down (the creator is notified) or restore it.

### Following and notifications

Open any creator's profile and press **Follow**: no approval needed. When they publish a **public** lab for the first time, followers get a notification in the bell (polled every 30 seconds). Private labs notify nobody. You can mute a creator's notifications or block a user.

### Plans and payments

Plans, prices and limits are data in `shared/plans.js`: Free ($0: 2 public labs, titration only, 10 Nour questions a day), Pro ($10/month, $30/semester, $80/year: unlimited and private labs, all chemistry engines, 100 Nour questions a day) and Organization ($30 per seat per year for 25–199 seats, $20 for 200–999, custom above; 30-day pilot with 25 seats). Egypt and MENA students see 40% of list price.

No real money is taken yet and no card data ever reaches the server. `PAYMENT_PROVIDER=manual` (default) lets admins grant Pro or create activation codes; `PAYMENT_PROVIDER=mock` adds a test checkout that goes through the same signed, idempotent webhook a real gateway would use. Disabled stubs in `server/billing/providers.mjs` document where Paymob or a merchant of record would plug in. `DEMO_MODE=1` unlocks everything for judges.

Organizations: start a pilot from **Plans**, then invite members by email (pending invites are accepted when that email signs up) or share a join code. The organization page shows seats, members, usage, and an invoice request form.

### Storage and security

Data lives in SQLite at `.data/platform.db` (git-ignored) with versioned migrations in `server/migrations/`. On first start, an old `.data/platform.json` is imported (password hashes unchanged) and renamed `platform.json.migrated`. Sessions persist across restarts; only a SHA-256 of each session token is stored. Passwords and access codes use scrypt with `timingSafeEqual`. Sign-in, access codes, reports, checkout and Nour are rate limited per user (or per IP when signed out); wrong access codes lock that lab for 15 minutes after 5 tries. Every route that returns or uses a lab applies the same visibility rule on the server (`VISIBLE_SQL` in `server/lib.mjs`). See `docs/architecture.md` for the schema.

## Circuit builder and expanded electronics

The tutor studio includes **Circuit & components**, **Teaching content**, and **Test your lab** tabs. In the sandbox, click a slot and a component or drag a part onto a compatible slot. Change the test supply, flip polarized parts, adjust variable resistance, run a measurement, reset the test, or choose **Use as starting circuit**. Save your draft to persist it. Testing a solution does not silently change the saved starter. Saving validates the configuration; publication additionally rejects configurations for which the solver cannot find a safe solution using the permitted parts and supply controls.

A quick authored-lab demo:

1. Create a voltage-divider lab. Set the fixed supply to **9 V**, target to **6 V**, and tolerance to **5%**.
2. Allow **1 kΩ** for R1 and **2 kΩ** for R2. Leave the starting slots empty or place R1 to scaffold the exercise.
3. In the sandbox, place both parts and run: output is **6 V**, current is **3 mA**.
4. Add the title, description, outcomes, and instructions; check solvability, save, and submit.
5. Open the published lab as a student. Its own room has the configured supply, palette, starter, and six-volt goal. It does not share other experiment benches.

Available parts: a wire, fourteen fixed resistor values from **47 Ω to 100 kΩ**, an **adjustable 100 Ω–10 kΩ resistor**, red/green/blue LEDs, a silicon diode, and seven capacitor values from **1 µF to 1000 µF**. The supply, switch, ammeter, output-voltage readings, and RC scope are included instruments. The adjustable resistor is available in R1; R2 uses fixed resistors.

Models: ideal DC resistance networks; 2.0/2.2/3.2 V fixed forward drops for red/green/blue LEDs; a 0.7 V silicon diode with ideal reverse blocking; unloaded voltage dividers; exponential RC charging with τ = RC. Resistors use a 0.25 W safety ceiling in authored labs. LED ratings remain 2–20 mA, with simulated failure above 30 mA. Silicon-diode overloads are diagnosed without persistent damage modeling. Component thermal transients, diode reverse breakdown, arbitrary networks, and AC behavior are not modeled. RC plots scale their voltage and time axes to the chosen supply and five time constants.

Separate-room lifecycle: selecting a lab loads a fresh starting circuit and that lab’s component palette; the 3D scene creates one station, and returning to another lab mounts a new scene. GPU resources are disposed on exit. **Orbit**, **Walk**, and **Schematic** views remain available. If WebGL initialization fails, the lab switches to the interactive schematic. Updated visual/3D browser QA remains unverified because the browser access host is unavailable; use schematic view if your device cannot render WebGL.

Existing `.data/platform.json` files are migrated additively with the new built-in labs. Accounts, authored content, and practice records are retained. Older tutor drafts can be opened in the builder to add a circuit configuration.
