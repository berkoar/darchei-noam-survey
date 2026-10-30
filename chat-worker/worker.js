// Darchei Noam survey chat: a Cloudflare Worker that answers questions about the
// survey data with Claude. The Anthropic API key lives only in this Worker's
// secret ANTHROPIC_API_KEY; it is never in this repository or the web page.

const SITE_ORIGIN = 'https://berkoar.github.io';
const DATA_URL = SITE_ORIGIN + '/darchei-noam-survey/data/';
const MODEL = 'claude-sonnet-5-5';
const MAX_MESSAGES = 12;           // conversation turns sent per request
const MAX_QUESTION_CHARS = 1500;   // longest question accepted
const MAX_TOOL_ROUNDS = 8;         // data lookups per answer
const PER_IP_PER_HOUR = 30;        // questions per visitor per hour
const MIN_GROUP_FOR_COMMENTS = 5;  // smallest filtered group whose comments are shown

const COMMENT_COLS = ['Comment: current building', 'Comment: one improvement', 'Comment: building fund', 'Comment: anything else'];
const BLANK = new Set(['', 'n/a', 'na', 'no', 'none', 'nope', '-']);

const TOOLS = [
  {
    name: 'tabulate',
    description: 'Count the answers to one multiple-choice or rating question, optionally only for respondents matching filters, and optionally split into groups by another question. Returns, for each answer, the count and its share of the people in that group who answered. For "pick several" questions one person can count toward several answers.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Exact question name from the question list.' },
        by: { type: 'string', description: 'Optional. Exact question name to split respondents into groups by (for example "Membership" or "Children at home").' },
        filters: {
          type: 'array',
          description: 'Optional. Keep only respondents matching every filter.',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'Exact question name.' },
              any_of: { type: 'array', items: { type: 'string' }, description: 'Keep respondents who gave at least one of these exact answers.' },
              exclude: { type: 'boolean', description: 'If true, keep respondents who gave none of these answers instead.' },
            },
            required: ['question', 'any_of'],
          },
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'get_comments',
    description: 'Read written comments, optionally only from one of the four comment questions, only those tagged with one theme, and only from respondents matching filters. Returns the total number matching and a page of comments with their question and themes. Use limit 0 to just count.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', enum: COMMENT_COLS, description: 'Optional. One comment question.' },
        theme: { type: 'string', description: 'Optional. A theme key from the theme list.' },
        filters: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, any_of: { type: 'array', items: { type: 'string' } }, exclude: { type: 'boolean' } }, required: ['question', 'any_of'] } },
        limit: { type: 'integer', description: 'How many comments to return, 0 to 40. Default 20.' },
        offset: { type: 'integer', description: 'How many to skip, for paging. Default 0.' },
      },
    },
  },
];

let cache = null;
const hits = new Map();

const vals = (row, col) => String(row[col] ?? '').split('\n').map((s) => s.trim().replace(/\\'/g, "'")).filter(Boolean);
const round = (x) => Math.round(x * 1000) / 1000;

async function loadData() {
  if (cache && Date.now() - cache.at < 5 * 60 * 1000) return cache;
  const slot = Math.floor(Date.now() / 300000);
  const get = (name) => fetch(DATA_URL + name + '?t=' + slot, { cf: { cacheTtl: 300 } }).then((r) => {
    if (!r.ok) throw new Error('Could not load ' + name + ' (' + r.status + ')');
    return r.json();
  });
  const [rows, codes, themes, meta] = await Promise.all([
    get('survey-responses.json'), get('comment-codes.json'), get('comment-themes.json'), get('meta.json'),
  ]);
  cache = { at: Date.now(), rows, codes, themes, meta, schema: buildSchema(rows) };
  return cache;
}

function buildSchema(rows) {
  const cols = Object.keys(rows[0] || {});
  return cols.map((c) => {
    if (COMMENT_COLS.includes(c)) {
      return { question: c, type: 'written comment (use get_comments)', answered: rows.filter((r) => !BLANK.has(String(r[c] || '').trim().toLowerCase())).length };
    }
    const counts = new Map();
    let multi = false;
    let answered = 0;
    for (const r of rows) {
      const v = vals(r, c);
      if (v.length) answered += 1;
      if (v.length > 1) multi = true;
      v.forEach((x) => counts.set(x, (counts.get(x) || 0) + 1));
    }
    const entry = { question: c, type: multi ? 'pick several' : 'pick one', answered };
    if (c !== 'Submitted') entry.answers = [...counts.keys()];
    else entry.note = 'Submission date, YYYY-MM-DD';
    return entry;
  });
}

function checkQuestion(data, q) {
  if (!data.schema.some((s) => s.question === q)) throw new Error('Unknown question "' + q + '". Use an exact name from the question list.');
}

function applyFilters(data, filters) {
  if (!Array.isArray(filters) || filters.length === 0) return data.rows;
  filters.forEach((f) => checkQuestion(data, f.question));
  return data.rows.filter((r) => filters.every((f) => {
    const hit = vals(r, f.question).some((x) => (f.any_of || []).includes(x));
    return f.exclude ? !hit : hit;
  }));
}

function summarize(rows, question) {
  const answered = rows.filter((r) => vals(r, question).length);
  const counts = {};
  answered.forEach((r) => vals(r, question).forEach((v) => { counts[v] = (counts[v] || 0) + 1; }));
  return {
    respondents_in_group: rows.length,
    answered: answered.length,
    answers: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([answer, n]) => ({ answer, n, share_of_answered: answered.length ? round(n / answered.length) : 0 })),
  };
}

function tabulate(data, input) {
  const { question, by, filters } = input || {};
  checkQuestion(data, question);
  if (COMMENT_COLS.includes(question)) throw new Error('That is a written comment question. Use get_comments.');
  const pool = applyFilters(data, filters);
  if (!by) return { question, filters: filters || [], ...summarize(pool, question) };
  checkQuestion(data, by);
  const groups = new Map();
  pool.forEach((r) => vals(r, by).forEach((g) => {
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }));
  return { question, by, filters: filters || [], groups: [...groups].map(([group, rows]) => ({ group, ...summarize(rows, question) })) };
}

function getComments(data, input) {
  const { question, theme, filters } = input || {};
  const limit = Math.max(0, Math.min(40, Number.isInteger(input && input.limit) ? input.limit : 20));
  const offset = Math.max(0, Number.isInteger(input && input.offset) ? input.offset : 0);
  if (question && !COMMENT_COLS.includes(question)) throw new Error('question must be one of: ' + COMMENT_COLS.join('; '));
  const pool = applyFilters(data, filters);
  if (Array.isArray(filters) && filters.length && pool.length < MIN_GROUP_FOR_COMMENTS) {
    return { error: 'Only ' + pool.length + ' respondents match these filters. To protect privacy, comments are only shown for groups of ' + MIN_GROUP_FOR_COMMENTS + ' or more.' };
  }
  if (theme && !data.themes.some((t) => t.theme === theme)) throw new Error('Unknown theme "' + theme + '".');
  const tagsOf = new Map(data.codes.map((c) => [c.question + '\u0001' + String(c.text).trim(), String(c.themes || '')]));
  const labelOf = new Map(data.themes.map((t) => [t.theme, t.label]));
  const out = [];
  for (const col of question ? [question] : COMMENT_COLS) {
    for (const r of pool) {
      const text = String(r[col] || '').trim();
      if (BLANK.has(text.toLowerCase())) continue;
      const tags = tagsOf.get(col + '\u0001' + text);
      if (tags === '') continue;
      const keys = tags ? tags.split(' ').filter(Boolean) : [];
      if (theme && !keys.includes(theme)) continue;
      out.push({ question: col.replace('Comment: ', ''), text, themes: keys.length ? keys.map((k) => labelOf.get(k) || k) : ['not yet themed'] });
    }
  }
  return { total_matching: out.length, offset, comments: out.slice(offset, offset + limit) };
}

function runTool(data, name, input) {
  try {
    if (name === 'tabulate') return tabulate(data, input);
    if (name === 'get_comments') return getComments(data, input);
    return { error: 'Unknown tool ' + name };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

function systemPrompt(data) {
  const n = data.rows.length;
  const updated = data.meta && data.meta.updatedAt ? data.meta.updatedAt : 'unknown';
  return [
    'You answer questions about the results of the Congregation Darchei Noam (Fair Lawn, NJ) Building Expansion Survey for members of the community and the New Building Committee. You work only from this survey. If a question is not about the survey, say briefly that you can only help with the survey results.',
    '',
    'Data: ' + n + ' responses, last updated ' + updated + ' UTC. Responses are still coming in until the survey closes on Sunday night, November 8, 2026.',
    'Facts about the data:',
    '- One response per adult, so spouses may both have answered.',
    '- Only members were asked the building fund questions (Fund familiarity, Knew $10,000 ask, Household contributed, Likely to give, Would help giving, and the Agree statements).',
    '- Some questions were only shown to some people (for example, Why not a member only to non-members, Why not at Darchei Noam only to people who hosted elsewhere). Use the "answered" count as the base.',
    '- The "Problem:" questions include the answer "Doesn\'t apply to me". When you report problem ratings, leave those out of the base and say so, as the dashboard does: for example "84% of the 105 it applies to call it a major problem".',
    '- Write-in "Other" answers appear as "Other".',
    '',
    'How to answer:',
    '- Always get numbers from the tools. Never estimate or invent a number.',
    '- Lead with a direct answer, then the key numbers with their bases (for example "62% of 130"). Keep it short, about 150 words, unless asked for more detail.',
    '- Say when a group is small (under 10 people) and treat its results as tentative.',
    '- When you compare groups, give each group\'s share and base.',
    '- You may quote short pieces of written comments, but never try to identify who wrote something or who gave an answer.',
    '- Use plain text with simple **bold** and "- " bullet lists only. No tables or headings.',
    '',
    'Questions (exact names to use with the tools), with their type, how many answered, and the answers given:',
    JSON.stringify(data.schema),
    '',
    'Comment themes (keys for get_comments):',
    JSON.stringify(data.themes.map((t) => ({ theme: t.theme, label: t.label, description: t.description }))),
  ].join('\n');
}

async function callClaude(env, system, messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
    }),
  });
  if (!r.ok) throw new Error('Claude API error ' + r.status + ': ' + (await r.text()).slice(0, 300));
  return r.json();
}

async function answer(env, data, conversation) {
  const system = systemPrompt(data);
  const messages = conversation.map((m) => ({ role: m.role, content: m.content }));
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const res = await callClaude(env, system, messages);
    const uses = (res.content || []).filter((b) => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || uses.length === 0) {
      return (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    }
    messages.push({ role: 'assistant', content: res.content });
    messages.push({
      role: 'user',
      content: uses.map((u) => ({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(runTool(data, u.name, u.input)) })),
    });
  }
  return 'Sorry, that question needed more lookups than I can do at once. Try asking something narrower.';
}

function validConversation(body) {
  const msgs = body && Array.isArray(body.messages) ? body.messages : null;
  if (!msgs || msgs.length === 0 || msgs.length > MAX_MESSAGES) return null;
  for (let i = 0; i < msgs.length; i += 1) {
    const m = msgs[i];
    const role = i % 2 === 0 ? 'user' : 'assistant';
    if (!m || m.role !== role || typeof m.content !== 'string' || !m.content.trim()) return null;
    if (m.content.length > (role === 'user' ? MAX_QUESTION_CHARS : 6000)) return null;
  }
  if (msgs[msgs.length - 1].role !== 'user') return null;
  return msgs;
}

function allowed(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  if (recent.length >= PER_IP_PER_HOUR) { hits.set(ip, recent); return false; }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function reply(obj, status, origin) {
  return new Response(obj === null ? null : JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return reply(null, 204, SITE_ORIGIN);
    if (request.method !== 'POST') return reply({ error: 'Send questions with POST.' }, 405, SITE_ORIGIN);
    if (origin !== SITE_ORIGIN) return reply({ error: 'This service only answers the survey page.' }, 403, SITE_ORIGIN);
    if (!env.ANTHROPIC_API_KEY) return reply({ error: 'The chat is not set up yet (no API key).' }, 500, SITE_ORIGIN);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!allowed(ip)) return reply({ error: 'Too many questions in the last hour. Please try again later.' }, 429, SITE_ORIGIN);
    let body;
    try { body = await request.json(); } catch (e) { return reply({ error: 'Bad request.' }, 400, SITE_ORIGIN); }
    const conversation = validConversation(body);
    if (!conversation) return reply({ error: 'Bad request.' }, 400, SITE_ORIGIN);
    try {
      const data = await loadData();
      const text = await answer(env, data, conversation);
      return reply({ answer: text, responses: data.rows.length, updatedAt: data.meta && data.meta.updatedAt }, 200, SITE_ORIGIN);
    } catch (e) {
      console.log(String(e && e.stack || e));
      return reply({ error: 'Something went wrong answering that. Please try again.' }, 502, SITE_ORIGIN);
    }
  },
};

