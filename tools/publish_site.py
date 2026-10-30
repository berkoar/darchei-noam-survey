"""Copy the latest dashboard data into the site's data folder.

Usage: python3 -I tools/publish_site.py <responses.json> <codes.json> <themes.json> <data folder> [updatedAt]
updatedAt is the ISO 8601 UTC time of the data refresh; it defaults to now.
"""
import datetime, json, os, shutil, sys

responses, codes, themes, out = sys.argv[1:5]
updated = sys.argv[5] if len(sys.argv) > 5 else datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
rows = json.load(open(responses, encoding="utf-8"))
for path in (codes, themes):
    json.load(open(path, encoding="utf-8"))
if not rows:
    sys.exit("STOP: no responses in " + responses)
os.makedirs(out, exist_ok=True)
shutil.copyfile(responses, os.path.join(out, "survey-responses.json"))
shutil.copyfile(codes, os.path.join(out, "comment-codes.json"))
shutil.copyfile(themes, os.path.join(out, "comment-themes.json"))
with open(os.path.join(out, "meta.json"), "w", encoding="utf-8") as f:
    json.dump({"updatedAt": updated, "responses": len(rows)}, f)
print("site data written", len(rows), "responses, updated", updated)
