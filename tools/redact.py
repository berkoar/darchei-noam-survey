# Blank every held comment in the responses before they are shown anywhere.
import hashlib, json, sys
COLS = ["Comment: current building", "Comment: one improvement", "Comment: building fund", "Comment: anything else"]
rows = json.load(open(sys.argv[1], encoding="utf-8"))
codes = json.load(open(sys.argv[2], encoding="utf-8"))
held = {c["hash"] for c in codes if c.get("held")}
n = 0
for r in rows:
    for col in COLS:
        text = str(r.get(col) or "").strip()
        if text and hashlib.sha256((col + "\u0001" + text).encode("utf-8")).hexdigest() in held:
            r[col] = ""
            n += 1
json.dump(rows, open(sys.argv[3], "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("rows", len(rows), "held back", n, "of", len(held), "held comments")
