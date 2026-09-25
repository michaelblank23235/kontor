const { test } = require("node:test");
const assert = require("node:assert/strict");
const { reminder, validTime } = require("../electron/reminders.cjs");
const at = (d, h, m = 0) => new Date(2026, 8, d, h, m);
const todo = (title, due, extra = {}) => ({
  title,
  dueDate: due.toISOString(),
  status: "Offen",
  archivedAt: null,
  ...extra,
});
test("Erinnerung erst ab Uhrzeit und nur einmal pro Tag", () => {
  const todos = [todo("Zeugnisse", at(25, 12))];
  assert.equal(reminder(todos, { now: at(25, 6, 59), at: "07:00" }), null);
  const r = reminder(todos, { now: at(25, 7), at: "07:00" });
  assert.equal(r.today, "2026-09-25");
  assert.equal(r.title, "1 Aufgabe fällig");
  assert.equal(r.body, "• Zeugnisse");
  assert.equal(
    reminder(todos, { now: at(25, 9), at: "07:00", remindedOn: "2026-09-25" }),
    null,
  );
});
test("Erinnerung zählt Überfälliges, ignoriert Erledigtes, Archiv und Zukunft", () => {
  const todos = [
    todo("Heute", at(25, 12)),
    todo("Gestern", at(24, 12)),
    todo("Vorgestern", at(23, 12)),
    todo("Morgen", at(26, 12)),
    todo("Erledigt", at(24, 12), { status: "Erledigt" }),
    todo("Archiviert", at(24, 12), { archivedAt: at(24, 13).toISOString() }),
    { title: "Ohne Frist", status: "Offen" },
    todo("Letzte Woche", at(18, 12)),
  ];
  const r = reminder(todos, { now: at(25, 8) });
  assert.equal(r.title, "4 Aufgaben fällig, davon 3 überfällig");
  assert.equal(
    r.body,
    "• Letzte Woche\n• Vorgestern\n• Gestern\n… und 1 weitere",
  );
});
test("Ohne fällige Aufgaben wird der Tag trotzdem als erledigt markiert", () => {
  const r = reminder([], { now: at(25, 8) });
  assert.deepEqual(r, { today: "2026-09-25", title: null, body: null });
});
test("Uhrzeit wird geprüft", () => {
  for (const v of ["07:00", "00:00", "23:59"]) assert.ok(validTime(v));
  for (const v of ["7:00", "24:00", "12:60", "", null, "07:00 "])
    assert.equal(validTime(v), false);
});
