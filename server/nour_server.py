"""Nour's backend: one chat endpoint that answers questions and reads circuit photos.

Run from this folder:
    pip install fastapi "uvicorn[standard]" python-multipart google-genai
    echo GEMINI_API_KEY=your_key> .env
    python -m uvicorn nour_server:app --port 8000

POST /api/nour  (multipart)
    messages: JSON list of {"role": "user" | "nour", "text": "..."}   (last item is the new student message)
    image:    optional JPG/PNG/WebP of a circuit
returns {"reply": str, "open_lab": "ohm" | "led" | "rc" | null, "netlist": {...} | null}
"""
import json
import os
import re
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

ROOT = Path(__file__).parent


def _load_env_file():
    f = ROOT / ".env"
    if not f.exists():
        print(f"[nour] No .env at {f}. Create it there or set GEMINI_API_KEY.")
        return
    raw = f.read_bytes()
    text = raw.decode("utf-16") if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else raw.decode("utf-8-sig", errors="ignore")
    for line in text.splitlines():
        line = line.strip()
        if line.lower().startswith("export "):
            line = line[7:]
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            if v and not os.environ.get(k.strip()):
                os.environ[k.strip()] = v
    print(f"[nour] Loaded {f}; GEMINI_API_KEY {'found' if os.environ.get('GEMINI_API_KEY') else 'NOT found'}")


_load_env_file()

MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
ACCESS_CODE = os.environ.get("NOUR_ACCESS_CODE", "")          # optional: students must send this in x-access-code
ORIGINS = [o.strip() for o in os.environ.get("NOUR_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
RATE_PER_MIN = int(os.environ.get("NOUR_RATE_PER_MIN", "20"))
MAX_BYTES = 8 * 1024 * 1024
ALLOWED = {"image/jpeg", "image/png", "image/webp"}
TYPES = ["battery", "resistor", "led", "diode", "capacitor", "inductor", "switch", "ammeter", "voltmeter", "lamp", "current_source", "wire", "other"]

SYSTEM = f"""You are Nour, the AI lab instructor inside Sim2Skill, a virtual electronics lab for university students in Egypt.
Reply in the student's language (Egyptian Arabic, standard Arabic, French and English are all fine). Warm, direct, plain sentences, no markdown headings.

Three guided labs exist: "ohm" (Ohm's law, 10 mA target), "led" (LED with a resistor, 9 V battery) and "rc" (RC charging to 63% of 5 V in 1 s).
There is also a free bench that can build any circuit from a photo.

Answer every kind of question the student asks: electronics concepts, homework, how to use the lab, study advice. Keep ordinary answers under 90 words.
If the student wants one of the three guided labs, set "open_lab" to its id and say in one sentence that you are taking them there.

If an image of a circuit is attached (hand-drawn, printed, textbook figure or breadboard photo):
1. Read it into a netlist and put it in "netlist".
2. In "reply", explain the circuit to the student in plain language (what it does, how the current flows, then the key steps and the answer if a question is printed in the picture). Up to 150 words. Do the maths with the values shown.
3. End the reply by telling the student the circuit is ready to open on the lab bench.
If the image is not a circuit, say so, set "netlist" to null, and help with what it shows.

Return ONLY a JSON object, no prose around it:
{{"reply": "...", "open_lab": null, "netlist": null}}
or, for a circuit image:
{{"reply": "...", "open_lab": null, "netlist": {{
  "title": "short title", "summary": "one or two sentences", "ground_net": "0",
  "components": [{{"id": "R1", "type": "resistor", "value": "330 ohm", "nodes": ["n1", "n2"], "state": null, "polarized": false}}],
  "steps": ["short step-by-step solution, one string per step"], "answer": "final answer if the picture asks a question, else null",
  "uncertain": ["anything unclear or guessed"]}}}}

Netlist rules:
- "type" is one of: {", ".join(TYPES)}. Exactly two entries in "nodes" per component. Wires that touch share one net name.
- Node order: battery ["+","-"]; led/diode ["anode","cathode"]; polarized capacitor ["+","-"]; current_source ["start","end"] so the arrow points from the first node to the second.
- "0" is ground, or the negative terminal of the main supply if no ground is drawn; set "ground_net" to it. Other nets: "n1", "n2", ...
- "value" keeps the printed units, for example "9 V", "1 kohm", "100 uF", "4 A". Use null if not shown. A switch has "state": "open" or "closed".
- Never invent parts. Put doubts in "uncertain".
"""

app = FastAPI(title="Nour backend")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["POST", "GET"], allow_headers=["x-access-code", "content-type"])

_hits = defaultdict(deque)


def _rate_limit(ip):
    now = time.time(); q = _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_PER_MIN:
        raise HTTPException(429, "Too many requests. Wait a minute and try again.")
    q.append(now)


def call_model(history, image, mime):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise HTTPException(500, "GEMINI_API_KEY is not set on the server.")
    from google import genai
    from google.genai import types
    transcript = "\n".join(("Student: " if m["role"] == "user" else "Nour: ") + m["text"] for m in history[-12:])
    parts = []
    if image:
        parts.append(types.Part.from_bytes(data=image, mime_type=mime))
    parts.append(f"{SYSTEM}\n\nConversation so far:\n{transcript}\n\nWrite Nour's next reply as the JSON object.")
    client = genai.Client(api_key=key)
    resp = client.models.generate_content(model=MODEL, contents=parts,
                                          config=types.GenerateContentConfig(temperature=0.2, response_mime_type="application/json"))
    return resp.text or ""


def parse_reply(text, had_image):
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.I)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            return {"reply": text[:600] or "Sorry, I could not answer that.", "open_lab": None, "netlist": None}
        data = json.loads(m.group(0))
    lab = data.get("open_lab") if data.get("open_lab") in ("ohm", "led", "rc") else None
    net = None
    raw = data.get("netlist")
    if had_image and isinstance(raw, dict):
        comps = []
        for i, c in enumerate(raw.get("components") or []):
            nodes = [str(n) for n in (c.get("nodes") or [])][:2]
            if len(nodes) != 2:
                continue
            t = str(c.get("type", "other")).lower()
            comps.append({"id": str(c.get("id") or f"X{i + 1}"), "type": t if t in TYPES else "other", "value": c.get("value"),
                          "nodes": nodes, "state": c.get("state"), "polarized": bool(c.get("polarized"))})
        if comps:
            net = {"title": raw.get("title") or "Circuit", "summary": raw.get("summary") or "", "ground_net": str(raw.get("ground_net") or "0"),
                   "components": comps, "steps": [str(s) for s in (raw.get("steps") or [])], "answer": raw.get("answer"),
                   "uncertain": [str(u) for u in (raw.get("uncertain") or [])]}
    return {"reply": str(data.get("reply") or "").strip() or "Okay.", "open_lab": lab, "netlist": net}


@app.post("/api/nour")
async def nour(request: Request, messages: str = Form(...), image: UploadFile = File(None)):
    if ACCESS_CODE and request.headers.get("x-access-code") != ACCESS_CODE:
        raise HTTPException(401, "Wrong or missing access code.")
    ip = request.client.host if request.client else "?"
    _rate_limit(ip)
    try:
        history = [{"role": "user" if m.get("role") == "user" else "nour", "text": str(m.get("text", ""))[:2000]} for m in json.loads(messages)]
    except Exception:
        raise HTTPException(400, "messages must be a JSON list of {role, text}.")
    if not history or history[-1]["role"] != "user":
        raise HTTPException(400, "The last message must be from the student.")
    data, mime = None, None
    if image is not None and image.filename:
        mime = (image.content_type or "").lower()
        if mime not in ALLOWED:
            raise HTTPException(415, "Upload a JPG, PNG or WebP image.")
        data = await image.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "Image is larger than 8 MB.")
    t0 = time.time()
    try:
        text = call_model(history, data, mime)
    except HTTPException:
        raise
    except Exception as e:
        print(f"[nour] model error for {ip}: {e}")
        raise HTTPException(502, "Nour could not reach the AI model right now. Try again in a moment.")
    out = parse_reply(text, data is not None)
    print(f"[nour] {ip} image={data is not None} netlist={'yes' if out['netlist'] else 'no'} {time.time() - t0:.1f}s")
    return JSONResponse(out)


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL, "key": bool(os.environ.get("GEMINI_API_KEY"))}
