# List written comments that have no themes yet (held comments count as done).
import hashlib, json, sys
COLS = ["Comment: current building", "Comment: one improvement", "Comment: building fund", "Comment: anything else"]
BLANK = {"", "n/a", "na", "no", "none", "nope", "-"}
rows = json.load(open(sys.argv[1], encoding="utf-8"))
codes = json.load(open(sys.argv[2], encoding="utf-8"))
key = lambda col, text: col + "\u0001" + text
digest = lambda k: hashlib.sha256(k.encode("utf-8")).hexdigest()
done = {key(c["question"], str(c["text"]).strip()) for c in codes if "text" in c}
held = {c["hash"] for c in codes if c.get("held")}
out, seen = [], set()
for col in COLS:
    for r in rows:
        text = str(r.get(col) or "").strip()
        k = key(col, text)
        if text.lower() in BLANK or k in done or k in seen or digest(k) in held:
            continue
        seen.add(k)
        out.append({"id": str(len(out) + 1), "question": col, "text": text})
json.dump(out, open(sys.argv[3], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("untagged comments", len(out))
