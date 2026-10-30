# Add new theme tags to the comment codes; a "HOLD" tag stores only a hash of a held comment, never its text.
import hashlib, json, sys
codes = json.load(open(sys.argv[1], encoding="utf-8"))
new = json.load(open(sys.argv[2], encoding="utf-8"))
tags = json.load(open(sys.argv[3], encoding="utf-8"))
keys = {t["theme"] for t in json.load(open(sys.argv[4], encoding="utf-8"))}
problems = []
for c in new:
    got = tags.get(c["id"])
    if got is None:
        problems.append("no tags for id " + c["id"])
        continue
    picked = str(got).split()
    if "HOLD" in picked:
        if len(picked) > 1:
            problems.append("id %s mixes HOLD with themes; use HOLD alone" % c["id"])
        continue
    bad = [k for k in picked if k not in keys]
    if bad:
        problems.append("id %s has unknown theme(s) %s" % (c["id"], " ".join(bad)))
    if len(picked) > 3:
        problems.append("id %s has more than 3 themes" % c["id"])
if problems:
    sys.exit("STOP: " + "; ".join(problems))
excluded = held = 0
for c in new:
    picked = " ".join(dict.fromkeys(str(tags[c["id"]]).split()))
    if picked == "HOLD":
        digest = hashlib.sha256((c["question"] + "\u0001" + c["text"]).encode("utf-8")).hexdigest()
        codes.append({"question": c["question"], "hash": digest, "held": True, "themes": "", "quoteTheme": "", "quote": ""})
        held += 1
        continue
    excluded += picked == ""
    codes.append({"question": c["question"], "text": c["text"], "themes": picked, "quoteTheme": "", "quote": ""})
json.dump(codes, open(sys.argv[5], "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("tagged", len(new) - excluded - held, "held back", held, "left out as blank", excluded, "codes now", len(codes))
