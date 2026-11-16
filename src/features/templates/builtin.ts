// Built-in template library. Every template is real, editable drawing content generated from
// the Board builder; nothing here is a static picture.
import { Board, COLORS } from "./dsl";

export type TemplateCategory = "Planning" | "Thinking" | "Business" | "Design & development" | "Creative";

export interface TemplateDef {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  tags: string[];
  recommended?: boolean;
  build: () => Board;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function weeklyPlanner() {
  const b = new Board();
  b.title(0, 0, "Weekly planner", "Week of ____");
  DAYS.forEach((d, i) => {
    const x = (i % 4) * 300;
    const y = 120 + Math.floor(i / 4) * 360;
    b.rect(x, y, 280, 340, { fill: i >= 5 ? "orange" : "gray", stroke: "transparent" });
    b.text(x + 16, y + 14, d, { size: 22 });
    b.rect(x + 16, y + 60, 248, 60, { fill: "white", label: "Top priority", size: 14, stroke: "line" });
    b.rect(x + 16, y + 132, 248, 48, { fill: "white", label: "Task", size: 14, stroke: "line" });
    b.rect(x + 16, y + 188, 248, 48, { fill: "white", label: "Task", size: 14, stroke: "line" });
  });
  b.rect(900, 480, 280, 340, { fill: "yellow", stroke: "transparent" });
  b.text(916, 494, "Notes", { size: 22 });
  return b;
}

function monthlyPlanner() {
  const b = new Board();
  b.title(0, 0, "Monthly planner", "Month ________");
  DAYS.forEach((d, i) => b.rect(i * 170, 110, 160, 40, { fill: i >= 5 ? "orange" : "blue", label: d.slice(0, 3), size: 16, stroke: "transparent" }));
  for (let w = 0; w < 5; w++)
    for (let d = 0; d < 7; d++) {
      const x = d * 170;
      const y = 160 + w * 130;
      b.rect(x, y, 160, 120, { fill: d >= 5 ? "#fff4e6" : "white", stroke: "line", strokeWidth: 1, rounded: false });
      b.text(x + 10, y + 8, String(w * 7 + d + 1), { size: 14, color: "muted" });
    }
  b.section(1200, 110, 300, 300, "Goals this month", "1.\n2.\n3.", "yellow");
  b.section(1200, 430, 300, 380, "Notes", "", "gray");
  return b;
}

function roadmap() {
  const b = new Board();
  b.title(0, 0, "Product roadmap", "Now, next, later by quarter");
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const lanes = [
    { name: "Product", fill: "blue" },
    { name: "Design", fill: "violet" },
    { name: "Engineering", fill: "green" },
    { name: "Marketing", fill: "orange" },
  ];
  quarters.forEach((q, i) => b.rect(200 + i * 300, 110, 290, 44, { fill: "gray", label: q, size: 18, stroke: "transparent" }));
  lanes.forEach((l, r) => {
    const y = 170 + r * 150;
    b.rect(0, y, 190, 140, { fill: l.fill, label: l.name, size: 18, stroke: "transparent" });
    quarters.forEach((_, i) => b.rect(200 + i * 300, y, 290, 140, { stroke: "line", strokeWidth: 1, rounded: false }));
    b.rect(212 + (r % 2) * 300, y + 20, 270, 44, { fill: l.fill, label: `${l.name} milestone`, size: 14, stroke: "transparent" });
    b.rect(512 + (r % 3) * 300, y + 76, 400, 44, { fill: l.fill, label: "Initiative", size: 14, stroke: "transparent", opacity: 70 });
  });
  return b;
}

function personalDashboard() {
  const b = new Board();
  b.title(0, 0, "Personal dashboard", "Everything that matters this season");
  b.section(0, 110, 380, 260, "Focus", "The one thing that makes\neverything else easier", "yellow");
  b.section(400, 110, 380, 260, "This week", "☐ \n☐ \n☐ ", "white");
  b.section(800, 110, 380, 260, "Habits", "Mon Tue Wed Thu Fri Sat Sun", "green");
  b.section(0, 390, 380, 260, "Projects", "Status of active projects", "blue");
  b.section(400, 390, 380, 260, "Ideas inbox", "Capture now, sort later", "violet");
  b.section(800, 390, 380, 260, "Wins and lessons", "", "orange");
  return b;
}

function goalTracking() {
  const b = new Board();
  b.title(0, 0, "Goal tracker", "Objectives, key results and progress");
  ["Objective 1", "Objective 2", "Objective 3"].forEach((o, i) => {
    const y = 110 + i * 220;
    b.rect(0, y, 260, 200, { fill: ["blue", "violet", "green"][i], label: o, size: 20, stroke: "transparent" });
    for (let k = 0; k < 3; k++) {
      const ky = y + k * 68;
      b.rect(280, ky, 420, 56, { fill: "white", label: `Key result ${k + 1}`, size: 15, align: "left", stroke: "line" });
      b.rect(720, ky + 16, 300, 24, { fill: "gray", stroke: "transparent" });
      b.rect(720, ky + 16, 60 + k * 70, 24, { fill: ["green", "yellow", "red"][k], stroke: "transparent" });
      b.text(1036, ky + 18, `${20 + k * 25}%`, { size: 14, color: "muted" });
    }
  });
  return b;
}

function taskBoard() {
  const b = new Board();
  b.title(0, 0, "Task board", "Drag cards across columns");
  b.columns(0, 110, [
    { title: "Backlog", cards: ["Research competitors", "Collect feedback"] },
    { title: "To do", fill: "blue", cards: ["Write brief", "Plan sprint"] },
    { title: "In progress", fill: "yellow", cards: ["Design homepage"] },
    { title: "Review", fill: "violet", cards: ["Copy review"] },
    { title: "Done", fill: "green", cards: ["Kick-off meeting"] },
  ]);
  return b;
}

function timeline() {
  const b = new Board();
  b.title(0, 0, "Timeline", "Key moments in order");
  b.arrow([0, 300], [1400, 300], { color: COLORS.ink });
  const events = ["Kick-off", "Research", "Concept", "Prototype", "Launch", "Review"];
  events.forEach((e, i) => {
    const x = 80 + i * 230;
    b.ellipse(x - 12, 288, 24, 24, { fill: "orange", stroke: "ink" });
    const up = i % 2 === 0;
    b.line([[x, up ? 288 : 312], [x, up ? 210 : 390]], { color: "muted", dashed: true });
    b.rect(x - 90, up ? 130 : 390, 180, 80, { fill: up ? "blue" : "violet", label: `${e}\nDate`, size: 15, stroke: "transparent" });
  });
  return b;
}

function gantt() {
  const b = new Board();
  b.title(0, 0, "Project plan (Gantt)", "Tasks across weeks");
  const weeks = 10;
  for (let w = 0; w < weeks; w++) b.rect(260 + w * 90, 110, 90, 40, { fill: "gray", label: `W${w + 1}`, size: 14, stroke: "line", strokeWidth: 1, rounded: false });
  const tasks: [string, number, number, string][] = [
    ["Discovery", 0, 2, "blue"],
    ["Requirements", 1, 2, "blue"],
    ["Design", 2, 3, "violet"],
    ["Build", 4, 4, "green"],
    ["Testing", 6, 3, "yellow"],
    ["Launch", 9, 1, "orange"],
  ];
  tasks.forEach(([t, start, len, fill], i) => {
    const y = 160 + i * 60;
    b.rect(0, y, 250, 50, { fill: "white", label: t, size: 15, align: "left", stroke: "line", strokeWidth: 1, rounded: false });
    b.rect(260, y, weeks * 90, 50, { stroke: "line", strokeWidth: 1, rounded: false });
    b.rect(260 + start * 90 + 4, y + 8, len * 90 - 8, 34, { fill, stroke: "transparent" });
  });
  b.diamond(260 + 9 * 90 + 30, 160 + 6 * 60 + 4, 30, 30, { fill: "red" });
  b.text(260 + 9 * 90 + 70, 160 + 6 * 60 + 8, "Go live", { size: 14 });
  return b;
}

function mindMap() {
  const b = new Board({ roughness: 1, font: 5 });
  const c = b.ellipse(500, 300, 260, 130, { fill: "yellow", label: "Central idea", size: 26 });
  const branches = [
    { t: "Goals", x: 120, y: 80, f: "blue" },
    { t: "Audience", x: 880, y: 80, f: "violet" },
    { t: "Channels", x: 960, y: 360, f: "green" },
    { t: "Risks", x: 880, y: 600, f: "red" },
    { t: "Resources", x: 120, y: 600, f: "orange" },
    { t: "Timeline", x: 40, y: 360, f: "cyan" },
  ];
  branches.forEach((br) => {
    const id = b.rect(br.x, br.y, 200, 70, { fill: br.f, label: br.t, size: 20 });
    b.arrow(c, id);
    [0, 1].forEach((k) => {
      const sx = br.x + (br.x < 500 ? -180 : 230);
      const sy = br.y - 30 + k * 100;
      const sub = b.rect(sx, sy, 150, 50, { fill: "white", label: "Idea", size: 15 });
      b.arrow(id, sub);
    });
  });
  return b;
}

function brainstorm() {
  const b = new Board({ roughness: 1, font: 5 });
  b.title(0, 0, "Brainstorm", "How might we… ?");
  b.rect(0, 100, 1240, 70, { fill: "gray", label: "How might we ________________________________ ?", size: 22, stroke: "transparent" });
  const fills = ["yellow", "pink", "blue", "green", "orange", "violet"];
  for (let i = 0; i < 12; i++) b.note(20 + (i % 6) * 205, 200 + Math.floor(i / 6) * 150, "Idea", fills[i % 6]);
  b.section(0, 520, 600, 240, "Themes", "Group related ideas here", "white");
  b.section(640, 520, 600, 240, "Next steps", "Owner · action · date", "white");
  return b;
}

function conceptMap() {
  const b = new Board();
  b.title(0, 0, "Concept map", "Concepts connected by labelled relationships");
  const a = b.rect(500, 120, 220, 70, { fill: "yellow", label: "Main concept", size: 20 });
  const n1 = b.rect(160, 320, 200, 64, { fill: "blue", label: "Concept A" });
  const n2 = b.rect(500, 320, 200, 64, { fill: "blue", label: "Concept B" });
  const n3 = b.rect(840, 320, 200, 64, { fill: "blue", label: "Concept C" });
  const n4 = b.rect(320, 540, 200, 64, { fill: "green", label: "Example" });
  const n5 = b.rect(700, 540, 200, 64, { fill: "green", label: "Example" });
  b.arrow(a, n1, { label: "includes" });
  b.arrow(a, n2, { label: "requires" });
  b.arrow(a, n3, { label: "leads to" });
  b.arrow(n1, n4, { label: "e.g." });
  b.arrow(n3, n5, { label: "e.g." });
  b.arrow(n2, n4, { label: "supports", dashed: true });
  return b;
}

function ideaMapping() {
  const b = new Board({ roughness: 1, font: 5 });
  b.title(0, 0, "Idea map", "Expand a seed idea in every direction");
  const seed = b.ellipse(480, 330, 220, 220, { fill: "orange", label: "Seed idea", size: 24 });
  const angles = [0, 60, 120, 180, 240, 300];
  const prompts = ["What if…", "Combine with…", "Opposite", "Simplify", "For whom?", "Wild card"];
  angles.forEach((deg, i) => {
    const r = (deg * Math.PI) / 180;
    const x = 590 + Math.cos(r) * 380 - 90;
    const y = 440 + Math.sin(r) * 300 - 45;
    const id = b.rect(x, y, 180, 90, { fill: ["yellow", "pink", "blue", "green", "violet", "cyan"][i], label: prompts[i], size: 18 });
    b.arrow(seed, id);
  });
  return b;
}

function decisionTree() {
  const b = new Board();
  b.title(0, 0, "Decision tree", "Questions, options and outcomes");
  const q = b.diamond(480, 110, 240, 130, { fill: "yellow", label: "Decision?", size: 18 });
  const o1 = b.diamond(180, 320, 220, 120, { fill: "blue", label: "Option A?", size: 16 });
  const o2 = b.diamond(800, 320, 220, 120, { fill: "blue", label: "Option B?", size: 16 });
  b.arrow(q, o1, { label: "Yes" });
  b.arrow(q, o2, { label: "No" });
  const outs = [
    [60, "Outcome 1", o1, "Yes"],
    [300, "Outcome 2", o1, "No"],
    [680, "Outcome 3", o2, "Yes"],
    [920, "Outcome 4", o2, "No"],
  ] as const;
  outs.forEach(([x, t, from, lbl], i) => {
    const id = b.rect(x, 540, 200, 80, { fill: i % 2 ? "red" : "green", label: t });
    b.arrow(from, id, { label: lbl });
  });
  return b;
}

function swot() {
  const b = new Board();
  b.title(0, 0, "SWOT analysis", "Internal and external factors");
  const q = [
    ["Strengths", "What do we do well?", "green"],
    ["Weaknesses", "Where can we improve?", "red"],
    ["Opportunities", "What could we use?", "blue"],
    ["Threats", "What could hurt us?", "orange"],
  ] as const;
  q.forEach(([t, h, f], i) => b.section((i % 2) * 560, 110 + Math.floor(i / 2) * 400, 540, 380, t, h, f));
  b.text(-120, 290, "Internal", { size: 16, color: "muted" });
  b.text(-120, 690, "External", { size: 16, color: "muted" });
  return b;
}

function problemSolving() {
  const b = new Board();
  b.title(0, 0, "Problem solving (fishbone)", "Find the root causes of a problem");
  b.arrow([0, 420], [1100, 420], { color: COLORS.ink });
  b.rect(1110, 360, 220, 120, { fill: "red", label: "Problem", size: 22 });
  const cats = ["People", "Process", "Tools", "Environment", "Materials", "Measurement"];
  cats.forEach((c, i) => {
    const x = 160 + (i % 3) * 320;
    const top = i < 3;
    b.line([[x, top ? 170 : 670], [x + 140, 420]], { color: "ink" });
    b.rect(x - 80, top ? 110 : 670, 160, 50, { fill: "blue", label: c, size: 16 });
    b.text(x - 60, top ? 210 : 600, "• cause\n• cause", { size: 14, color: "muted" });
  });
  return b;
}

function flowchart() {
  const b = new Board();
  b.title(0, 0, "Flowchart", "Start, steps, decisions and end");
  const s = b.ellipse(420, 100, 200, 70, { fill: "green", label: "Start" });
  const p1 = b.rect(410, 220, 220, 80, { fill: "blue", label: "Do something" });
  const d = b.diamond(400, 350, 240, 140, { fill: "yellow", label: "Condition?" });
  const p2 = b.rect(410, 540, 220, 80, { fill: "blue", label: "Next step" });
  const alt = b.rect(760, 380, 200, 80, { fill: "violet", label: "Alternative" });
  const e = b.ellipse(420, 670, 200, 70, { fill: "red", label: "End" });
  b.arrow(s, p1);
  b.arrow(p1, d);
  b.arrow(d, p2, { label: "Yes" });
  b.arrow(d, alt, { label: "No" });
  b.arrow(p2, e);
  b.arrow(alt, p1, { dashed: true, label: "retry" });
  return b;
}

function bmc() {
  const b = new Board();
  b.title(0, 0, "Business Model Canvas");
  const y = 90;
  const W = 280;
  b.section(0, y, W, 520, "Key partners", "Who helps us?", "white");
  b.section(W + 10, y, W, 255, "Key activities", "What do we do?", "white");
  b.section(W + 10, y + 265, W, 255, "Key resources", "What do we need?", "white");
  b.section(2 * (W + 10), y, W, 520, "Value propositions", "Why customers care", "yellow");
  b.section(3 * (W + 10), y, W, 255, "Customer relationships", "How we interact", "white");
  b.section(3 * (W + 10), y + 265, W, 255, "Channels", "How we reach them", "white");
  b.section(4 * (W + 10), y, W, 520, "Customer segments", "For whom?", "blue");
  b.section(0, y + 530, (5 * (W + 10)) / 2 - 5, 220, "Cost structure", "Main costs", "red");
  b.section((5 * (W + 10)) / 2 + 5, y + 530, (5 * (W + 10)) / 2 - 15, 220, "Revenue streams", "How we earn", "green");
  return b;
}

function leanCanvas() {
  const b = new Board();
  b.title(0, 0, "Lean Canvas");
  const y = 90;
  const W = 280;
  b.section(0, y, W, 520, "Problem", "Top 3 problems", "red");
  b.section(W + 10, y, W, 255, "Solution", "Top 3 features", "white");
  b.section(W + 10, y + 265, W, 255, "Key metrics", "What to measure", "white");
  b.section(2 * (W + 10), y, W, 520, "Unique value proposition", "Single clear message", "yellow");
  b.section(3 * (W + 10), y, W, 255, "Unfair advantage", "Hard to copy", "white");
  b.section(3 * (W + 10), y + 265, W, 255, "Channels", "Path to customers", "white");
  b.section(4 * (W + 10), y, W, 520, "Customer segments", "Early adopters", "blue");
  b.section(0, y + 530, (5 * (W + 10)) / 2 - 5, 200, "Cost structure", "", "gray");
  b.section((5 * (W + 10)) / 2 + 5, y + 530, (5 * (W + 10)) / 2 - 15, 200, "Revenue streams", "", "green");
  return b;
}

function customerJourney() {
  const b = new Board();
  b.title(0, 0, "Customer journey map", "Persona: ________");
  const stages = ["Awareness", "Consideration", "Purchase", "Onboarding", "Loyalty"];
  const rows = ["Actions", "Touchpoints", "Thoughts", "Emotions", "Opportunities"];
  stages.forEach((s, i) => b.rect(200 + i * 250, 100, 240, 50, { fill: "violet", label: s, size: 17, stroke: "transparent" }));
  rows.forEach((r, j) => {
    const y = 160 + j * 130;
    b.rect(0, y, 190, 120, { fill: "gray", label: r, size: 16, stroke: "transparent" });
    stages.forEach((_, i) => b.rect(200 + i * 250, y, 240, 120, { stroke: "line", strokeWidth: 1, rounded: false }));
  });
  b.line([[320, 590], [570, 540], [820, 620], [1070, 560], [1320, 520]], { color: "#e8590c", width: 3 });
  return b;
}

function marketingStrategy() {
  const b = new Board();
  b.title(0, 0, "Marketing strategy", "Funnel and the 4 Ps");
  const funnel = [
    ["Awareness", 520, "blue"],
    ["Interest", 440, "cyan"],
    ["Consideration", 360, "violet"],
    ["Conversion", 280, "green"],
    ["Advocacy", 200, "yellow"],
  ] as const;
  funnel.forEach(([t, w, f], i) => b.rect(300 - w / 2, 110 + i * 84, w, 72, { fill: f, label: t, size: 18, stroke: "transparent" }));
  const ps = [
    ["Product", "What we sell"],
    ["Price", "How we price it"],
    ["Place", "Where it is sold"],
    ["Promotion", "How we talk about it"],
  ];
  ps.forEach(([t, h], i) => b.section(640 + (i % 2) * 330, 110 + Math.floor(i / 2) * 220, 310, 200, t, h, "white"));
  return b;
}

function competitorAnalysis() {
  const b = new Board();
  b.title(0, 0, "Competitor analysis");
  b.table(0, 100, [200, 220, 220, 220, 220], [
    ["", "Us", "Competitor A", "Competitor B", "Competitor C"],
    ["Target market", "", "", "", ""],
    ["Pricing", "", "", "", ""],
    ["Key features", "", "", "", ""],
    ["Strengths", "", "", "", ""],
    ["Weaknesses", "", "", "", ""],
    ["Positioning", "", "", "", ""],
  ], { rowH: 70 });
  return b;
}

function persona() {
  const b = new Board();
  b.title(0, 0, "User persona");
  b.ellipse(0, 100, 160, 160, { fill: "violet", label: "Photo", size: 16 });
  b.text(190, 120, "Name Surname", { size: 28 });
  b.text(190, 165, "Role · Age · Location", { size: 16, color: "muted" });
  b.rect(190, 200, 520, 60, { fill: "yellow", label: "“A quote that sums up how they think.”", size: 16, stroke: "transparent" });
  b.section(0, 290, 350, 240, "Goals", "• \n• \n• ", "green");
  b.section(370, 290, 350, 240, "Frustrations", "• \n• \n• ", "red");
  b.section(740, 290, 350, 240, "Behaviours", "• \n• ", "blue");
  b.section(0, 550, 540, 200, "Tools and channels", "", "white");
  b.section(560, 550, 530, 200, "How we help", "", "white");
  return b;
}

function valueProp() {
  const b = new Board();
  b.title(0, 0, "Value proposition canvas");
  b.rect(0, 110, 560, 560, { fill: "white", stroke: "ink" });
  b.text(16, 124, "Value map", { size: 20 });
  b.rect(20, 170, 520, 150, { fill: "yellow", label: "Products and services", size: 16 });
  b.rect(20, 330, 255, 320, { fill: "green", label: "Gain creators", size: 16 });
  b.rect(285, 330, 255, 320, { fill: "red", label: "Pain relievers", size: 16 });
  b.ellipse(680, 110, 560, 560, { fill: "white", stroke: "ink" });
  b.text(900, 140, "Customer profile", { size: 20 });
  b.ellipse(760, 220, 220, 220, { fill: "blue", label: "Customer jobs", size: 16 });
  b.ellipse(960, 200, 200, 200, { fill: "green", label: "Gains", size: 16 });
  b.ellipse(940, 410, 200, 200, { fill: "red", label: "Pains", size: 16 });
  b.arrow([560, 390], [680, 390], { both: true, label: "fit" });
  return b;
}

function businessProcess() {
  const b = new Board();
  b.title(0, 0, "Business process (swimlanes)");
  const lanes = ["Customer", "Sales", "Operations", "Finance"];
  lanes.forEach((l, i) => {
    b.rect(0, 100 + i * 160, 160, 150, { fill: ["blue", "violet", "green", "orange"][i], label: l, size: 18, stroke: "transparent" });
    b.rect(170, 100 + i * 160, 1100, 150, { stroke: "line", strokeWidth: 1, rounded: false });
  });
  const s1 = b.ellipse(200, 145, 140, 60, { fill: "green", label: "Request" });
  const s2 = b.rect(400, 300, 180, 70, { fill: "white", label: "Qualify lead" });
  const s3 = b.diamond(640, 285, 170, 100, { fill: "yellow", label: "Approved?" });
  const s4 = b.rect(880, 460, 180, 70, { fill: "white", label: "Deliver" });
  const s5 = b.rect(880, 620, 180, 70, { fill: "white", label: "Invoice" });
  const s6 = b.ellipse(1110, 625, 140, 60, { fill: "red", label: "Paid" });
  b.arrow(s1, s2);
  b.arrow(s2, s3);
  b.arrow(s3, s4, { label: "yes" });
  b.arrow(s4, s5);
  b.arrow(s5, s6);
  b.arrow(s3, s1, { label: "no", dashed: true });
  return b;
}

function websiteWireframe() {
  const b = new Board();
  b.title(0, 0, "Website wireframe", "Desktop, 1280 px");
  const f = 100;
  b.rect(0, f, 1280, 800, { fill: "white", stroke: "ink" });
  b.rect(0, f, 1280, 36, { fill: "gray", stroke: "ink", rounded: false });
  [16, 36, 56].forEach((x) => b.ellipse(x, f + 12, 12, 12, { fill: "line" }));
  b.rect(40, f + 56, 120, 36, { fill: "gray", label: "Logo", size: 14 });
  ["Product", "Pricing", "About", "Contact"].forEach((n, i) => b.text(760 + i * 100, f + 64, n, { size: 16 }));
  b.rect(1150, f + 56, 100, 36, { fill: "ink", stroke: "ink" });
  b.text(40, f + 160, "Headline that explains the value", { size: 36 });
  b.text(40, f + 214, "A supporting sentence about who it is for and what it does.", { size: 18, color: "muted" });
  b.rect(40, f + 270, 160, 48, { fill: "blue", label: "Call to action" });
  b.rect(700, f + 140, 540, 300, { fill: "gray", label: "Hero image", size: 18 });
  [0, 1, 2].forEach((i) => {
    const x = 40 + i * 410;
    b.rect(x, f + 480, 380, 260, { fill: "white", stroke: "line" });
    b.rect(x + 20, f + 500, 340, 140, { fill: "gray", label: "Image" });
    b.text(x + 20, f + 656, "Feature title", { size: 20 });
    b.text(x + 20, f + 690, "Short description of the benefit.", { size: 14, color: "muted" });
  });
  return b;
}

function mobileWireframe() {
  const b = new Board();
  b.title(0, 0, "Mobile app wireframes", "390 × 844");
  const screens = ["Onboarding", "Home", "Detail"];
  screens.forEach((s, i) => {
    const x = i * 460;
    const y = 110;
    const frameIds: string[] = [];
    frameIds.push(b.rect(x + 20, y + 20, 350, 30, { fill: "gray", label: "9:41", size: 12, stroke: "transparent" }));
    if (i === 0) {
      frameIds.push(b.ellipse(x + 95, y + 200, 200, 200, { fill: "gray", label: "Illustration" }));
      frameIds.push(b.text(x + 60, y + 450, "Welcome to the app", { size: 26 }));
      frameIds.push(b.rect(x + 40, y + 720, 310, 52, { fill: "blue", label: "Get started" }));
    } else if (i === 1) {
      frameIds.push(b.text(x + 30, y + 80, "Good morning", { size: 26 }));
      frameIds.push(b.rect(x + 30, y + 130, 330, 44, { fill: "gray", label: "Search", size: 14, align: "left" }));
      [0, 1, 2].forEach((k) => frameIds.push(b.rect(x + 30, y + 200 + k * 150, 330, 130, { fill: "white", stroke: "line", label: "Card", size: 16 })));
      frameIds.push(b.rect(x, y + 770, 390, 74, { fill: "gray", label: "Tab bar", size: 14, rounded: false, stroke: "transparent" }));
    } else {
      frameIds.push(b.rect(x, y, 390, 300, { fill: "gray", label: "Image", rounded: false, stroke: "transparent" }));
      frameIds.push(b.text(x + 30, y + 330, "Item title", { size: 26 }));
      frameIds.push(b.text(x + 30, y + 380, "Details and description of the item.", { size: 15, color: "muted" }));
      frameIds.push(b.rect(x + 40, y + 720, 310, 52, { fill: "blue", label: "Primary action" }));
    }
    b.frame(s, x, y, 390, 844, frameIds);
    if (i < 2) b.arrow([x + 400, y + 422], [x + 450, y + 422]);
  });
  return b;
}

function userFlow() {
  const b = new Board();
  b.title(0, 0, "User flow", "From entry point to goal");
  const e = b.ellipse(0, 260, 160, 70, { fill: "green", label: "Entry" });
  const s1 = b.rect(220, 240, 180, 110, { fill: "white", label: "Landing page" });
  const s2 = b.rect(460, 240, 180, 110, { fill: "white", label: "Sign up" });
  const d = b.diamond(700, 235, 180, 120, { fill: "yellow", label: "Verified?" });
  const s3 = b.rect(940, 240, 180, 110, { fill: "white", label: "Dashboard" });
  const s4 = b.rect(700, 440, 180, 90, { fill: "red", label: "Verify email" });
  const goal = b.ellipse(1180, 260, 160, 70, { fill: "blue", label: "Goal" });
  b.arrow(e, s1);
  b.arrow(s1, s2);
  b.arrow(s2, d);
  b.arrow(d, s3, { label: "yes" });
  b.arrow(d, s4, { label: "no" });
  b.arrow(s4, s2, { dashed: true });
  b.arrow(s3, goal);
  return b;
}

function umlClass() {
  const b = new Board({ roughness: 0, font: 8 });
  b.title(0, 0, "UML class diagram");
  const cls = (x: number, y: number, name: string, fields: string, methods: string) => {
    const head = b.rect(x, y, 260, 44, { fill: "blue", label: name, size: 18, rounded: false });
    b.rect(x, y + 44, 260, 100, { fill: "white", label: fields, size: 14, align: "left", valign: "top", rounded: false });
    b.rect(x, y + 144, 260, 80, { fill: "white", label: methods, size: 14, align: "left", valign: "top", rounded: false });
    return head;
  };
  const user = cls(0, 110, "User", "+ id: UUID\n+ email: string\n- passwordHash: string", "+ login()\n+ logout()");
  const order = cls(420, 110, "Order", "+ id: UUID\n+ total: Money\n+ status: Status", "+ pay()\n+ cancel()");
  const item = cls(840, 110, "OrderItem", "+ quantity: int\n+ price: Money", "+ subtotal()");
  const admin = cls(0, 440, "Admin", "+ permissions: Role[]", "+ ban(user)");
  b.arrow(user, order, { label: "1 places *" });
  b.arrow(order, item, { label: "1 contains *" });
  b.arrow(admin, user, { label: "extends" });
  return b;
}

function softwareArchitecture() {
  const b = new Board();
  b.title(0, 0, "Software architecture", "Layers and responsibilities");
  const layers = [
    ["Presentation", "UI components · routing · state", "violet"],
    ["Application", "Use cases · commands · validation", "blue"],
    ["Domain", "Entities · rules · events", "green"],
    ["Infrastructure", "Database · file system · external APIs", "orange"],
  ] as const;
  const ids = layers.map(([t, d, f], i) => b.rect(0, 110 + i * 150, 900, 120, { fill: f, label: `${t}\n${d}`, size: 18 }));
  ids.slice(0, -1).forEach((id, i) => b.arrow(id, ids[i + 1]));
  b.rect(960, 110, 260, 570, { fill: "gray", label: "Cross-cutting\n\nLogging\nAuth\nConfig\nTelemetry", size: 16, stroke: "line" });
  return b;
}

function databaseDiagram() {
  const b = new Board({ roughness: 0, font: 8 });
  b.title(0, 0, "Database diagram");
  const table = (x: number, y: number, name: string, cols: string[]) => {
    const head = b.rect(x, y, 260, 44, { fill: "green", label: name, size: 18, rounded: false });
    cols.forEach((c, i) => b.rect(x, y + 44 + i * 36, 260, 36, { fill: "white", label: c, size: 14, align: "left", rounded: false, stroke: "line", strokeWidth: 1 }));
    return head;
  };
  const users = table(0, 110, "users", ["PK  id  uuid", "email  text", "name  text", "created_at  timestamp"]);
  const orders = table(420, 110, "orders", ["PK  id  uuid", "user_id  uuid → users", "total  numeric", "status  text"]);
  const items = table(840, 110, "order_items", ["PK  id  uuid", "order_id  uuid → orders", "product_id  uuid → products", "qty  int"]);
  const products = table(840, 420, "products", ["PK  id  uuid", "name  text", "price  numeric"]);
  b.arrow(orders, users, { label: "N:1" });
  b.arrow(items, orders, { label: "N:1" });
  b.arrow(items, products, { label: "N:1" });
  return b;
}

function systemArchitecture() {
  const b = new Board();
  b.title(0, 0, "System architecture");
  const web = b.rect(0, 160, 180, 90, { fill: "violet", label: "Web app" });
  const mob = b.rect(0, 300, 180, 90, { fill: "violet", label: "Mobile app" });
  const cdn = b.rect(260, 100, 180, 70, { fill: "gray", label: "CDN" });
  const gw = b.rect(260, 230, 180, 90, { fill: "blue", label: "API gateway" });
  const auth = b.rect(540, 120, 200, 80, { fill: "green", label: "Auth service" });
  const core = b.rect(540, 240, 200, 80, { fill: "green", label: "Core service" });
  const work = b.rect(540, 360, 200, 80, { fill: "green", label: "Worker" });
  const q = b.rect(820, 360, 180, 80, { fill: "orange", label: "Queue" });
  const db = b.ellipse(840, 200, 160, 120, { fill: "yellow", label: "Database" });
  const s3 = b.rect(1080, 240, 180, 80, { fill: "gray", label: "Object storage" });
  b.arrow(web, gw);
  b.arrow(mob, gw);
  b.arrow(web, cdn, { dashed: true });
  b.arrow(gw, auth);
  b.arrow(gw, core);
  b.arrow(core, db);
  b.arrow(core, q);
  b.arrow(q, work);
  b.arrow(core, s3);
  return b;
}

function apiFlow() {
  const b = new Board({ roughness: 0, font: 8 });
  b.title(0, 0, "API flow (sequence)");
  const actors = ["Client", "API", "Auth", "Database"];
  actors.forEach((a, i) => {
    const x = i * 300;
    b.rect(x, 100, 200, 50, { fill: ["violet", "blue", "green", "yellow"][i], label: a, size: 16 });
    b.line([[x + 100, 150], [x + 100, 720]], { color: "muted", dashed: true, width: 1 });
  });
  const msgs: [number, number, string, boolean?][] = [
    [0, 1, "POST /login"],
    [1, 2, "verify(credentials)"],
    [2, 1, "token", true],
    [1, 3, "SELECT profile"],
    [3, 1, "row", true],
    [1, 0, "200 OK + token", true],
  ];
  msgs.forEach(([from, to, label, ret], i) => {
    const y = 200 + i * 80;
    b.arrow([from * 300 + 100, y], [to * 300 + 100, y], { label, dashed: !!ret });
  });
  return b;
}

function moodboard() {
  const b = new Board();
  b.title(0, 0, "Moodboard", "Drop images, colours and words that set the tone");
  const cells: [number, number, number, number][] = [
    [0, 100, 420, 300],
    [440, 100, 260, 300],
    [720, 100, 380, 180],
    [720, 300, 180, 100],
    [920, 300, 180, 100],
    [0, 420, 260, 300],
    [280, 420, 420, 300],
    [720, 420, 380, 300],
  ];
  cells.forEach(([x, y, w, h], i) => b.rect(x, y, w, h, { fill: "gray", label: i === 3 || i === 4 ? "Texture" : "Image", size: 16, stroke: "transparent" }));
  ["#F76046", "#F5AE39", "#8E5BE8", "#567BF7", "#191A24"].forEach((c, i) => b.ellipse(1140, 100 + i * 120, 100, 100, { fill: c, stroke: "transparent" }));
  b.text(1270, 140, "Bold\nWarm\nPlayful", { size: 24 });
  return b;
}

function storyboard() {
  const b = new Board({ roughness: 1, font: 5 });
  b.title(0, 0, "Storyboard");
  for (let i = 0; i < 6; i++) {
    const x = (i % 3) * 420;
    const y = 110 + Math.floor(i / 3) * 380;
    const panel = b.rect(x, y, 400, 225, { fill: "white", stroke: "ink" });
    b.text(x, y + 236, `Scene ${i + 1}`, { size: 18 });
    b.text(x, y + 266, "Action · dialogue · camera", { size: 14, color: "muted" });
    if (i < 5 && i % 3 !== 2) b.arrow([x + 400, y + 112], [x + 420, y + 112]);
    void panel;
  }
  return b;
}

function creativeBrief() {
  const b = new Board();
  b.title(0, 0, "Creative brief", "Project · client · date");
  const s: [string, string, string][] = [
    ["Background", "Why this project now?", "white"],
    ["Objective", "What must it achieve?", "yellow"],
    ["Audience", "Who are we talking to?", "blue"],
    ["Key message", "One thing to remember", "violet"],
    ["Tone", "How it should feel", "pink"],
    ["Deliverables", "Formats and sizes", "white"],
    ["Budget and timing", "", "white"],
    ["Success measures", "", "green"],
  ];
  s.forEach(([t, h, f], i) => b.section((i % 2) * 560, 110 + Math.floor(i / 2) * 200, 540, 180, t, h, f));
  return b;
}

function brandBoard() {
  const b = new Board();
  b.title(0, 0, "Brand identity board");
  b.section(0, 100, 520, 300, "Logo", "Primary, symbol, wordmark", "white");
  b.rect(170, 180, 180, 180, { fill: "gray", label: "Logo", size: 18 });
  b.section(540, 100, 600, 300, "Colour palette", "", "white");
  ["#F76046", "#F5AE39", "#8E5BE8", "#567BF7", "#191A24"].forEach((c, i) => {
    b.rect(560 + i * 115, 160, 100, 140, { fill: c, stroke: "transparent" });
    b.text(560 + i * 115, 310, c, { size: 13, color: "muted" });
  });
  b.section(0, 420, 560, 300, "Typography", "", "white");
  b.text(20, 480, "Aa Heading", { size: 48 });
  b.text(20, 560, "Body text sample for paragraphs and UI.", { size: 18 });
  b.section(580, 420, 560, 300, "Voice and imagery", "Three words · do · don't", "white");
  return b;
}

function referenceBoard() {
  const b = new Board();
  b.title(0, 0, "Visual reference board", "Collect references and annotate why they work");
  for (let i = 0; i < 8; i++) {
    const x = (i % 4) * 310;
    const y = 110 + Math.floor(i / 4) * 330;
    b.rect(x, y, 290, 220, { fill: "gray", label: "Reference", stroke: "transparent" });
    b.rect(x, y + 230, 290, 70, { fill: "yellow", label: "Why it works", size: 14, stroke: "transparent" });
  }
  return b;
}

function contentPlanning() {
  const b = new Board();
  b.title(0, 0, "Content plan", "Monthly editorial calendar");
  b.table(0, 100, [180, 240, 240, 240, 240], [
    ["", "Week 1", "Week 2", "Week 3", "Week 4"],
    ["Theme", "", "", "", ""],
    ["Blog", "", "", "", ""],
    ["Newsletter", "", "", "", ""],
    ["Video", "", "", "", ""],
    ["Owner", "", "", "", ""],
  ], { rowH: 90, header: "violet" });
  return b;
}

function socialPlanning() {
  const b = new Board();
  b.title(0, 0, "Social media planner");
  b.table(0, 100, [160, 170, 170, 170, 170, 170, 170, 170], [
    ["", ...DAYS.map((d) => d.slice(0, 3))],
    ["Instagram", "", "", "", "", "", "", ""],
    ["LinkedIn", "", "", "", "", "", "", ""],
    ["TikTok", "", "", "", "", "", "", ""],
    ["X / Threads", "", "", "", "", "", "", ""],
  ], { rowH: 110, header: "pink" });
  b.note(1380, 100, "Campaign idea", "yellow", 200, 140);
  b.note(1380, 260, "Hashtags", "green", 200, 140);
  return b;
}

function presentationStructure() {
  const b = new Board();
  b.title(0, 0, "Presentation structure", "One frame per slide, export frames as PDF pages");
  const slides = ["Title", "Problem", "Solution", "How it works", "Results", "Next steps"];
  slides.forEach((s, i) => {
    const x = (i % 3) * 520;
    const y = 110 + Math.floor(i / 3) * 340;
    const kids = [b.text(x + 30, y + 30, s, { size: 32 }), b.text(x + 30, y + 90, "• Key point\n• Key point\n• Key point", { size: 18, color: "muted" })];
    b.frame(`${i + 1}. ${s}`, x, y, 480, 270, kids);
  });
  return b;
}

const t = (id: string, name: string, category: TemplateCategory, description: string, tags: string[], build: () => Board, recommended = false): TemplateDef => ({
  id,
  name,
  category,
  description,
  tags,
  build,
  recommended,
});

export const BUILTIN_TEMPLATES: TemplateDef[] = [
  t("weekly-planner", "Weekly planner", "Planning", "Seven days with priorities and notes.", ["week", "agenda", "tasks"], weeklyPlanner, true),
  t("monthly-planner", "Monthly planner", "Planning", "A calendar grid with goals and notes.", ["month", "calendar"], monthlyPlanner),
  t("roadmap", "Project roadmap", "Planning", "Teams in lanes across quarters.", ["product", "quarters", "lanes"], roadmap, true),
  t("personal-dashboard", "Personal dashboard", "Planning", "Focus, habits, projects and ideas at a glance.", ["life", "habits"], personalDashboard),
  t("goal-tracking", "Goal tracker", "Planning", "Objectives with key results and progress bars.", ["okr", "progress"], goalTracking),
  t("task-board", "Task board", "Planning", "Kanban columns from backlog to done.", ["kanban", "tasks"], taskBoard, true),
  t("timeline", "Timeline", "Planning", "Milestones along a single line.", ["milestones", "history"], timeline),
  t("gantt", "Gantt plan", "Planning", "Tasks as bars across weeks with a milestone.", ["schedule", "weeks"], gantt),
  t("mind-map", "Mind map", "Thinking", "A central idea with branches and sub-ideas.", ["ideas", "branches"], mindMap, true),
  t("brainstorm", "Brainstorming board", "Thinking", "A question, sticky notes, themes and next steps.", ["sticky notes", "workshop"], brainstorm, true),
  t("concept-map", "Concept map", "Thinking", "Concepts linked by labelled relationships.", ["knowledge", "relationships"], conceptMap),
  t("idea-map", "Idea map", "Thinking", "Expand a seed idea in six directions.", ["creativity", "radial"], ideaMapping),
  t("decision-tree", "Decision tree", "Thinking", "Questions branching to outcomes.", ["choices", "logic"], decisionTree),
  t("swot", "SWOT analysis", "Thinking", "Strengths, weaknesses, opportunities, threats.", ["strategy", "analysis"], swot),
  t("fishbone", "Problem solving", "Thinking", "A fishbone diagram to find root causes.", ["root cause", "ishikawa"], problemSolving),
  t("flowchart", "Flowchart", "Thinking", "Start, process, decision and end shapes.", ["process", "logic"], flowchart, true),
  t("bmc", "Business Model Canvas", "Business", "The nine building blocks of a business model.", ["strategy", "startup"], bmc, true),
  t("lean-canvas", "Lean Canvas", "Business", "A one-page plan for a new product.", ["startup", "mvp"], leanCanvas),
  t("journey-map", "Customer journey map", "Business", "Stages, touchpoints and emotions of a persona.", ["ux", "cx"], customerJourney),
  t("marketing-strategy", "Marketing strategy", "Business", "A funnel and the 4 Ps.", ["funnel", "4p"], marketingStrategy),
  t("competitors", "Competitor analysis", "Business", "Compare competitors side by side.", ["market", "table"], competitorAnalysis),
  t("persona", "User persona", "Business", "Goals, frustrations and behaviours of a user.", ["ux", "research"], persona),
  t("value-prop", "Value proposition canvas", "Business", "Match your offer with customer jobs, pains and gains.", ["product", "fit"], valueProp),
  t("swimlanes", "Business process", "Business", "Swimlanes showing who does what.", ["bpmn", "process"], businessProcess),
  t("web-wireframe", "Website wireframe", "Design & development", "A desktop landing page layout.", ["ui", "landing page"], websiteWireframe, true),
  t("mobile-wireframe", "Mobile app wireframes", "Design & development", "Three phone screens in frames.", ["ui", "ios", "android"], mobileWireframe),
  t("user-flow", "User flow", "Design & development", "Screens and decisions from entry to goal.", ["ux", "flow"], userFlow),
  t("uml-class", "UML class diagram", "Design & development", "Classes with fields, methods and relations.", ["uml", "oop"], umlClass),
  t("software-architecture", "Software architecture", "Design & development", "Application layers and concerns.", ["layers", "clean architecture"], softwareArchitecture),
  t("database", "Database diagram", "Design & development", "Tables, columns and relationships.", ["erd", "sql"], databaseDiagram),
  t("system-architecture", "System architecture", "Design & development", "Clients, services, queues and storage.", ["cloud", "infra"], systemArchitecture),
  t("api-flow", "API flow", "Design & development", "A sequence diagram of an API call.", ["sequence", "backend"], apiFlow),
  t("moodboard", "Moodboard", "Creative", "Images, textures, colours and words.", ["inspiration", "visual"], moodboard, true),
  t("storyboard", "Storyboard", "Creative", "Six scenes with notes.", ["video", "film", "comic"], storyboard),
  t("creative-brief", "Creative brief", "Creative", "The essentials of a creative project.", ["agency", "brief"], creativeBrief),
  t("brand-board", "Brand identity board", "Creative", "Logo, palette, typography and voice.", ["branding", "identity"], brandBoard),
  t("reference-board", "Visual reference board", "Creative", "References with annotations.", ["inspiration", "research"], referenceBoard),
  t("content-plan", "Content planning", "Creative", "A monthly editorial calendar.", ["editorial", "calendar"], contentPlanning),
  t("social-plan", "Social media planning", "Creative", "Posts per platform across the week.", ["social", "calendar"], socialPlanning),
  t("presentation", "Presentation structure", "Creative", "Slides as frames, ready to export as PDF.", ["slides", "deck", "pitch"], presentationStructure),
];

export const TEMPLATE_CATEGORIES: TemplateCategory[] = ["Planning", "Thinking", "Business", "Design & development", "Creative"];

