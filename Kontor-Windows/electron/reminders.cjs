// Daily reminder decision, kept free of Electron so it can be unit tested.
const day = (d = new Date()) => new Date(d).toLocaleDateString("sv-SE");
const time = (d = new Date()) =>
  new Date(d).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
function validTime(v) {
  return typeof v === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
}
// Returns null when nothing should be shown today (yet), otherwise the notification text.
function reminder(todos, { now = new Date(), at = "07:00", remindedOn } = {}) {
  const today = day(now);
  if (remindedOn === today || time(now) < at) return null;
  const open = todos.filter(
    (t) =>
      !t.archivedAt &&
      t.status !== "Erledigt" &&
      t.dueDate &&
      day(t.dueDate) <= today,
  );
  if (!open.length) return { today, title: null, body: null };
  const late = open.filter((t) => day(t.dueDate) < today).length;
  const titles = open
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3)
    .map((t) => "• " + t.title);
  if (open.length > 3) titles.push(`… und ${open.length - 3} weitere`);
  return {
    today,
    title:
      (open.length === 1 ? "1 Aufgabe fällig" : `${open.length} Aufgaben fällig`) +
      (late ? `, davon ${late} überfällig` : ""),
    body: titles.join("\n"),
  };
}
module.exports = { reminder, validTime, day };
