const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Vault } = require("../electron/vault.cjs");
test("Verschlüsselung, falsche Passphrase, Wiederöffnen und vollständige Sicherung", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kontor-vault-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v = new Vault(path.join(dir, "data"));
  await v.unlock("0123");
  const n = v.command("save", {
    kind: "note",
    item: {
      title: "Vertrauliche Personalnotiz",
      body: "Inhalt",
      tags: ["Test"],
    },
  });
  v.repo.transaction(
    () =>
      v.repo.attachment(
        n.id,
        "test.pdf",
        "application/pdf",
        Buffer.from("%PDF-test"),
      ),
    () => v.persist(),
  );
  const backup = path.join(dir, "backup");
  v.backup(backup);
  assert.equal(
    fs.readFileSync(v.file).includes(Buffer.from("Vertrauliche Personalnotiz")),
    false,
  );
  v.lock();
  await assert.rejects(v.unlock("falsch"), /Passphrase/);
  await v.unlock("0123");
  assert.equal(v.repo.all("note")[0].title, "Vertrauliche Personalnotiz");
  v.command("delete", { kind: "note", id: n.id });
  await v.restore(backup, "0123");
  assert.equal(v.repo.all("note").length, 1);
  assert.equal(v.repo.snapshot().attachments.length, 1);
  assert.ok(fs.existsSync(v.file + ".vor-import.kontorbackup"));
  v.lock();
});
test("Beschädigte Sicherung verändert laufende Daten nicht", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kontor-corrupt-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v = new Vault(path.join(dir, "data"));
  await v.unlock("0123");
  v.command("save", { kind: "todo", item: { title: "Erhalten" } });
  const bad = path.join(dir, "bad");
  const b = fs.readFileSync(v.file);
  b[b.length - 1] ^= 255;
  fs.writeFileSync(bad, b);
  await assert.rejects(v.restore(bad, "0123"));
  assert.equal(v.repo.all("todo")[0].title, "Erhalten");
  v.lock();
});

test("Alte Passphrase auf PIN umstellen; Fehler lassen Daten und Schlüssel intakt", async (t) => {
  const crypto = require("node:crypto");
  const { encrypt } = require("../electron/vault.cjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kontor-pin-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const v = new Vault(path.join(dir, "data"));
  for (const pin of ["123", "12345", "abcd", "12 3", 1234])
    await assert.rejects(v.unlock(pin), /vier Ziffern/);
  await v.unlock("0123");
  v.command("save", { kind: "note", item: { title: "Bleibt erhalten" } });
  const salt = crypto.randomBytes(16);
  fs.writeFileSync(
    v.file,
    encrypt(
      Buffer.from(v.repo.db.export()),
      crypto.scryptSync("alte-passphrase", salt, 32),
      salt,
    ),
  );
  v.lock();
  await v.unlock("alte-passphrase");
  const backup = path.join(dir, "old-backup");
  v.backup(backup);
  assert.throws(() => v.changePin("falsch", "4567"));
  assert.throws(() => v.changePin("alte-passphrase", "12345"));
  const write = fs.renameSync;
  fs.renameSync = () => {
    throw Error("write failed");
  };
  try {
    assert.throws(() => v.changePin("alte-passphrase", "4567"), /write failed/);
  } finally {
    fs.renameSync = write;
  }
  v.persist();
  v.lock();
  await v.unlock("alte-passphrase");
  v.changePin("alte-passphrase", "0042");
  v.lock();
  await assert.rejects(v.unlock("alte-passphrase"));
  await v.unlock("0042");
  assert.equal(v.repo.all("note")[0].title, "Bleibt erhalten");
  await v.restore(backup, "alte-passphrase");
  assert.equal(v.repo.all("note")[0].title, "Bleibt erhalten");
  v.lock();
});
