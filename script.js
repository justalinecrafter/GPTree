const STORAGE_KEY = "timetableData";
const HOLIDAY_API_URL = "https://holidays-jp.github.io/api/v1/date.json";
const PERIODS = 8;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const WEEKDAY_KEYS = [...WEEKDAYS];
const PATTERN_LESSON_RE = /([日月火水木金土])?([ABC])([1-8]+)|([ABC])([日月火水木金土])([1-8]+)/g;

const JSON_TAB_CONTENT = {
  calendar: {
    prompt: `あなたは学校の年間予定表をJSONに変換するアシスタントです。
添付した年間予定表の画像を読み取り、「calendar」だけを使ったJSONを作成してください。

ルール:
- JSON以外の文章は一切出力しない。
- 日付は必ず YYYY-MM-DD 形式にする。
- 年間予定表に明示されている日付だけを登録する。表にない日付を推測して登録しない。
- 通常授業日は type を "A"、"B"、"C" のいずれかにする。
- 変則時間割日は type を "pattern" にする。
- 行事日は type を "special" にし、eventName に行事名を入れる。
- 考査日は type を "exam" にする。
- 行事の日には限目ごとの授業を登録しない。
- 変則時間割では patternItems を使用する。
- patternItems の source は "regular" または "custom"。
- regular の場合は、その日の何限目かを period、参照元の曜日を weekday、参照元の A/B/C を type、参照元の限目を sourcePeriod に指定する。
- custom の場合は、その限の授業を lesson.subject に直接入力する。
- 教科名は画像に書かれている表記をそのまま使う。
- 読み取れない教科名は推測しない。

出力例:
{
  "calendar": [
    { "date": "2026-10-05", "type": "A" },
    { "date": "2026-10-06", "type": "pattern", "patternItems": [
      { "period": 1, "source": "regular", "weekday": "水", "type": "A", "sourcePeriod": 2 },
      { "period": 2, "source": "custom", "lesson": { "subject": "特別授業" } }
    ] },
    { "date": "2026-10-07", "type": "special", "eventName": "文化祭" },
    { "date": "2026-10-16", "type": "exam" }
  ]
}`,
    schema: `calendar は、日付ごとの年間予定設定です。

各要素の基本形:
{
  "date": "2026-10-05",
  "type": "A"
}

type は次のいずれかです。
- A: A時間割
- B: B時間割
- C: C時間割
- pattern: 変則時間割
- special: 行事
- exam: 考査

行事:
{
  "date": "2026-10-07",
  "type": "special",
  "eventName": "文化祭"
}

変則時間割:
{
  "date": "2026-10-08",
  "type": "pattern",
  "patternItems": [
    {
      "period": 1,
      "source": "regular",
      "weekday": "水",
      "type": "A",
      "sourcePeriod": 2
    },
    {
      "period": 2,
      "source": "custom",
      "lesson": { "subject": "特別授業" }
    }
  ]
}
regular は通常時間割の指定、custom はその日だけの直接入力です。`
  },
  schedule: {
    prompt: `あなたは学校の通常時間割表をJSONに変換するアシスタントです。
添付した通常時間割表の画像を読み取り、「schedules」だけを使ったJSONを作成してください。

ルール:
- JSON以外の文章は一切出力しない。
- 前期は schedules.firstTerm、後期は schedules.secondTerm に分ける。
- A/B/Cそれぞれについて、曜日ごとの時間割を作る。
- 曜日は 日、月、火、水、木、金、土 を使用する。
- 各曜日の1〜8限を指定する。
- 授業がない限は登録しない。
- 教科名は画像に書かれている表記をそのまま subject に入れる。
- 教員名や教室名は含めない。
- S/T/Uなどの学校内の記号も、画像に書かれているまま subject に記録する。
- 読み取れない教科名は推測しない。

出力例:
{
  "schedules": {
    "firstTerm": {
      "A": { "月": { "1": { "subject": "数学" } } },
      "B": {},
      "C": {}
    },
    "secondTerm": {
      "A": {},
      "B": {},
      "C": {}
    }
  }
}`,
    schema: `schedules は、曜日ごとの通常時間割です。

構造:
schedules
├ firstTerm
│ ├ A
│ ├ B
│ └ C
└ secondTerm
  ├ A
  ├ B
  └ C

A/B/C の中に曜日があり、曜日の中に1〜8限を入れます。

例:
{
  "schedules": {
    "secondTerm": {
      "A": {
        "水": {
          "1": { "subject": "数学α" },
          "2": { "subject": "S" },
          "3": { "subject": "Q" }
        }
      }
    }
  }
}`
  },
  exam: {
    prompt: `あなたは学校の考査時間割表をJSONに変換するアシスタントです。
添付した考査日程表の画像を読み取り、「examData」だけを使ったJSONを作成してください。

ルール:
- JSON以外の文章は一切出力しない。
- 日付は必ず YYYY-MM-DD 形式にする。
- 日付ごとに、何限目が何の教科かを記録する。
- 考査の教科名は画像の表記をそのまま subject に入れる。
- 教員名や教室名は含めない。
- 通常時間割やA/B/Cは使用しない。
- 授業が存在しない限は登録しない。
- 読み取れない教科名は推測しない。

出力例:
{
  "examData": {
    "2026-10-16": {
      "1": { "subject": "数学" },
      "2": { "subject": "英語" },
      "3": { "subject": "国語" }
    }
  }
}`,
    schema: `examData は、考査日ごとの考査時間割です。

例:
{
  "examData": {
    "2026-10-16": {
      "1": { "subject": "数学" },
      "2": { "subject": "英語" }
    }
  }
}

この例では、2026-10-16 の1限が数学、2限が英語です。
考査日は通常の schedules を参照せず、examData の内容だけで表示されます。`
  },
  override: {
    prompt: `あなたは学校の時間割変更表をJSONに変換するアシスタントです。
添付した時間割変更表を読み取り、「overrides」だけを使ったJSONを作成してください。

ルール:
- JSON以外の文章は一切出力しない。
- 日付は必ず YYYY-MM-DD 形式にする。
- 時間割変更は、その日・その限の授業だけを変更する。
- 各日付の periods に、変更する限だけを入れる。
- 教科名は画像の表記をそのまま subject に入れる。
- 変更されない限は登録しない。
- 読み取れない教科名は推測しない。

出力例:
{
  "overrides": {
    "2026-10-15": {
      "periods": {
        "3": { "subject": "英語" }
      }
    },
    "2026-10-20": {
      "periods": {
        "1": { "subject": "数学" },
        "4": { "subject": "体育" }
      }
    }
  }
}`,
    schema: `overrides は、その日・その限だけの時間割変更です。

例:
{
  "overrides": {
    "2026-10-15": {
      "periods": {
        "3": { "subject": "英語" }
      }
    }
  }
}

これは 2026-10-15 の3限だけを上書きします。
年間予定の種類そのものは変更しません。
考査日の変更は overrides ではなく examData を使います。
現在のデータ構造では scheduleType / specialType / pattern は使用しません。`
  },
  all: {
    prompt: `全体のJSONに関しては、主にアプリから出力された全体のJSONデータを扱います。 `,
    schema: `全体JSONは、localStorage に保存されるアプリデータ全体です。

主な構造:
{
  "version": 6,
  "settings": {},
  "schedules": {},
  "specialSchedules": {},
  "examData": {},
  "calendar": [],
  "overrides": {}
}

settings:
- termChangeMonth: 後期開始月
- subjectColors: 教科ごとの背景色
- subjectColorExcluded: 教科色設定から除外した教科
- subjectNames: 教科の表示名
- subjectNameExcluded: 教科名設定から除外した教科
- weekdayColors: 曜日ごとの日付ヘッダー色
- holidayColor: 祝日のヘッダー色
- scheduleTypeColors: A/B/C/変則/行事/考査/未入力の背景色
- holidays: 祝日の日付一覧

schedules:
前期・後期 × A/B/C × 曜日 × 1〜8限 の通常時間割です。

calendar:
日付ごとの A/B/C、変則、行事、考査を管理します。

examData:
考査日の限ごとの教科です。

利用中の行事は calendar の type: "special" と eventName で表します。specialSchedules は現在の行事入力には通常使用しない旧データ領域です。

overrides:
通常授業について、その日・その限だけを上書きします。`
  }
};

function emptyData() {
  return {
    version: 6,
    settings: {
      termChangeMonth: 10,
      subjectColors: {},
      subjectColorExcluded: [],
      subjectNames: {},
      subjectNameExcluded: [],
      weekdayColors: {
        "日": "#fff0f0",
        "月": "#ffffff",
        "火": "#ffffff",
        "水": "#ffffff",
        "木": "#ffffff",
        "金": "#ffffff",
        "土": "#f0f6ff"
      },
      holidayColor: "#ffdfe3",
      scheduleTypeColors: {
        "A": "#ffffff",
        "B": "#ffffff",
        "C": "#ffffff",
        "pattern": "#ffffff",
        "special": "#ffffff",
        "exam": "#ffffff",
        "unentered": "#ffffff"
      },
      holidays: []
    },
    schedules: {
      firstTerm: { A: {}, B: {}, C: {} },
      secondTerm: { A: {}, B: {}, C: {} }
    },
    specialSchedules: {},
    examData: {},
    calendar: [],
    overrides: {}
  };
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return b;
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : value;
  }
  return out;
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
function pad2(n) { return String(n).padStart(2, "0"); }
function isValidDateKey(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00`)); }
function toDateKey(date) { return `${date.getFullYear()}-${pad2(date.getMonth()+1)}-${pad2(date.getDate())}`; }
function fromDateKey(key) { const [y,m,d] = key.split("-").map(Number); return new Date(y,m-1,d); }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate()+days); return d; }
function getMonday(date) { const d = new Date(date); d.setHours(0,0,0,0); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1-day)); return d; }
function isSameDate(a,b) { return toDateKey(a) === toDateKey(b); }
function formatDateJP(date) { return `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）`; }
function getWeekdayKey(date) { return WEEKDAY_KEYS[date.getDay()]; }
function getTermForDate(date) { return date.getMonth()+1 >= appData.settings.termChangeMonth ? "secondTerm" : "firstTerm"; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch])); }
function normalizeLesson(lesson) {
  if (!isPlainObject(lesson)) return null;
  const out = {};
  const subject = String(lesson.subject || "").trim();
  const note = String(lesson.note || "").trim();
  const time = String(lesson.time || "").trim();
  if (subject) out.subject = subject;
  if (note) out.note = note;
  if (time) out.time = time;
  return Object.keys(out).length ? out : null;
}
function cloneLesson(lesson) { return normalizeLesson(lesson); }
function makeLesson(subject="", note="", time="") {
  const lesson = { subject: String(subject).trim(), note: String(note).trim(), time: String(time).trim() };
  return normalizeLesson(lesson);
}

function normalizePeriodTable(table) {
  const out = {};
  if (!isPlainObject(table)) return out;
  for (let p=1;p<=PERIODS;p++) {
    const lesson = normalizeLesson(table[String(p)]);
    if (lesson) out[String(p)] = lesson;
  }
  return out;
}

function normalizeScheduleTable(table) {
  const out = { A: {}, B: {}, C: {} };
  if (!isPlainObject(table)) return out;
  for (const type of ["A","B","C"]) {
    const source = isPlainObject(table[type]) ? table[type] : {};
    const looksWeekdayBased = Object.keys(source).some(k => WEEKDAY_KEYS.includes(k));
    if (looksWeekdayBased) {
      for (const day of WEEKDAY_KEYS) out[type][day] = normalizePeriodTable(source[day]);
    } else {
      const oldPeriods = normalizePeriodTable(source);
      for (const day of WEEKDAY_KEYS) out[type][day] = { ...oldPeriods };
    }
  }
  return out;
}

function normalizePattern(pattern) {
  if (typeof pattern !== "string") return null;
  const value = pattern.toUpperCase().replace(/[\s,、・/]+/g, "");
  if (!value) return null;
  PATTERN_LESSON_RE.lastIndex = 0;
  let pos = 0;
  const items = [];
  let m;
  while ((m = PATTERN_LESSON_RE.exec(value)) !== null) {
    if (m.index !== pos) return null;
    const weekday = m[1] || m[5] || null;
    const type = m[2] || m[4];
    const periodText = m[3] || m[6];
    const period = Number(periodText);
    if (!Number.isInteger(period) || period < 1 || period > PERIODS) return null;
    items.push({ weekday, type, period });
    pos = PATTERN_LESSON_RE.lastIndex;
  }
  if (pos !== value.length || !items.length) return null;
  return items.map(x => `${x.weekday ? x.weekday : ""}${x.type}${x.period}`).join("");
}

function parsePattern(pattern, defaultWeekday = null) {
  const normalized = normalizePattern(pattern);
  if (!normalized) return [];
  PATTERN_LESSON_RE.lastIndex = 0;
  const items = [];
  let m;
  while ((m = PATTERN_LESSON_RE.exec(normalized)) !== null) {
    items.push({ weekday: m[1] || m[5] || defaultWeekday, type: m[2] || m[4], period: Number(m[3] || m[6]) });
  }
  return items;
}

function normalizePatternItem(item, fallbackPeriod = 1) {
  if (!isPlainObject(item)) return null;
  const period = Number(item.period ?? fallbackPeriod);
  if (!Number.isInteger(period) || period < 1 || period > PERIODS) return null;
  const source = item.source === "custom" ? "custom" : "regular";
  if (source === "custom") {
    const lesson = normalizeLesson(item.lesson);
    if (!lesson) return null;
    return { period, source: "custom", lesson };
  }
  const weekday = WEEKDAY_KEYS.includes(item.weekday) ? item.weekday : null;
  const type = ["A","B","C"].includes(item.type) ? item.type : null;
  const sourcePeriod = Number(item.sourcePeriod ?? item.period);
  if (!weekday || !type || !Number.isInteger(sourcePeriod) || sourcePeriod < 1 || sourcePeriod > PERIODS) return null;
  return { period, source: "regular", weekday, type, sourcePeriod };
}

function normalizeCalendarEntry(entry) {
  if (!entry || !isValidDateKey(entry.date)) return null;
  const out = { date: entry.date };
  const rawType = typeof entry.type === "string" ? entry.type.trim() : "";
  const patternFromType = normalizePattern(rawType);
  if (typeof entry.note === "string" && entry.note.trim()) out.note = entry.note.trim();
  if (["A","B","C"].includes(rawType)) {
    out.type = rawType;
  } else if (rawType === "special") {
    out.type = "special";
    out.eventName = String(entry.eventName || "").trim();
    // 旧データ（行事時間割ID）との互換用
    if (entry.specialType) out.specialType = String(entry.specialType).trim();
  } else if (rawType === "exam") {
    out.type = "exam";
  } else if (rawType === "event") {
    // 旧データ互換: 「予定のみ」は現在は使わず、行事として移行する。
    out.type = "special";
    out.eventName = String(entry.eventName || entry.note || "").trim();
  } else if (rawType === "pattern") {
    let items = Array.isArray(entry.patternItems)
      ? entry.patternItems.map((item,i)=>normalizePatternItem(item,i+1)).filter(Boolean)
      : [];
    if (items.length) {
      out.type = "pattern";
      out.patternItems = items;
      if (entry.pattern) out.pattern = normalizePattern(entry.pattern);
    } else {
      const p = normalizePattern(entry.pattern);
      if (!p) return null;
      out.type = "pattern";
      out.pattern = p;
    }
  } else if (patternFromType) {
    out.type = "pattern";
    out.pattern = patternFromType;
  } else {
    return null;
  }
  return out;
}

function normalizeOverride(override) {
  const out = { periods:{} };
  if (!isPlainObject(override)) return out;
  if (isPlainObject(override.periods)) out.periods = override.periods;
  return out;
}

function collectSubjects(data) {
  const set = new Set();
  const visit = value => {
    if (!isPlainObject(value)) return;
    for (const item of Object.values(value)) {
      if (item && typeof item.subject === "string" && item.subject.trim()) set.add(item.subject.trim());
    }
  };
  const schedules = data?.schedules || {};
  for (const term of ["firstTerm", "secondTerm"]) {
    for (const type of ["A", "B", "C"]) {
      for (const day of WEEKDAY_KEYS) visit(schedules?.[term]?.[type]?.[day]);
    }
  }
  for (const value of Object.values(data?.specialSchedules || {})) visit(value);
  for (const value of Object.values(data?.examData || {})) visit(value);
  for (const value of Object.values(data?.overrides || {})) visit(value?.periods);
  for (const entry of data?.calendar || []) {
    if (Array.isArray(entry?.patternItems)) {
      for (const item of entry.patternItems) if (item?.source === "custom") visit({ "1": item.lesson });
    }
  }
  return [...set];
}

function ensureSubjectColors(data) {
  if (!isPlainObject(data) || !isPlainObject(data.settings)) return data;
  data.settings.subjectColors = isPlainObject(data.settings.subjectColors) ? data.settings.subjectColors : {};
  data.settings.subjectColorExcluded = Array.isArray(data.settings.subjectColorExcluded)
    ? [...new Set(data.settings.subjectColorExcluded.map(v => String(v).trim()).filter(Boolean))]
    : [];

  const excluded = new Set(data.settings.subjectColorExcluded);
  for (const subject of collectSubjects(data)) {
    if (!subject || excluded.has(subject)) continue;
    if (!Object.prototype.hasOwnProperty.call(data.settings.subjectColors, subject)) {
      data.settings.subjectColors[subject] = "#f4f7fb";
    }
  }
  return data;
}

function normalizeData(data) {
  const source = isPlainObject(data) ? data : {};
  const sourceVersion = Number(source.version) || 1;
  const base = emptyData();
  const merged = deepMerge(base, source);
  merged.version = 6;
  merged.settings.termChangeMonth = clamp(Number(merged.settings.termChangeMonth) || 10, 1, 12);
  merged.settings.subjectColors = isPlainObject(merged.settings.subjectColors) ? merged.settings.subjectColors : {};
  merged.settings.subjectNames = isPlainObject(merged.settings.subjectNames) ? merged.settings.subjectNames : {};
  merged.settings.subjectNameExcluded = Array.isArray(merged.settings.subjectNameExcluded)
    ? [...new Set(merged.settings.subjectNameExcluded.map(v => String(v).trim()).filter(Boolean))]
    : [];
  merged.settings.subjectColorExcluded = Array.isArray(merged.settings.subjectColorExcluded)
    ? [...new Set(merged.settings.subjectColorExcluded.map(v => String(v).trim()).filter(Boolean))]
    : [];

  // 以前の subjectNames（教科の名前→教科名）を subjectNames に移行する。
  if (isPlainObject(source.settings?.electiveCodes)) {
    for (const [original, displayName] of Object.entries(source.settings.electiveCodes)) {
      if (!Object.prototype.hasOwnProperty.call(merged.settings.subjectNames, original)) {
        merged.settings.subjectNames[original] = String(displayName ?? "").trim() || original;
      }
    }
  }
  delete merged.settings.electiveCodes;
  merged.settings.weekdayColors = isPlainObject(merged.settings.weekdayColors) ? merged.settings.weekdayColors : {};
  for (const day of WEEKDAY_KEYS) {
    if (typeof merged.settings.weekdayColors[day] !== "string" || !/^#[0-9a-fA-F]{6}$/.test(merged.settings.weekdayColors[day])) {
      merged.settings.weekdayColors[day] = base.settings.weekdayColors[day];
    }
  }
  merged.settings.holidayColor = /^#[0-9a-fA-F]{6}$/.test(String(merged.settings.holidayColor || ""))
    ? merged.settings.holidayColor
    : base.settings.holidayColor;
  merged.settings.scheduleTypeColors = isPlainObject(merged.settings.scheduleTypeColors) ? merged.settings.scheduleTypeColors : {};
  for (const type of ["A","B","C","pattern","special","exam","unentered"]) {
    if (typeof merged.settings.scheduleTypeColors[type] !== "string" || !/^#[0-9a-fA-F]{6}$/.test(merged.settings.scheduleTypeColors[type])) {
      merged.settings.scheduleTypeColors[type] = base.settings.scheduleTypeColors[type];
    }
  }
  merged.settings.holidays = Array.isArray(merged.settings.holidays)
    ? [...new Set(merged.settings.holidays.filter(isValidDateKey))].sort()
    : [];
  merged.schedules = {
    firstTerm: normalizeScheduleTable(merged.schedules?.firstTerm),
    secondTerm: normalizeScheduleTable(merged.schedules?.secondTerm)
  };
  merged.specialSchedules = isPlainObject(merged.specialSchedules) ? merged.specialSchedules : {};
  for (const [key, value] of Object.entries(merged.specialSchedules)) {
    if (isPlainObject(value)) {
      const clean = { ...value };
      for (let p=1;p<=PERIODS;p++) {
        const lesson = normalizeLesson(value[String(p)]);
        if (lesson) clean[String(p)] = lesson;
        else delete clean[String(p)];
      }
      merged.specialSchedules[key] = clean;
    }
  }
  merged.examData = isPlainObject(merged.examData) ? merged.examData : {};
  for (const [date, exam] of Object.entries(merged.examData)) merged.examData[date] = normalizePeriodTable(exam);
  merged.calendar = Array.isArray(merged.calendar)
    ? merged.calendar.map(normalizeCalendarEntry).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date))
    : [];
  const overrides = {};
  if (isPlainObject(merged.overrides)) {
    for (const [date, value] of Object.entries(merged.overrides)) {
      if (!isValidDateKey(date)) continue;
      const normalizedOverride = normalizeOverride(value);
      normalizedOverride.periods = normalizePeriodTable(normalizedOverride.periods);
      overrides[date] = normalizedOverride;
    }
  }
  merged.overrides = overrides;

  // 以前のデータでは教科色設定が未初期化の場合がある。
  // 現在の時間割に登場する教科は自動で色設定欄へ登録するが、
  // ユーザーが「削除」した教科は subjectColorExcluded に残し、再表示しない。
  if (sourceVersion < 4 && Object.keys(merged.settings.subjectColors).length === 0) {
    for (const subject of collectSubjects(merged)) {
      if (!merged.settings.subjectColors[subject]) merged.settings.subjectColors[subject] = "#f4f7fb";
    }
  }

  for (const subject of merged.settings.subjectColorExcluded) {
    delete merged.settings.subjectColors[subject];
  }

  ensureSubjectColors(merged);
  return merged;
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyData();
  try { return normalizeData(JSON.parse(raw)); }
  catch (error) { console.error(error); return emptyData(); }
}

let appData = loadData();
let currentWeekStart = getMonday(new Date());
let timetableDisplayMode = "date";
let selectedSubjectForList = "";

function saveData() {
  appData = normalizeData(appData);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

function getCalendarEntry(dateKey) { return appData.calendar.find(x => x.date === dateKey) || null; }
function resolveSubject(subject) { return subject ? (appData.settings.subjectNames[subject] || subject) : ""; }
function subjectColor(subject) {
  const actual = resolveSubject(subject);
  return appData.settings.subjectColors[subject] || appData.settings.subjectColors[actual] || "#f4f7fb";
}
function getRegularLesson(date, type, period, weekdayOverride = null) {
  const term = getTermForDate(date);
  const weekday = weekdayOverride || getWeekdayKey(date);
  return cloneLesson(appData.schedules?.[term]?.[type]?.[weekday]?.[String(period)] || null);
}

function buildPatternSchedule(date, patternOrItems) {
  const periods = {};
  if (Array.isArray(patternOrItems)) {
    for (let i=0;i<patternOrItems.length;i++) {
      const item = normalizePatternItem(patternOrItems[i], i+1);
      if (!item) continue;
      if (item.source === "custom") periods[item.period] = cloneLesson(item.lesson);
      else periods[item.period] = getRegularLesson(date, item.type, item.sourcePeriod, item.weekday);
    }
    return periods;
  }
  for (const item of parsePattern(patternOrItems, getWeekdayKey(date))) {
    periods[item.period] = getRegularLesson(date, item.type, item.period, item.weekday || getWeekdayKey(date));
  }
  return periods;
}

function getResolvedSchedule(date) {
  const dateKey = toDateKey(date);
  const entry = getCalendarEntry(dateKey);
  const override = appData.overrides[dateKey] || null;

  // 未入力日は未入力のまま。Aへの暗黙フォールバックはしない。
  let type = entry?.type || null;
  let specialType = entry?.specialType || null;
  let eventName = entry?.eventName || null;
  let pattern = entry?.pattern || null;
  let patternItems = entry?.patternItems || null;
  const note = entry?.note || "";

  const periods = {};
  let label = "未入力";

  if (type === "exam") {
    const exam = appData.examData[dateKey] || {};
    for (let p=1;p<=PERIODS;p++) periods[p] = cloneLesson(exam[String(p)] || null);
    label = "考査";
  } else if (type === "special") {
    // 行事は一日単位。旧データ（行事時間割ID）は、登録済みの表示名かIDを行事名として使う。
    eventName = eventName || appData.specialSchedules[specialType]?.title || specialType || "行事";
    label = "行事";
  } else if (type === "pattern") {
    Object.assign(periods, buildPatternSchedule(date, patternItems || pattern));
    label = "変則";
  } else if (["A","B","C"].includes(type)) {
    for (let p=1;p<=PERIODS;p++) periods[p] = getRegularLesson(date, type, p);
    label = `${type}・${getWeekdayKey(date)}`;
  }

  // 考査日は examData を唯一の授業データ源とし、overrides は適用しない。
  if (type !== "exam") {
    for (let p=1;p<=PERIODS;p++) if (override?.periods?.[String(p)]) periods[p] = cloneLesson(override.periods[String(p)]);
  }
  const shownEventName = type === "special" ? eventName : null;
  return { periods, label, type, specialType, pattern, patternItems, note, eventName: shownEventName };
}

function isHoliday(date) {
  return appData.settings.holidays.includes(toDateKey(date));
}

function getDayHeaderColor(date) {
  if (isHoliday(date)) return appData.settings.holidayColor;
  return appData.settings.weekdayColors[getWeekdayKey(date)] || "#ffffff";
}

function getScheduleTypeColor(type) {
  const key = type || "unentered";
  return appData.settings.scheduleTypeColors?.[key] || "#ffffff";
}

function renderWeek() {
  const container = document.getElementById("view-timetable");
  if (timetableDisplayMode === "subject") {
    renderSubjectList(container);
    return;
  }

  const today = new Date();
  const end = addDays(currentWeekStart, 6);
  document.getElementById("week-range").textContent = `${currentWeekStart.getFullYear()}年${currentWeekStart.getMonth()+1}月${currentWeekStart.getDate()}日〜${end.getMonth()+1}月${end.getDate()}日`;
  document.getElementById("timetable-mode-toggle").textContent = "教科別";
  container.innerHTML = "";

  for (let i=0;i<7;i++) {
    const date = addDays(currentWeekStart,i);
    const resolved = getResolvedSchedule(date);
    const section = document.createElement("section");
    section.className = "day-section day-section-editable";
    section.title = "タップしてこの日の設定を変更";
    section.addEventListener("click", () => openDayDetailModal(date));

    const header = document.createElement("div");
    header.className = `day-header${isSameDate(date,today) ? " today" : ""}`;
    header.style.background = getDayHeaderColor(date);
    if (isHoliday(date)) header.classList.add("holiday");
    header.innerHTML = `<span class="day-name">${WEEKDAYS[date.getDay()]}</span><span class="day-date">${date.getMonth()+1}/${date.getDate()}</span>${resolved.type === "exam" ? `<span class="day-status-badge exam">考査</span>` : ""}<span class="day-meta">${resolved.type === "exam" ? "" : escapeHTML(resolved.label)}${resolved.type !== "exam" && resolved.note ? ` / ${escapeHTML(resolved.note)}` : ""}</span>`;
    section.appendChild(header);

    const list = document.createElement("div");
    list.className = "lesson-list";
    list.style.background = getScheduleTypeColor(resolved.type);
    let hasLesson = false;

    if (resolved.eventName) {
      const ev = document.createElement("div");
      ev.className = "event-card";
      ev.textContent = resolved.eventName;
      list.appendChild(ev);
    }

    for (let p=1;p<=PERIODS;p++) {
      const lesson = resolved.periods[p];
      if (lesson) hasLesson = true;
      if (resolved.eventName && !lesson) continue;
      const card = document.createElement("button");
      card.className = `lesson-card${lesson ? "" : " empty"}`;
      if (lesson) card.style.background = subjectColor(lesson.subject);
      const overridden = Boolean(appData.overrides?.[toDateKey(date)]?.periods?.[String(p)]);
      card.innerHTML = lesson
        ? `<div class="period">${p}時間目</div>${overridden ? `<div class="lesson-status">変更済み</div>` : ""}${lesson.time ? `<div class="lesson-time">${escapeHTML(lesson.time)}</div>` : ""}<div class="lesson-title">${escapeHTML(resolveSubject(lesson.subject) || "（教科未設定）")}</div>`
        : `<div class="period">${p}時間目</div><div class="lesson-title">—</div>`;
      card.addEventListener("click", (event) => {
        event.stopPropagation();
        openLessonModal(date,p,lesson,resolved.label);
      });
      list.appendChild(card);
    }
    if (!hasLesson) list.setAttribute("aria-label", resolved.type === null ? "年間予定未入力" : "授業データがありません");
    section.appendChild(list);
    container.appendChild(section);
  }
}

function getSubjectListCandidates() {
  const set = new Set();
  const addLesson = lesson => {
    if (lesson && typeof lesson.subject === "string" && lesson.subject.trim()) set.add(lesson.subject.trim());
  };
  for (const term of ["firstTerm","secondTerm"]) {
    for (const type of ["A","B","C"]) {
      for (const day of WEEKDAY_KEYS) {
        const table = appData.schedules?.[term]?.[type]?.[day] || {};
        for (const lesson of Object.values(table)) addLesson(lesson);
      }
    }
  }
  for (const entry of appData.calendar || []) {
    if (entry.type !== "pattern" || !Array.isArray(entry.patternItems)) continue;
    for (const item of entry.patternItems) {
      if (item?.source !== "regular") continue;
      addLesson(getRegularLesson(fromDateKey(entry.date), item.type, Number(item.sourcePeriod), item.weekday));
    }
  }
  for (const override of Object.values(appData.overrides || {})) {
    for (const lesson of Object.values(override?.periods || {})) addLesson(lesson);
  }
  return [...set].sort((a,b)=>String(resolveSubject(a)).localeCompare(String(resolveSubject(b)),"ja"));
}

function isSubjectOccurrenceEligible(date, period, resolved) {
  const dateKey = toDateKey(date);
  const lesson = resolved.periods[period];
  if (!lesson || !lesson.subject) return false;
  if (resolved.type === "exam" || resolved.type === "special" || resolved.type === "event") return false;

  // その限に対する override は、元の種類に関係なく通常の授業として対象にする。
  if (appData.overrides?.[dateKey]?.periods?.[String(period)]) return true;

  if (["A","B","C"].includes(resolved.type)) return true;
  if (resolved.type !== "pattern") return false;

  const entry = getCalendarEntry(dateKey);
  const item = Array.isArray(entry?.patternItems) ? entry.patternItems.find(x=>Number(x?.period)===period) : null;
  return item?.source === "regular";
}

function collectSubjectOccurrences(subject) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const futureKeys = [];
  const allDates = new Set();
  for (const entry of appData.calendar || []) if (isValidDateKey(entry.date)) allDates.add(entry.date);
  for (const date of Object.keys(appData.overrides || {})) if (isValidDateKey(date)) allDates.add(date);
  const sortedDates = [...allDates].sort();
  const targetSubject = String(subject || "").trim();
  for (const key of sortedDates) {
    const date = fromDateKey(key);
    if (date < today) continue;
    const entry = getCalendarEntry(key);
    if (entry?.type === "exam" || entry?.type === "special" || entry?.type === "event") continue;
    const resolved = getResolvedSchedule(date);
    const periods = [];
    for (let p=1;p<=PERIODS;p++) {
      const lesson = resolved.periods[p];
      if (!isSubjectOccurrenceEligible(date,p,resolved)) continue;
      if (String(lesson.subject).trim() !== targetSubject) continue;
      periods.push(p);
    }
    if (periods.length) futureKeys.push({dateKey:key,date,periods});
  }
  return futureKeys;
}

function renderSubjectList(container) {
  const candidates = getSubjectListCandidates();
  if (!selectedSubjectForList || !candidates.includes(selectedSubjectForList)) selectedSubjectForList = candidates[0] || "";
  document.getElementById("week-range").textContent = "教科別の授業一覧";
  document.getElementById("timetable-mode-toggle").textContent = "日付別";
  document.getElementById("prev-week").hidden = true;
  document.getElementById("today-button").hidden = true;
  document.getElementById("next-week").hidden = true;
  container.innerHTML = "";

  const panel = document.createElement("div");
  panel.className = "subject-list-panel";

  const selectorCard = document.createElement("div");
  selectorCard.className = "card subject-selector-card";
  selectorCard.innerHTML = `<div class="form-field"><label for="subject-list-select">教科</label><select id="subject-list-select"><option value="">${candidates.length ? "選択してください" : "教科がありません"}</option>${candidates.map(subject=>`<option value="${escapeHTML(subject)}" ${subject===selectedSubjectForList?"selected":""}>${escapeHTML(resolveSubject(subject))}</option>`).join("")}</select></div><p class="muted">今日から先の授業を近い日付順に表示します。考査・行事・変則時間割のカスタム授業は含みません。</p>`;
  panel.appendChild(selectorCard);

  const listCard = document.createElement("div");
  listCard.className = "card subject-occurrence-card";
  const selectedLabel = resolveSubject(selectedSubjectForList) || selectedSubjectForList;
  listCard.innerHTML = `<h3>${escapeHTML(selectedLabel || "教科を選択してください")}</h3>`;
  const occurrences = selectedSubjectForList ? collectSubjectOccurrences(selectedSubjectForList) : [];
  if (!occurrences.length) {
    listCard.insertAdjacentHTML("beforeend", `<div class="muted subject-empty-message">今後の授業予定はありません。</div>`);
  } else {
    const rows = document.createElement("div");
    rows.className = "subject-occurrence-list";
    rows.innerHTML = occurrences.map(item=>{
      const date = item.date;
      const dayLabel = WEEKDAYS[date.getDay()];
      const periodLabel = item.periods.map(p=>`${p}限`).join("・");
      const overridden = item.periods.some(p=>Boolean(appData.overrides?.[item.dateKey]?.periods?.[String(p)]));
      return `<div class="subject-occurrence-row"><span class="subject-occurrence-date">${date.getMonth()+1}/${date.getDate()}（${dayLabel}）</span><span class="subject-occurrence-period">${periodLabel}</span>${overridden ? `<span class="subject-occurrence-status">変更済み</span>` : ""}</div>`;
    }).join("");
    listCard.appendChild(rows);
  }
  panel.appendChild(listCard);
  container.appendChild(panel);

  const select=document.getElementById("subject-list-select");
  select.addEventListener("change",()=>{
    selectedSubjectForList=select.value;
    renderWeek();
  });
}

function openDayDetailModal(date) {
  const overlay = document.getElementById("lesson-modal");
  const content = document.getElementById("modal-content");
  const dateKey = toDateKey(date);
  const existing = getCalendarEntry(dateKey);

  content.innerHTML = `
    <h2 id="modal-title" class="edit-primary-title">${escapeHTML(formatDateJP(date))}</h2>
    <div class="edit-change-section">
      <div class="edit-change-label">変更</div>
      <div class="day-detail-form">
      <div class="form-field">
        <label for="day-detail-type">種類を変更</label>
        <select id="day-detail-type">
          <option value="">未入力</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="pattern">変則</option>
          <option value="special">行事</option>
          <option value="exam">考査</option>
        </select>
      </div>
      <div id="day-detail-pattern-wrap" class="form-field full" hidden>
        <label>変則時間割を変更</label>
        <div id="day-detail-pattern-editor" class="pattern-editor"></div>
        <div class="pattern-help">各行は「その日の1〜8限」です。通常時間割から参照するか、カスタムで直接授業を入力できます。</div>
      </div>
      <div id="day-detail-special-wrap" class="form-field full" hidden>
        <label for="day-detail-special">行事名を変更</label>
        <input id="day-detail-special" type="text" placeholder="例: 文化祭、体育祭">
      </div>
        <p id="day-detail-exam-help" class="muted" hidden>考査の各限の教科は「考査」から入力・変更します。この画面では、この日を考査日にするかどうかだけ変更できます。</p>
      </div>
    </div>
    <div class="button-row">
      <button id="save-day-detail" class="primary-button">この日の設定を保存</button>
      <button id="delete-day-detail" class="danger-button">年間予定設定を削除</button>
    </div>`;

  const typeInput = document.getElementById("day-detail-type");
  const patternWrap = document.getElementById("day-detail-pattern-wrap");
  const specialWrap = document.getElementById("day-detail-special-wrap");
  const examHelp = document.getElementById("day-detail-exam-help");
  const specialInput = document.getElementById("day-detail-special");
  typeInput.value = existing?.type || "";
  specialInput.value = existing?.eventName || existing?.specialType || "";

  function defaultPatternItems() {
    const day = getWeekdayKey(date);
    return Array.from({length: PERIODS}, (_, i) => ({
      period: i + 1, source: "regular", weekday: day, type: "A", sourcePeriod: i + 1
    }));
  }

  function existingPatternItems() {
    if (Array.isArray(existing?.patternItems) && existing.patternItems.length) return existing.patternItems;
    if (existing?.pattern) {
      return parsePattern(existing.pattern, getWeekdayKey(date)).map(x => ({
        period: x.period, source: "regular", weekday: x.weekday || getWeekdayKey(date), type: x.type, sourcePeriod: x.period
      }));
    }
    return null;
  }

  function drawPatternEditor(items) {
    const editor = document.getElementById("day-detail-pattern-editor");
    const current = Array.isArray(items) ? items : [];
    editor.innerHTML = Array.from({length: PERIODS}, (_, i) => {
      const p = i + 1;
      const raw = current.find(x => Number(x?.period) === p);
      const item = raw || defaultPatternItems()[i];
      const custom = item.source === "custom";
      const lesson = item.lesson || {};
      return `<div class="pattern-row" data-pattern-row="${p}">
        <div class="pattern-target">${p}限</div>
        <select data-pattern-source title="入力方法"><option value="regular" ${!custom ? "selected" : ""}>通常</option><option value="custom" ${custom ? "selected" : ""}>カスタム</option></select>
        <select data-pattern-weekday title="曜日">${WEEKDAY_KEYS.map(d => `<option value="${d}" ${d === item.weekday ? "selected" : ""}>${d}</option>`).join("")}</select>
        <select data-pattern-type title="パターン">${["A","B","C"].map(t => `<option value="${t}" ${t === item.type ? "selected" : ""}>${t}</option>`).join("")}</select>
        <select data-pattern-source-period title="参照元の限目">${Array.from({length: PERIODS}, (_, j) => `<option value="${j + 1}" ${j + 1 === Number(item.sourcePeriod || p) ? "selected" : ""}>${j + 1}</option>`).join("")}</select>
        <div class="pattern-custom-fields" ${custom ? "" : "hidden"}>
          <input data-pattern-custom-field="subject" type="text" value="${escapeHTML(lesson.subject || "")}" placeholder="教科">
        </div>
      </div>`;
    }).join("");

    const refreshRow = row => {
      const custom = row.querySelector("[data-pattern-source]").value === "custom";
      row.querySelectorAll("[data-pattern-weekday], [data-pattern-type], [data-pattern-source-period]").forEach(x => x.disabled = custom);
      row.querySelector(".pattern-custom-fields").hidden = !custom;
    };
    editor.querySelectorAll(".pattern-row").forEach(row => {
      refreshRow(row);
      row.querySelector("[data-pattern-source]").addEventListener("change", () => refreshRow(row));
    });
  }

  function updateDayDetailVisibility() {
    const type = typeInput.value;
    patternWrap.hidden = type !== "pattern";
    specialWrap.hidden = type !== "special";
    examHelp.hidden = type !== "exam";
    if (type === "pattern") drawPatternEditor(existingPatternItems());
  }

  typeInput.addEventListener("change", updateDayDetailVisibility);
  updateDayDetailVisibility();

  document.getElementById("save-day-detail").addEventListener("click", () => {
    const type = typeInput.value;
    if (!type) {
      appData.calendar = appData.calendar.filter(x => x.date !== dateKey);
      saveData();
      closeModal();
      renderWeek();
      return;
    }

    const entry = { date: dateKey, type };
    if (type === "pattern") {
      const items = [];
      document.querySelectorAll("#day-detail-pattern-editor .pattern-row").forEach(row => {
        const period = Number(row.dataset.patternRow);
        const source = row.querySelector("[data-pattern-source]").value;
        if (source === "custom") {
          const subject = row.querySelector('[data-pattern-custom-field="subject"]').value.trim();
          if (subject) items.push({period, source:"custom", lesson:{subject}});
        } else {
          items.push({
            period, source:"regular",
            weekday:row.querySelector("[data-pattern-weekday]").value,
            type:row.querySelector("[data-pattern-type]").value,
            sourcePeriod:Number(row.querySelector("[data-pattern-source-period]").value)
          });
        }
      });
      if (!items.length) return alert("変則時間割を少なくとも1限指定してください。");
      entry.patternItems = items;
    }
    if (type === "special") {
      const name = specialInput.value.trim();
      if (!name) return alert("行事名を入力してください。");
      entry.eventName = name;
    }
    const normalized = normalizeCalendarEntry(entry);
    if (!normalized) return alert("入力内容を確認してください。");
    const index = appData.calendar.findIndex(x => x.date === dateKey);
    if (index >= 0) appData.calendar[index] = normalized;
    else appData.calendar.push(normalized);
    saveData();
    closeModal();
    renderWeek();
  });

  document.getElementById("delete-day-detail").addEventListener("click", () => {
    if (!getCalendarEntry(dateKey)) return alert("この日に年間予定の設定はありません。");
    if (!confirm(`${dateKey} の年間予定設定を削除しますか？`)) return;
    appData.calendar = appData.calendar.filter(x => x.date !== dateKey);
    saveData();
    closeModal();
    renderWeek();
  });

  overlay.classList.remove("hidden");
}

function openLessonModal(date, period, lesson, label) {
  const overlay = document.getElementById("lesson-modal");
  const content = document.getElementById("modal-content");
  const dateKey = toDateKey(date);
  const periodKey = String(period);
  const entry = getCalendarEntry(dateKey);
  const isExamDay = entry?.type === "exam";

  if (isExamDay) {
    const exam = appData.examData?.[dateKey] || {};
    const currentExamLesson = exam[periodKey] || null;
    const subject = currentExamLesson?.subject || lesson?.subject || "";
    const title = resolveSubject(subject) || "（教科未設定）";

    content.innerHTML = `
      <div class="modal-context">${escapeHTML(formatDateJP(date))}・${period}時間目</div>
      <h2 id="modal-title" class="edit-primary-title">${escapeHTML(title)}</h2>
      <div class="edit-change-section">
        <div class="edit-change-label">変更</div>
        <div class="lesson-edit-form">
          <div class="form-field">
            <label for="lesson-edit-subject">考査の教科を変更</label>
            <input id="lesson-edit-subject" type="text" value="${escapeHTML(subject)}" placeholder="教科">
          </div>
        </div>
      </div>
      <p class="muted">この変更は、この日の考査時間割（<code>examData</code>）に直接保存されます。</p>
      <div class="button-row">
        <button id="save-lesson-edit" class="primary-button">考査を保存</button>
        ${currentExamLesson ? `<button id="reset-lesson-edit" class="secondary-button">この限の考査を削除</button>` : ""}
      </div>`;

    document.getElementById("save-lesson-edit").addEventListener("click", () => {
      const newSubject = document.getElementById("lesson-edit-subject").value.trim();
      const currentExam = isPlainObject(appData.examData?.[dateKey]) ? { ...appData.examData[dateKey] } : {};

      if (newSubject) currentExam[periodKey] = { subject: newSubject };
      else delete currentExam[periodKey];

      if (Object.keys(currentExam).length) appData.examData[dateKey] = normalizePeriodTable(currentExam);
      else delete appData.examData[dateKey];

      const idx = appData.calendar.findIndex(x => x.date === dateKey);
      const examEntry = { date: dateKey, type: "exam" };
      if (idx >= 0) appData.calendar[idx] = examEntry;
      else appData.calendar.push(examEntry);

      saveData();
      closeModal();
      renderWeek();
    });

    if (currentExamLesson) {
      document.getElementById("reset-lesson-edit").addEventListener("click", () => {
        const currentExam = isPlainObject(appData.examData?.[dateKey]) ? { ...appData.examData[dateKey] } : {};
        delete currentExam[periodKey];
        if (Object.keys(currentExam).length) appData.examData[dateKey] = normalizePeriodTable(currentExam);
        else delete appData.examData[dateKey];
        saveData();
        closeModal();
        renderWeek();
      });
    }

    overlay.classList.remove("hidden");
    return;
  }

  const isOverridden = Boolean(appData.overrides?.[dateKey]?.periods?.[periodKey]);
  const displayedLesson = lesson || {};
  const title = resolveSubject(displayedLesson.subject) || "（教科未設定）";

  content.innerHTML = `
    <div class="modal-context">${escapeHTML(formatDateJP(date))}・${period}時間目</div>
    <h2 id="modal-title" class="edit-primary-title">${escapeHTML(title)}</h2>
    <div class="edit-change-section">
      <div class="edit-change-label">変更</div>
      <div class="lesson-edit-form">
        <div class="form-field">
          <label for="lesson-edit-subject">この限の教科を変更</label>
          <input id="lesson-edit-subject" type="text" value="${escapeHTML(displayedLesson.subject || "")}" placeholder="教科">
        </div>
      </div>
    </div>
    ${isOverridden ? `<div class="override-notice">この授業は変更済みです。</div>` : ""}
    <p class="muted">この変更は、この日・この限だけの時間割変更として <code>overrides</code> に保存されます。</p>
    <div class="button-row">
      <button id="save-lesson-edit" class="primary-button">この授業の変更を保存</button>
      ${isOverridden ? `<button id="reset-lesson-edit" class="secondary-button">変更を削除して元に戻す</button>` : ""}
    </div>`;

  document.getElementById("save-lesson-edit").addEventListener("click", () => {
    const subject = document.getElementById("lesson-edit-subject").value;
    const editedLesson = makeLesson(subject);

    const obj = normalizeOverride(appData.overrides[dateKey] || {});
    if (editedLesson) {
      obj.periods[periodKey] = editedLesson;
      appData.overrides[dateKey] = obj;
    } else {
      delete obj.periods[periodKey];
      if (Object.keys(obj.periods).length) appData.overrides[dateKey] = obj;
      else delete appData.overrides[dateKey];
    }

    saveData();
    closeModal();
    renderWeek();
  });

  if (isOverridden) {
    document.getElementById("reset-lesson-edit").addEventListener("click", () => {
      const obj = normalizeOverride(appData.overrides[dateKey] || {});
      delete obj.periods[periodKey];
      if (Object.keys(obj.periods).length) appData.overrides[dateKey] = obj;
      else delete appData.overrides[dateKey];
      saveData();
      closeModal();
      renderWeek();
    });
  }

  overlay.classList.remove("hidden");
}

function closeModal() { document.getElementById("lesson-modal").classList.add("hidden"); }

function lessonFieldsHTML(lesson=null, includeTime=false, onlySubject=false) {
  if (onlySubject) return `<input data-field="subject" type="text" value="${escapeHTML(lesson?.subject || "")}" placeholder="教科">`;
  return `<input data-field="subject" type="text" value="${escapeHTML(lesson?.subject || "")}" placeholder="教科">${includeTime ? `<input data-field="time" type="text" value="${escapeHTML(lesson?.time || "")}" placeholder="時間">` : ""}`;
}

function renderManualPanels() {
  renderCalendarPanel();
  renderSchedulePanel();
  renderExamPanel();
  renderOverridePanel();
}

function renderCalendarPanel() {
  const el = document.getElementById("manual-calendar");
  el.innerHTML = `<div class="card">
    <h3>年間予定を設定</h3>
    <p class="muted">年間予定を入力してください。これをもとに時間割が表示されます。</p>
    <div class="form-grid">
      <div class="form-field"><label>日付</label><input id="calendar-date" type="date"></div>
      <div class="form-field"><label>種類</label><select id="calendar-type">
        <option value="A">A</option><option value="B">B</option><option value="C">C</option>
        <option value="pattern">変則</option><option value="special">行事</option><option value="exam">考査</option>
      </select></div>
      <div class="form-field full" id="calendar-pattern-wrap" style="display:none">
        <label>変則時間割</label>
        <div id="calendar-pattern-editor" class="pattern-editor"></div>
        <div class="pattern-help">各行は「その日の1〜8限」を表します。通常時間割から曜日・A/B/C・参照元の限目を選ぶか、カスタムで直接授業を入力できます。</div>
      </div>
      <div class="form-field full" id="calendar-special-wrap" style="display:none"><label>行事名・予定内容</label><input id="calendar-special" type="text" placeholder="例: 文化祭、体育祭"></div>
    </div>
    <div class="button-row"><button id="save-calendar-entry" class="primary-button">保存</button><button id="remove-calendar-entry" class="danger-button">この日の年間予定設定を削除</button></div>
  </div>
  <details class="card registered-details"><summary>登録済み日付</summary><div id="calendar-entry-list" class="settings-list compact-settings-list"></div></details>`;

  const dateInput = document.getElementById("calendar-date");
  const typeInput = document.getElementById("calendar-type");
  const patternWrap = document.getElementById("calendar-pattern-wrap");
  const specialWrap = document.getElementById("calendar-special-wrap");
  dateInput.value = toDateKey(new Date());

  function getDefaultPatternItems(dateKey){
    const date = fromDateKey(dateKey);
    const day = getWeekdayKey(date);
    return Array.from({length:PERIODS},(_,i)=>({period:i+1,source:"regular",weekday:day,type:"A",sourcePeriod:i+1}));
  }

  function getPatternItemsForEditor(existing){
    if (Array.isArray(existing?.patternItems) && existing.patternItems.length) return existing.patternItems;
    if (existing?.pattern) {
      return parsePattern(existing.pattern, getWeekdayKey(fromDateKey(dateInput.value))).map(x => ({
        period: x.period,
        source: "regular",
        weekday: x.weekday || getWeekdayKey(fromDateKey(dateInput.value)),
        type: x.type,
        sourcePeriod: x.period
      }));
    }
    return null;
  }

  function renderPatternEditor(items){
    const editor=document.getElementById("calendar-pattern-editor");
    const current=Array.isArray(items)?items:[];
    editor.innerHTML=Array.from({length:PERIODS},(_,i)=>{
      const p=i+1;
      const raw=current.find(x=>Number(x?.period)===p);
      const item=raw||getDefaultPatternItems(dateInput.value)[i];
      const custom=item.source==="custom";
      const lesson=item.lesson||{};
      return `<div class="pattern-row" data-pattern-row="${p}">
        <div class="pattern-target">${p}限</div>
        <select data-pattern-source title="入力方法"><option value="regular" ${!custom?"selected":""}>通常</option><option value="custom" ${custom?"selected":""}>カスタム</option></select>
        <select data-pattern-weekday title="曜日">${WEEKDAY_KEYS.map(d=>`<option value="${d}" ${d===item.weekday?"selected":""}>${d}</option>`).join("")}</select>
        <select data-pattern-type title="パターン">${["A","B","C"].map(t=>`<option value="${t}" ${t===item.type?"selected":""}>${t}</option>`).join("")}</select>
        <select data-pattern-source-period title="参照元の限目">${Array.from({length:PERIODS},(_,j)=>`<option value="${j+1}" ${j+1===Number(item.sourcePeriod||p)?"selected":""}>${j+1}</option>`).join("")}</select>
        <div class="pattern-custom-fields" ${custom?"":"hidden"}>
          <input data-pattern-custom-field="subject" type="text" value="${escapeHTML(lesson.subject||"")}" placeholder="教科">
        </div>
      </div>`;
    }).join("");

    const refreshRow=(row)=>{
      const custom=row.querySelector("[data-pattern-source]").value==="custom";
      row.querySelectorAll("[data-pattern-weekday], [data-pattern-type], [data-pattern-source-period]").forEach(x=>x.disabled=custom);
      row.querySelector(".pattern-custom-fields").hidden=!custom;
    };
    editor.querySelectorAll(".pattern-row").forEach(row=>{
      refreshRow(row);
      row.querySelector("[data-pattern-source]").addEventListener("change",()=>refreshRow(row));
    });
  }

  function loadSelectedDate(){
    const existing=getCalendarEntry(dateInput.value);
    typeInput.value=existing?.type||"A";
    document.getElementById("calendar-special").value=existing?.eventName||existing?.specialType||"";
    renderPatternEditor(getPatternItemsForEditor(existing));
    updateVisibility();
  }

  function updateVisibility(){
    patternWrap.style.display=typeInput.value==="pattern"?"block":"none";
    specialWrap.style.display=typeInput.value==="special"?"block":"none";
  }

  dateInput.addEventListener("change",loadSelectedDate);
  typeInput.addEventListener("change",updateVisibility);
  loadSelectedDate();

  document.getElementById("save-calendar-entry").addEventListener("click",()=>{
    const date=dateInput.value, type=typeInput.value;
    if(!isValidDateKey(date)) return alert("日付を入力してください。");
    const entry={date,type};
    if(type==="pattern") {
      const items=[];
      document.querySelectorAll("#calendar-pattern-editor .pattern-row").forEach(row=>{
        const period=Number(row.dataset.patternRow);
        const source=row.querySelector("[data-pattern-source]").value;
        if(source==="custom") {
          const subject=row.querySelector('[data-pattern-custom-field="subject"]').value.trim();
          if(subject) items.push({period,source:"custom",lesson:{subject}});
        } else {
          items.push({period,source:"regular",weekday:row.querySelector("[data-pattern-weekday]").value,type:row.querySelector("[data-pattern-type]").value,sourcePeriod:Number(row.querySelector("[data-pattern-source-period]").value)});
        }
      });
      if(!items.length)return alert("変則時間割を少なくとも1限指定してください。");
      entry.patternItems=items;
    }
    if(type==="special") {
      const name=document.getElementById("calendar-special").value.trim();
      if(!name)return alert("行事名を入力してください。");
      entry.eventName=name;
    }
    const normalized=normalizeCalendarEntry(entry); if(!normalized)return alert("入力内容を確認してください。");
    const idx=appData.calendar.findIndex(x=>x.date===date);
    if(idx>=0)appData.calendar[idx]=normalized; else appData.calendar.push(normalized);
    saveData(); renderCalendarPanel();
  });

  document.getElementById("remove-calendar-entry").addEventListener("click",()=>{
    const date=dateInput.value;
    if(!isValidDateKey(date))return;
    if(!getCalendarEntry(date))return alert("この日に登録はありません。");
    if(!confirm(`${date} の年間予定設定を削除しますか？`))return;
    appData.calendar=appData.calendar.filter(x=>x.date!==date);
    saveData(); renderCalendarPanel();
  });

  renderCalendarEntryList();
}

function renderCalendarEntryList() {
  const el=document.getElementById("calendar-entry-list"); if(!el)return;
  const items=[...appData.calendar].sort((a,b)=>a.date.localeCompare(b.date));
  if(!items.length){el.innerHTML=`<div class="muted">まだ登録されていません。未入力の日はここに出ません。</div>`;return;}
  el.innerHTML=items.map((item,index)=>{
    let label=item.type;
    if(item.type==="special") label=`行事: ${item.eventName||item.specialType||""}`;
    else if(item.type==="pattern") {
      const parts=Array.isArray(item.patternItems)
        ? item.patternItems.map(x=>x.source==="custom"?`${x.period}限:カスタム`:`${x.period}限:${x.weekday||""}${x.type||""}${x.sourcePeriod||x.period}`).join(" / ")
        : `変則: ${item.pattern||""}`;
      label=parts||"変則";
    } else if(item.type==="exam") label="考査";
    return `<div class="item-row"><div><strong>${escapeHTML(item.date)}</strong><div class="muted">${escapeHTML(label)}${item.note?` / ${escapeHTML(item.note)}`:""}</div></div><button class="remove-button" data-remove-calendar="${index}">削除</button></div>`;
  }).join("");
  el.querySelectorAll("[data-remove-calendar]").forEach(btn=>btn.addEventListener("click",()=>{const date=items[Number(btn.dataset.removeCalendar)].date;appData.calendar=appData.calendar.filter(x=>x.date!==date);saveData();renderCalendarPanel();}));
}

function renderSchedulePanel() {
  const el=document.getElementById("manual-schedule");
  el.innerHTML=`<div class="card"><h3>通常時間割の設定</h3><p class="muted">クラスごとのごとの時間割表を設定してください。</p><div class="form-grid"><div class="form-field"><label>学期</label><select id="schedule-term"><option value="firstTerm">前期</option><option value="secondTerm">後期</option></select></div><div class="form-field"><label>パターン</label><select id="schedule-type"><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></div><div class="form-field full"><label>曜日</label><div id="schedule-weekday-tabs" class="weekday-tabs"></div></div></div><div class="period-head"></div><div id="schedule-periods"></div><div class="button-row"><button id="save-normal-schedule" class="primary-button">この曜日の時間割を保存</button></div></div>`;
  const term=document.getElementById("schedule-term"), type=document.getElementById("schedule-type"), periods=document.getElementById("schedule-periods"), tabs=document.getElementById("schedule-weekday-tabs");
  let activeWeekday="月";
  tabs.innerHTML=WEEKDAY_KEYS.map(day=>`<button type="button" class="weekday-tab${day===activeWeekday?" active":""}" data-schedule-weekday="${day}">${day}</button>`).join("");
  tabs.querySelectorAll("[data-schedule-weekday]").forEach(btn=>btn.addEventListener("click",()=>{activeWeekday=btn.dataset.scheduleWeekday;tabs.querySelectorAll("[data-schedule-weekday]").forEach(x=>x.classList.toggle("active",x.dataset.scheduleWeekday===activeWeekday));draw();}));
  function draw(){const data=appData.schedules?.[term.value]?.[type.value]?.[activeWeekday]||{};periods.innerHTML=Array.from({length:PERIODS},(_,i)=>{const p=i+1;const lesson=data[String(p)]||null;return `<div class="period-editor"><div class="period-number">${p}</div>${lessonFieldsHTML(lesson)}</div>`;}).join("");}
  term.addEventListener("change",draw); type.addEventListener("change",draw); draw();
  document.getElementById("save-normal-schedule").addEventListener("click",()=>{const obj={};periods.querySelectorAll(".period-editor").forEach((row,index)=>{const input=row.querySelector('input[data-field="subject"]');const lesson=makeLesson(input.value);if(lesson)obj[String(index+1)]=lesson;});appData.schedules[term.value][type.value][activeWeekday]=obj;saveData();alert(`${activeWeekday}曜日の${type.value}時間割を保存しました。`);});
}

function renderExamPanel() {
  const el=document.getElementById("manual-exam");
  el.innerHTML=`<div class="card"><h3>考査時間割の設定</h3><p class="muted">日付を指定し、その日の考査時間割の設定してください。</p><div class="form-field"><label>日付</label><input id="exam-date" type="date"></div><div class="period-head"><span></span></div><div id="exam-periods"></div><div class="button-row"><button id="save-exam" class="primary-button">考査を保存</button><button id="delete-exam" class="danger-button">この日の考査を削除</button></div></div><details class="card registered-details"><summary>登録済み考査</summary><div id="exam-list" class="settings-list compact-settings-list"></div></details>`;
  const date=document.getElementById("exam-date"),periods=document.getElementById("exam-periods"); date.value=toDateKey(new Date());
  function draw(){const exam=appData.examData[date.value]||{};periods.innerHTML=Array.from({length:PERIODS},(_,i)=>{const p=i+1;const lesson=exam[String(p)]||null;return `<div class="period-editor exam-period-editor"><div class="period-number">${p}</div>${lessonFieldsHTML(lesson,true,true)}</div>`;}).join("");}
  date.addEventListener("change",draw); draw();
  document.getElementById("save-exam").addEventListener("click",()=>{if(!isValidDateKey(date.value))return alert("日付を入力してください。");const exam={};periods.querySelectorAll(".period-editor").forEach((row,index)=>{const input=row.querySelector("input[data-field=subject]");const subject=input.value.trim();if(subject)exam[String(index+1)]={subject};});if(!Object.keys(exam).length)return alert("少なくとも1限は教科を入力してください。");appData.examData[date.value]=exam;const idx=appData.calendar.findIndex(x=>x.date===date.value);const entry={date:date.value,type:"exam"};if(idx>=0)appData.calendar[idx]=entry;else appData.calendar.push(entry);saveData();renderExamPanel();renderCalendarPanel();alert("考査を保存しました。");});
  document.getElementById("delete-exam").addEventListener("click",()=>{if(!appData.examData[date.value])return alert("この日に考査データはありません。");if(!confirm(`${date.value} の考査を削除しますか？`))return;delete appData.examData[date.value];appData.calendar=appData.calendar.filter(x=>x.date!==date.value || x.type!=="exam");saveData();renderExamPanel();renderCalendarPanel();});
  renderExamList();
}
function renderExamList(){const el=document.getElementById("exam-list");if(!el)return;const entries=Object.entries(appData.examData).sort(([a],[b])=>a.localeCompare(b));if(!entries.length){el.innerHTML=`<div class="muted">まだ登録されていません。</div>`;return;}el.innerHTML=entries.map(([date,exam])=>{const subjects=Object.entries(exam).map(([p,l])=>`${p}限:${escapeHTML(resolveSubject(l.subject)||l.subject||"—")}`).join(" / ");return `<div class="item-row"><div><strong>${escapeHTML(date)}</strong><div class="muted">${subjects}</div></div><button class="remove-button" data-remove-exam="${escapeHTML(date)}">削除</button></div>`;}).join("");el.querySelectorAll("[data-remove-exam]").forEach(btn=>btn.addEventListener("click",()=>{const date=btn.dataset.removeExam;if(!confirm(`${date} の考査を削除しますか？`))return;delete appData.examData[date];appData.calendar=appData.calendar.filter(x=>x.date!==date || x.type!=="exam");saveData();renderExamPanel();renderCalendarPanel();}));}

function renderOverridePanel() {
  const el=document.getElementById("manual-override");
  el.innerHTML=`<div class="card"><h3>時間割変更を入力</h3><p class="muted">設定した時間のみが上書きされて表示されます。</p><div class="form-field"><label>日付</label><input id="override-date" type="date"></div><h4>変更する授業</h4><div class="form-grid"><div class="form-field"><label>時間</label><select id="override-period">${Array.from({length:PERIODS},(_,i)=>`<option value="${i+1}">${i+1}時間目</option>`).join("")}</select></div><div class="form-field full"><label>教科</label><input id="override-subject" type="text" placeholder="教科"></div></div><div class="button-row"><button id="save-override" class="primary-button">変更を保存</button><button id="clear-override" class="danger-button">この日の変更を削除</button></div></div><details class="card registered-details"><summary>登録済み変更</summary><div id="override-list" class="settings-list compact-settings-list"></div></details>`;
  const date=document.getElementById("override-date"), period=document.getElementById("override-period");
  date.value=toDateKey(new Date());
  function loadExisting(){
    const o=appData.overrides[date.value];
    loadOverrideLessonInputs(o?.periods?.[period.value]);
  }
  date.addEventListener("change",loadExisting);
  period.addEventListener("change",()=>loadOverrideLessonInputs(appData.overrides[date.value]?.periods?.[period.value]));
  loadExisting();
  document.getElementById("save-override").addEventListener("click",()=>{
    const key=date.value;
    if(!isValidDateKey(key))return alert("日付を入力してください。");
    if(getCalendarEntry(key)?.type === "exam") return alert("考査日は『考査』から変更してください。考査の変更は examData に保存されます。");
    const obj=normalizeOverride(appData.overrides[key]||{});
    const p=period.value;
    const lesson=makeLesson(document.getElementById("override-subject").value);
    if(lesson)obj.periods[p]=lesson; else delete obj.periods[p];
    if(!Object.keys(obj.periods).length) delete appData.overrides[key]; else appData.overrides[key]=obj;
    saveData();
    renderOverridePanel();
    alert("変更を保存しました。");
  });
  document.getElementById("clear-override").addEventListener("click",()=>{
    const key=date.value;
    if(!appData.overrides[key])return alert("この日に変更はありません。");
    if(!confirm(`${key} の変更をすべて削除しますか？`))return;
    delete appData.overrides[key];
    saveData();
    renderOverridePanel();
  });
  renderOverrideList();
}
function clearOverrideLessonInputs(){document.getElementById("override-subject").value="";}
function loadOverrideLessonInputs(lesson){document.getElementById("override-subject").value=lesson?.subject||"";}
function renderOverrideList(){const el=document.getElementById("override-list");if(!el)return;const entries=Object.entries(appData.overrides).sort(([a],[b])=>a.localeCompare(b));if(!entries.length){el.innerHTML=`<div class="muted">まだ登録されていません。</div>`;return;}el.innerHTML=entries.map(([date,o])=>{const periods=Object.entries(o.periods||{}).sort(([a],[b])=>Number(a)-Number(b)).map(([p,l])=>`${p}限:${escapeHTML(resolveSubject(l.subject)||l.subject||"—")}`).join(" / ");return `<div class="item-row"><div><strong>${escapeHTML(date)}</strong><div class="muted">${periods||"個別変更なし"}</div></div><button class="remove-button" data-remove-override="${escapeHTML(date)}">削除</button></div>`;}).join("");el.querySelectorAll("[data-remove-override]").forEach(btn=>btn.addEventListener("click",()=>{delete appData.overrides[btn.dataset.removeOverride];saveData();renderOverridePanel();}));}

function renderSettings(){
  const month=document.getElementById("term-change-month");
  month.innerHTML=Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}月</option>`).join("");
  month.value=String(appData.settings.termChangeMonth);
  renderSubjectColors();
  renderSubjectNames();
  renderWeekdayColors();
  renderScheduleTypeColors();
  renderHolidays();
}

function renderSubjectColors(){
  const el=document.getElementById("subject-colors-list");
  ensureSubjectColors(appData);
  const subjects=Object.keys(appData.settings.subjectColors).sort((a,b)=>a.localeCompare(b,"ja"));
  if(!subjects.length){
    el.innerHTML=`<div class="muted">色設定から除外されている教科以外は、自動でここに表示されます。</div>`;
    return;
  }
  el.innerHTML=subjects.map((s,i)=>`<div class="color-row"><input data-color-name="${escapeHTML(s)}" type="text" value="${escapeHTML(s)}"><input data-color-value="${i}" type="color" value="${appData.settings.subjectColors[s]||"#f4f7fb"}"><button class="remove-button" data-remove-color="${i}">削除</button></div>`).join("");
  el.querySelectorAll("[data-remove-color]").forEach(btn=>btn.addEventListener("click",()=>{
    const row=el.querySelectorAll(".color-row")[Number(btn.dataset.removeColor)];
    if(!row)return;
    const name=row.querySelector("[data-color-name]").value.trim();
    if(!name)return;
    delete appData.settings.subjectColors[name];
    if(!appData.settings.subjectColorExcluded.includes(name)) appData.settings.subjectColorExcluded.push(name);
    saveData();
    renderSubjectColors();
  }));
}

document.getElementById("add-subject-color").addEventListener("click",()=>{
  const name=prompt("教科名を入力してください（例: 数学）");
  const trimmed=String(name||"").trim();
  if(!trimmed)return;
  appData.settings.subjectColorExcluded=appData.settings.subjectColorExcluded.filter(v=>v!==trimmed);
  appData.settings.subjectColors[trimmed]="#f4f7fb";
  saveData();
  renderSubjectColors();
});

document.getElementById("save-subject-colors").addEventListener("click",()=>{
  const list=document.getElementById("subject-colors-list");
  const previousNames=new Set(Object.keys(appData.settings.subjectColors));
  const next={};
  list.querySelectorAll(".color-row").forEach(row=>{
    const name=row.querySelector("[data-color-name]").value.trim();
    const color=row.querySelector("input[type=color]").value;
    if(name)next[name]=color;
  });
  const visible=new Set(Object.keys(next));
  const excluded=new Set(appData.settings.subjectColorExcluded);
  for(const oldName of previousNames){
    if(!visible.has(oldName)) excluded.add(oldName);
  }
  for(const visibleName of visible) excluded.delete(visibleName);
  appData.settings.subjectColors=next;
  appData.settings.subjectColorExcluded=[...excluded];
  ensureSubjectColors(appData);
  saveData();
  renderSubjectColors();
  if(document.getElementById("view-timetable").classList.contains("active-view"))renderWeek();
  alert("教科の色を保存しました。");
});

function renderSubjectNames(){
  const el=document.getElementById("subject-names-list");
  if(!el)return;

  appData.settings.subjectNameExcluded=Array.isArray(appData.settings.subjectNameExcluded)
    ? [...new Set(appData.settings.subjectNameExcluded.map(v=>String(v).trim()).filter(Boolean))]
    : [];

  const excluded=new Set(appData.settings.subjectNameExcluded);
  const subjects=new Set([
    ...collectSubjects(appData),
    ...Object.keys(appData.settings.subjectNames || {})
  ]);
  const entries=[...subjects].filter(s=>s && !excluded.has(s)).sort((a,b)=>a.localeCompare(b,"ja"));

  if(!entries.length){
    el.innerHTML=`<div class="muted">時間割に教科が登録されると、ここに自動で表示されます。削除した教科は「教科を追加」から再登録できます。</div>`;
    return;
  }

  el.innerHTML=entries.map((original,i)=>{
    const display=appData.settings.subjectNames[original] || original;
    return `<div class="subject-name-row">
      <span class="subject-original" title="時間割データ上の元の名前">${escapeHTML(original)}</span>
      <input data-subject-original="${i}" data-original-value="${escapeHTML(original)}" type="text" value="${escapeHTML(display)}" placeholder="表示する教科名">
      <div class="subject-name-actions">
        <button class="remove-button" data-reset-subject-name="${i}">戻す</button>
        <button class="remove-button delete-subject-name-button" data-delete-subject-name="${i}">削除</button>
      </div>
    </div>`;
  }).join("");

  el.querySelectorAll("[data-reset-subject-name]").forEach(btn=>btn.addEventListener("click",()=>{
    const rows=el.querySelectorAll(".subject-name-row");
    const row=rows[Number(btn.dataset.resetSubjectName)];
    if(!row)return;
    const original=row.querySelector("input").dataset.originalValue;
    delete appData.settings.subjectNames[original];
    saveData();
    renderSubjectNames();
    if(document.getElementById("view-timetable").classList.contains("active-view"))renderWeek();
  }));

  el.querySelectorAll("[data-delete-subject-name]").forEach(btn=>btn.addEventListener("click",()=>{
    const rows=el.querySelectorAll(".subject-name-row");
    const row=rows[Number(btn.dataset.deleteSubjectName)];
    if(!row)return;
    const original=row.querySelector("input").dataset.originalValue;
    if(!appData.settings.subjectNameExcluded.includes(original)) appData.settings.subjectNameExcluded.push(original);
    delete appData.settings.subjectNames[original];
    saveData();
    renderSubjectNames();
  }));
}

document.getElementById("add-subject-name").addEventListener("click",()=>{
  const original=prompt("元の教科名を入力してください（例: S、数学α、英語R）");
  const trimmed=String(original||"").trim();
  if(!trimmed)return;
  appData.settings.subjectNameExcluded=Array.isArray(appData.settings.subjectNameExcluded)
    ? appData.settings.subjectNameExcluded.filter(v=>v!==trimmed)
    : [];
  const current=appData.settings.subjectNames[trimmed] || trimmed;
  const display=prompt(`「${trimmed}」を時間割上で何と表示しますか？`,current);
  if(display===null)return;
  appData.settings.subjectNames[trimmed]=String(display).trim() || trimmed;
  saveData();
  renderSubjectNames();
  if(document.getElementById("view-timetable").classList.contains("active-view"))renderWeek();
});

document.getElementById("save-subject-names").addEventListener("click",()=>{
  const list=document.getElementById("subject-names-list"),next={};
  list.querySelectorAll(".subject-name-row").forEach(row=>{
    const input=row.querySelector("input");
    const original=input.dataset.originalValue;
    const display=input.value.trim();
    if(original && display && display!==original)next[original]=display;
  });
  // 現在の一覧に存在する設定だけを保存し、戻したものは削除する。
  appData.settings.subjectNames=next;
  saveData();
  renderSubjectNames();
  if(document.getElementById("view-timetable").classList.contains("active-view"))renderWeek();
  alert("教科名を保存しました。");
});

function renderWeekdayColors(){
  const el=document.getElementById("weekday-colors-list");
  if(!el)return;
  el.innerHTML=WEEKDAY_KEYS.map(day=>`<div class="weekday-color-row"><span class="weekday-label">${day}曜日</span><input type="color" data-weekday-color="${day}" value="${appData.settings.weekdayColors[day]||"#ffffff"}"></div>`).join("");
}

document.getElementById("save-weekday-colors").addEventListener("click",()=>{
  document.querySelectorAll("[data-weekday-color]").forEach(input=>{
    appData.settings.weekdayColors[input.dataset.weekdayColor]=input.value;
  });
  saveData();
  if(document.getElementById("view-timetable").classList.contains("active-view"))renderWeek();
  alert("曜日の色を保存しました。");
});

function renderScheduleTypeColors(){
  const el=document.getElementById("schedule-type-colors-list");
  if(!el)return;
  const labels={A:"A",B:"B",C:"C",pattern:"変則",special:"行事",exam:"考査",unentered:"未入力"};
  el.innerHTML=["A","B","C","pattern","special","exam","unentered"].map(type=>`<div class="weekday-color-row"><span class="weekday-label">${labels[type]}</span><input type="color" data-schedule-type-color="${type}" value="${appData.settings.scheduleTypeColors?.[type]||"#ffffff"}"></div>`).join("");
}

document.getElementById("save-schedule-type-colors").addEventListener("click",()=>{
  for(const input of document.querySelectorAll("[data-schedule-type-color]")){
    appData.settings.scheduleTypeColors[input.dataset.scheduleTypeColor]=input.value;
  }
  saveData();
  if(document.getElementById("view-timetable").classList.contains("active-view"))renderWeek();
  alert("種類の色を保存しました。");
});

async function syncHolidaysFromAPI(){
  const status=document.getElementById("holiday-api-status");
  if(status) status.textContent="祝日を取得しています…";
  try {
    const response=await fetch(HOLIDAY_API_URL,{cache:"no-store"});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(!isPlainObject(data)) throw new Error("祝日データの形式が不正です。");

    const validDates=Object.keys(data).filter(isValidDateKey);
    if(!validDates.length) throw new Error("有効な祝日データがありません。");

    const previousCount=(appData.settings.holidays||[]).length;
    appData.settings.holidays=[...new Set(validDates)].sort();
    saveData();
    renderHolidays();
    if(document.getElementById("view-timetable").classList.contains("active-view")) renderWeek();
    const changed=appData.settings.holidays.length!==previousCount;
    if(status) status.textContent=changed?`祝日をAPIから更新しました（${appData.settings.holidays.length}件）。`:`API取得済み。祝日に変更はありません。`;
  } catch(error) {
    // API取得失敗時は新しい祝日を追加しない。既存の手動登録済み祝日はそのまま。
    console.warn("Holiday API fetch failed:",error);
    if(status) status.textContent="祝日APIを取得できなかったため、新しい祝日は追加していません。";
  }
}

function renderHolidays(){
  const color=document.getElementById("holiday-color");
  if(color)color.value=appData.settings.holidayColor;
}

document.getElementById("save-holiday-color").addEventListener("click",()=>{
  appData.settings.holidayColor=document.getElementById("holiday-color").value;
  saveData();
  if(document.getElementById("view-timetable").classList.contains("active-view"))renderWeek();
  alert("祝日の色を保存しました。");
});
document.getElementById("sync-holidays").addEventListener("click",()=>{ void syncHolidaysFromAPI(); });

document.getElementById("save-term-settings").addEventListener("click",()=>{appData.settings.termChangeMonth=Number(document.getElementById("term-change-month").value);saveData();alert("学期設定を保存しました。");});
document.getElementById("export-data").addEventListener("click",()=>{const blob=new Blob([JSON.stringify(appData,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`timetable-backup-${toDateKey(new Date())}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);});
document.getElementById("reset-data").addEventListener("click",()=>{if(!confirm("時間割・年間予定・考査・変更・設定をすべて初期化します。元に戻せません。続行しますか？"))return;localStorage.removeItem(STORAGE_KEY);appData=emptyData();saveData();renderManualPanels();renderSettings();alert("初期化しました。");});

function switchView(name){document.querySelectorAll(".view").forEach(v=>v.classList.remove("active-view"));document.getElementById(`view-${name}`).classList.add("active-view");document.querySelectorAll(".nav-item").forEach(btn=>btn.classList.toggle("active",btn.dataset.view===name));document.body.dataset.currentView=name;const titles={timetable:"時間割",input:"予定入力",settings:"設定"};document.getElementById("page-title").textContent=titles[name]||"時間割";if(name!=="timetable"){document.getElementById("prev-week").hidden=false;document.getElementById("today-button").hidden=false;document.getElementById("next-week").hidden=false;}if(name==="timetable")renderWeek();if(name==="input")renderManualPanels();if(name==="settings")renderSettings();window.scrollTo({top:0,behavior:"smooth"});}
function switchInputTab(name){
  document.querySelectorAll("[data-input-tab]").forEach(btn=>btn.classList.toggle("active",btn.dataset.inputTab===name));
  document.querySelectorAll(".input-tab").forEach(tab=>tab.classList.remove("active-input-tab"));
  document.getElementById(`input-tab-${name}`).classList.add("active-input-tab");
  if(name === "json") refreshJSONEditor();
}
function switchManualTab(name){document.querySelectorAll("[data-manual-tab]").forEach(btn=>btn.classList.toggle("active",btn.dataset.manualTab===name));document.querySelectorAll(".manual-panel").forEach(panel=>panel.classList.remove("active-panel"));document.getElementById(`manual-${name}`).classList.add("active-panel");}

document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click",()=>switchView(btn.dataset.view)));
document.getElementById("timetable-mode-toggle").addEventListener("click",()=>{
  timetableDisplayMode = timetableDisplayMode === "date" ? "subject" : "date";
  const prev=document.getElementById("prev-week"), today=document.getElementById("today-button"), next=document.getElementById("next-week");
  if(timetableDisplayMode === "subject"){ prev.hidden=true; today.hidden=true; next.hidden=true; } else { prev.hidden=false; today.hidden=false; next.hidden=false; }
  renderWeek();
});
document.querySelectorAll("[data-input-tab]").forEach(btn=>btn.addEventListener("click",()=>switchInputTab(btn.dataset.inputTab)));
document.querySelectorAll("[data-manual-tab]").forEach(btn=>btn.addEventListener("click",()=>switchManualTab(btn.dataset.manualTab)));
document.getElementById("prev-week").addEventListener("click",()=>{timetableDisplayMode="date";document.getElementById("prev-week").hidden=false;document.getElementById("today-button").hidden=false;document.getElementById("next-week").hidden=false;currentWeekStart=addDays(currentWeekStart,-7);renderWeek();});
document.getElementById("next-week").addEventListener("click",()=>{timetableDisplayMode="date";document.getElementById("prev-week").hidden=false;document.getElementById("today-button").hidden=false;document.getElementById("next-week").hidden=false;currentWeekStart=addDays(currentWeekStart,7);renderWeek();});
document.getElementById("today-button").addEventListener("click",()=>{timetableDisplayMode="date";document.getElementById("prev-week").hidden=false;document.getElementById("today-button").hidden=false;document.getElementById("next-week").hidden=false;currentWeekStart=getMonday(new Date());renderWeek();});
document.getElementById("modal-close").addEventListener("click",closeModal);
document.getElementById("lesson-modal").addEventListener("click",e=>{if(e.target.id==="lesson-modal")closeModal();});
window.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});

let currentJSONTab = "calendar";
const JSON_TAB_CONFIG = {
  calendar: {
    title: "年間予定 のJSON",
    help: "localStorageの calendar 部分だけを編集します。A / B / C / 変則 / 行事 / 考査 の日付設定を扱います。",
    key: "calendar",
    placeholder: '{\n  "calendar": []\n}'
  },
  schedule: {
    title: "通常時間割 のJSON",
    help: "localStorageの schedules 部分だけを編集します。前期・後期、A / B / C、曜日別の通常時間割を扱います。",
    key: "schedules",
    placeholder: '{\n  "schedules": {}\n}'
  },
  exam: {
    title: "考査 のJSON",
    help: "localStorageの examData 部分だけを編集します。日付ごとの各限の考査教科を扱います。",
    key: "examData",
    placeholder: '{\n  "examData": {}\n}'
  },
  override: {
    title: "時間割変更 のJSON",
    help: "localStorageの overrides 部分だけを編集します。年間予定を変えず、限単位の変更だけを扱います。",
    key: "overrides",
    placeholder: '{\n  "overrides": {}\n}'
  },
  all: {
    title: "全体 のJSON",
    help: "localStorageに保存されているアプリ全体のJSONです。settings / schedules / calendar / examData / overrides などを含みます。",
    key: null,
    placeholder: '{\n  "version": 6,\n  "settings": {},\n  "schedules": {},\n  "calendar": [],\n  "examData": {},\n  "overrides": {}\n}'
  }
};

function getJSONSectionObject(tab){
  const config=JSON_TAB_CONFIG[tab]||JSON_TAB_CONFIG.calendar;
  if(config.key===null) return appData;
  return { [config.key]: appData[config.key] };
}

function getJSONSectionFromParsed(tab, parsed){
  const config=JSON_TAB_CONFIG[tab]||JSON_TAB_CONFIG.calendar;
  if(config.key===null){
    if(!isPlainObject(parsed)) throw new Error("全体のJSONはオブジェクト形式で入力してください。");
    return parsed;
  }

  if(config.key === "calendar") {
    if(Array.isArray(parsed)) return { calendar: parsed };
    if(!isPlainObject(parsed) || !Array.isArray(parsed.calendar)) throw new Error('年間予定は { "calendar": [...] } の形式で入力してください。');
    return { calendar: parsed.calendar };
  }

  if(config.key === "schedules") {
    if(isPlainObject(parsed) && isPlainObject(parsed.schedules)) return { schedules: parsed.schedules };
    if(isPlainObject(parsed) && (parsed.firstTerm || parsed.secondTerm)) return { schedules: parsed };
    throw new Error('通常時間割は { "schedules": {...} } の形式で入力してください。');
  }

  if(config.key === "examData") {
    if(isPlainObject(parsed) && isPlainObject(parsed.examData)) return { examData: parsed.examData };
    if(isPlainObject(parsed)) return { examData: parsed };
    throw new Error('考査は { "examData": {...} } の形式で入力してください。');
  }

  if(config.key === "overrides") {
    if(isPlainObject(parsed) && isPlainObject(parsed.overrides)) return { overrides: parsed.overrides };
    if(isPlainObject(parsed)) return { overrides: parsed };
    throw new Error('時間割変更は { "overrides": {...} } の形式で入力してください。');
  }

  throw new Error("JSONの種類が不正です。");
}

function mergeJSONSection(current, incoming){
  const key=JSON_TAB_CONFIG[currentJSONTab]?.key;
  if(key===null) return mergeImportedData(appData,incoming);

  const normalizedIncoming=getJSONSectionFromParsed(currentJSONTab,incoming);
  if(key === "calendar") {
    const map=new Map((appData.calendar||[]).map(x=>[x.date,x]));
    for(const item of normalizedIncoming.calendar){
      const entry=normalizeCalendarEntry(item);
      if(!entry) continue;
      map.set(entry.date,entry);
    }
    appData.calendar=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
    return normalizeData(appData);
  }

  appData[key]=deepMerge(appData[key]||{},normalizedIncoming[key]);
  return normalizeData(appData);
}

function replaceJSONSection(parsed){
  const normalized=getJSONSectionFromParsed(currentJSONTab,parsed);
  const key=JSON_TAB_CONFIG[currentJSONTab]?.key;
  if(key===null) return normalizeData(normalized);
  const next={...appData,[key]:normalized[key]};
  return normalizeData(next);
}

function refreshJSONEditor(){
  const config=JSON_TAB_CONFIG[currentJSONTab]||JSON_TAB_CONFIG.calendar;
  const content=JSON_TAB_CONTENT[currentJSONTab]||JSON_TAB_CONTENT.calendar;
  document.querySelectorAll("[data-json-tab]").forEach(btn=>btn.classList.toggle("active",btn.dataset.jsonTab===currentJSONTab));
  const title=document.getElementById("json-editor-title");
  const help=document.getElementById("json-editor-help");
  const input=document.getElementById("json-input");
  const prompt=document.getElementById("ai-prompt");
  const schema=document.getElementById("schema-example");
  if(title) title.textContent=config.title;
  if(help) help.textContent=config.help;
  if(prompt) prompt.textContent=content.prompt;
  if(schema) schema.textContent=content.schema;
  if(input){
    // 入力欄は常に空にしておき、現在のデータは下の共有用JSONだけに表示する。
    input.removeAttribute("placeholder");
    input.value="";
  }
  refreshJSONShare();
}

function refreshJSONShare(){
  const output=document.getElementById("json-share-output");
  if(output) output.value=JSON.stringify(getJSONSectionObject(currentJSONTab),null,2);
}

function switchJSONTab(name){
  if(!JSON_TAB_CONFIG[name]) return;
  currentJSONTab=name;
  refreshJSONEditor();
  notify("");
}

document.getElementById("json-replace").addEventListener("click",()=>importJSON(false));
document.getElementById("json-merge").addEventListener("click",()=>importJSON(true));
document.querySelectorAll("[data-json-tab]").forEach(btn=>btn.addEventListener("click",()=>switchJSONTab(btn.dataset.jsonTab)));
document.getElementById("json-refresh-share").addEventListener("click",()=>{refreshJSONShare();notify("共有用JSONを最新状態に更新しました。");});
document.getElementById("json-copy-share").addEventListener("click",async()=>{
  const output=document.getElementById("json-share-output");
  if(!output)return;
  try {
    await navigator.clipboard.writeText(output.value);
    notify("共有用JSONをコピーしました。");
  } catch(error) {
    output.focus();
    output.select();
    notify("自動コピーに失敗しました。選択されたJSONをコピーしてください。",true);
  }
});
document.getElementById("copy-prompt").addEventListener("click",async()=>{try{await navigator.clipboard.writeText((JSON_TAB_CONTENT[currentJSONTab]||JSON_TAB_CONTENT.calendar).prompt);notify("プロンプトをコピーしました。");}catch(e){notify("コピーに失敗しました。手動で選択してください。",true);}});
function notify(message,isError=false){const el=document.getElementById("json-status");if(!el)return;el.textContent=message;el.className=`status-box ${isError?"status-error":"status-ok"}`;}
function importJSON(merge){
  const input=document.getElementById("json-input").value.trim();
  if(!input)return notify("JSONを貼り付けてください。",true);
  try {
    const parsed=JSON.parse(input);
    appData=merge?mergeJSONSection(currentJSONTab,parsed):replaceJSONSection(parsed);
    saveData();
    renderManualPanels();
    renderSettings();
    refreshJSONEditor();
    notify(merge?"追加・更新しました。":"置換しました。");
    if(document.getElementById("view-timetable").classList.contains("active-view")) renderWeek();
  } catch(error) {
    notify(`読み込みエラー: ${error.message}`,true);
  }
}

function mergeImportedData(current,incoming){const out=deepMerge(current,incoming);if(Array.isArray(incoming.calendar)){const map=new Map((current.calendar||[]).map(x=>[x.date,x]));for(const x of incoming.calendar){const n=normalizeCalendarEntry(x);if(n)map.set(n.date,n);}out.calendar=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));}if(isPlainObject(incoming.examData))out.examData=deepMerge(current.examData||{},incoming.examData);if(isPlainObject(incoming.overrides))out.overrides=deepMerge(current.overrides||{},incoming.overrides);if(isPlainObject(incoming.specialSchedules))out.specialSchedules=deepMerge(current.specialSchedules||{},incoming.specialSchedules);if(isPlainObject(incoming.schedules))out.schedules=deepMerge(current.schedules||{},incoming.schedules);return normalizeData(out);}

refreshJSONEditor();
renderWeek();renderManualPanels();renderSettings();
void syncHolidaysFromAPI();
