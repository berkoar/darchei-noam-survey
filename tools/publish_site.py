"""Copy the latest dashboard data into the site's data folder.

Comments held back as sensitive (codes marked "held") are blanked in the
responses and left out of the codes, so their text never reaches the site.

Usage: python3 -I tools/publish_site.py <responses.json> <codes.json> <themes.json> <data folder> [updatedAt]
updatedAt is the ISO 8601 UTC time of the data refresh; it defaults to now.
"""
import datetime, hashlib, json, os, shutil, sys

responses, codes, themes, out = sys.argv[1:5]
updated = sys.argv[5] if len(sys.argv) > 5 else datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
rows = json.load(open(responses, encoding="utf-8"))
for path in (codes, themes):
    json.load(open(path, encoding="utf-8"))
if not rows:
    sys.exit("STOP: no responses in " + responses)
COMMENTS = ["Comment: current building", "Comment: one improvement", "Comment: building fund", "Comment: anything else"]
code_rows = json.load(open(codes, encoding="utf-8"))
held = {c["hash"] for c in code_rows if c.get("held")}
blanked = 0
for r in rows:
    for col in COMMENTS:
        text = str(r.get(col) or "").strip()
        if text and hashlib.sha256((col + "\u0001" + text).encode("utf-8")).hexdigest() in held:
            r[col] = ""
            blanked += 1
os.makedirs(out, exist_ok=True)
with open(os.path.join(out, "survey-responses.json"), "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
with open(os.path.join(out, "comment-codes.json"), "w", encoding="utf-8") as f:
    json.dump([c for c in code_rows if not c.get("held")], f, ensure_ascii=False, separators=(",", ":"))
themes_out = os.path.join(out, "comment-themes.json")
if os.path.abspath(themes) != os.path.abspath(themes_out):
    shutil.copyfile(themes, themes_out)
with open(os.path.join(out, "meta.json"), "w", encoding="utf-8") as f:
    json.dump({"updatedAt": updated, "responses": len(rows)}, f)
print("site data written", len(rows), "responses, updated", updated, "| held comments blanked", blanked)
