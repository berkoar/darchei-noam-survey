# Turn the Jotform response sheet (CSV) into survey-responses.json, dropping names, emails, IPs, submission IDs and edit links.
import csv, json, sys
COLS = [
 ("Submitted", "Submission Date", None),
 ("Membership", "Which best describes you?", None),
 ("Why not a member", "What are the main reasons you are not currently a member?", ["I belong to another shul", "I'm new to the community", "The cost of membership", "The building feels too crowded or short on space", "The programming doesn't fit my needs right now", "I haven't been asked or don't know how to join"]),
 ("Would join with more space", "If Darchei Noam had more space, how likely would you be to become a member?", None),
 ("Years in community", "How long have you been part of the Darchei Noam community?", None),
 ("Gender", "What is your gender?", None),
 ("Children at home", "What are the ages of the children living in your home?", None),
 ("Shabbat mornings a month", "In a typical month, how many Shabbat mornings", None),
 ("Usual minyan", "Which Shabbat morning minyan do you attend most often?", None),
 ("Davens elsewhere at", "When you don't daven at Darchei Noam on Shabbat morning", ["Shomrei Torah", "A house minyan", "Another shul in Fair Lawn", "I'm usually away for Shabbat", "I usually daven at home"]),
 ("Why elsewhere", "What are the main reasons you daven elsewhere on Shabbat?", ["Not enough room or seats", "Noise during davening", "The minyan times don't work for me", "The length of davening", "Family or friends daven there", "Programming for my children", "Walking distance", "Doesn't apply; I'm usually away or daven at home"]),
 ("Shabbat activities", "Which of the following do you or your family take part in on a typical Shabbat?", None),
 ("Crowding changed plans", "In the past year, how often has crowding", None),
 ("Hosted a simcha", "In the past three years, have you hosted", None),
 ("Hosted what", "What did you host?", ["Bar or bat mitzvah", "Kiddush", "Aufruf", "Sheva brachot", "Bris, simchat bat or shalom zachor", "Engagement or wedding-related event"]),
 ("Hosted where", "Where did you host it?", ["At Darchei Noam", "At home", "At another shul", "At a hall, restaurant or other venue"]),
 ("Why not at Darchei Noam", "What kept you from hosting at Darchei Noam?", ["Not enough space for our guests", "Kitchen or catering limits", "The date wasn't available", "Cost", "The space wasn't right for this kind of event"]),
 ("Bar/bat mitzvah in 10 years", "Do you expect to celebrate a bar or bat mitzvah", None),
 ("Would rent larger space", "If Darchei Noam had a larger event space", None),
 ("Guests needed", "If you were hosting a bar or bat mitzvah, about how many guests", None),
 ("Top three areas", "If we can only prioritize a few areas", None),
 ("Sanctuary seating", "Our Main Sanctuary currently seats", None),
 ("Outcomes", "Which outcomes matter most to you for Darchei Noam's future?", ["A better davening experience.", "More comfortable and welcoming Shabbat and Yom Tov gatherings.", "Better facilities and programming for children and youth.", "More opportunities for Torah learning and smaller gatherings.", "Stronger social connection and community life.", "Better support for weekday minyanim and activities.", "Greater accessibility and ease of use.", "The ability to host simchas and events at the shul.", "Room for more members and families to join."]),
 ("Fund familiarity", "How familiar are you with the building fund?", None),
 ("Knew $10,000 ask", "Before this survey, did you know that the building fund", None),
 ("Household contributed", "Has your household contributed to the building fund so far?", None),
 ("Likely to give", "Once the plans are finalized, how likely are you to give", None),
 ("Would help giving", "What would make you more likely to give to the building project?", ["Seeing the final plans and renderings", "A clear budget and timeline", "Knowing how much has been raised so far", "Regular progress updates", "Multi-year pledges or flexible payment options", "Dedication or naming opportunities", "A personal conversation with a committee member", "Do not intend to make additional contributions"]),
 ("Update channels", "How would you like to receive updates about the building project?", ["Weekly bulletin", "WhatsApp", "Dedicated email updates", "In-shul signage", "Town halls"]),
 ("Update types", "Which kinds of updates would be most useful to you right now?", ["Renderings and floor plans", "The construction timeline", "Fundraising progress", "Budget and costs", "Chances to give input, such as town halls", "Building walkthroughs or site visits", "Q&A sessions with the committee"]),
 ("Age", "What is your age range?", None),
 ("Walk", "Approximately how long does it take you to walk to Darchei Noam?", None),
 ("Comment: current building", "Is there anything else about our current building", None),
 ("Comment: one improvement", "Thinking about how you use Darchei Noam, what is the one improvement", None),
 ("Comment: building fund", "Do you have any questions or concerns about the building fund", None),
 ("Comment: anything else", "Is there anything else you'd like us to consider", None),
]
GRIDS = [
 ("Problem: ", "How much of a problem is each of the following for you or your family? >> "),
 ("Importance: ", "How important is each of the following spaces or features to you in the expansion plans? >> "),
 ("Agree: ", "How much do you agree with each statement? >> "),
]
table = list(csv.reader(open(sys.argv[1], encoding="utf-8-sig", newline="")))
header, body = table[0], table[1:]
picks = []
for name, prefix, options in COLS:
    idx = next((i for i, h in enumerate(header) if h.startswith(prefix)), None)
    if idx is None:
        sys.exit('STOP: the sheet has no column starting "%s"' % prefix)
    picks.append((name, idx, options))
for label, gp in GRIDS:
    for i, h in enumerate(header):
        if h.startswith(gp):
            picks.append((label + h[len(gp):], i, None))
def clean(value, options):
    v = (value or "").strip()
    if not options or v == "":
        return v
    out = []
    for line in [s.strip() for s in v.split("\n") if s.strip()]:
        kept = line if line in options else "Other"
        if kept not in out:
            out.append(kept)
    return "\n".join(out)
rows = []
for r in body:
    if not any((c or "").strip() for c in r):
        continue
    row = {name: clean(r[idx] if idx < len(r) else "", opts) for name, idx, opts in picks}
    row["Submitted"] = row["Submitted"][:10]
    rows.append(row)
json.dump(rows, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("rows", len(rows), "columns", len(picks))
