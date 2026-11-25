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

## Student and tutor platform

The application now includes account sessions, server-enforced student/tutor roles, a public lab browser, tutor profiles, a tutor studio, guided lab authoring, and account-specific practice records.

Run `npm run dev` as usual (Vite serves the local API through its middleware). For a built app, run `npm run build` then `npm start` and open `http://127.0.0.1:3002/`. `npm run preview` also includes the local API. `PORT` changes the production server port; `DATA_DIR` changes the data directory.

### Tutor flow

1. Choose **Join / Sign in**, create an account, and select **Tutor**.
2. In **Tutor studio**, select **Create a lab**.
3. Choose one of seven circuit layouts: Ohm’s law, LED safety, RC charging, series resistance, parallel paths, voltage divider, or diode direction.
4. Set the supply voltage, target and tolerance, select the available components, and build a starting circuit. Add your teaching content, then **Save lab draft**.
5. Test component combinations in the live builder sandbox, run **Check lab solvability**, and optionally use the test setup as your starting circuit. Submit from the studio when ready.
6. Submission publishes immediately: the lab appears in **Browse labs** and on your public tutor profile. This MVP has no moderator approval queue.
7. Use **Unpublish** to return the lab to drafts before editing. Public listings and public profile pages hide drafts. Other tutors cannot access or change your drafts.
8. Open **My profile** to edit your name and teaching bio. Authored labs retain their attribution and use your current public name.

Tutors author circuit settings as well as teaching content. Each lab stores its selected topology, available components, initial component placement and polarity, supply voltage, supply controls, target, and tolerance. The deterministic engine applies the same configuration in the tutor sandbox, the student lab, and server-side practice validation. The seven supported topologies define the connections; this is a configurable circuit builder rather than an arbitrary node/wire editor. No new physical models are generated by AI.

### Student flow

1. Anyone can browse public labs, search by title or tutor, filter by simulation, and visit tutor profiles.
2. Create a **Student** account to practise and save activity.
3. Open a lab, read the learning outcomes and instructions, and select **Start practising**.
4. A dedicated 3D room containing only this lab’s bench and allowed parts opens. Use **Lab instructions** to revisit the tutor’s content without leaving the experiment.
5. Simulation attempts and successful circuit outcomes are saved per account and lab. **My practice** shows your history. A saved solved circuit is an activity milestone, not a scientifically validated mastery score. Each room contains one bench. Leave the room to select a different lab; the in-room bench picker and automatic cross-lab switching have been removed.

### Storage and access

Data lives in `.data/platform.json` (ignored by Git): users with salted scrypt password hashes, authored labs, and practice records. Passwords are never stored as plaintext or returned by the API. Public profiles return only the tutor’s public name, bio, role, and published labs. Sessions use random tokens in HttpOnly, SameSite cookies and are held in server memory; restarting the server requires signing in again, while users, labs, and practice records persist. Account roles are selected at registration and cannot be changed through profile editing. Local simulator state resets when the active account changes.

The API checks authentication, role, ownership, publication state, request origin, content limits, and circuit parameters. This remains a local prototype: public listings are public to users of the same running server, not automatically hosted on the internet. There is no email verification, password reset, content moderation, deployment, or multi-server database. Keep using the local server for demonstration; external hosting needs a production storage and session configuration.

The platform integration test uses disposable storage and checks student authoring restrictions, tutor ownership, draft privacy, publication, tutor profiles, server-calculated practice results, account isolation, cross-origin rejection, sign-in/out, and data recovery after restart.

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
