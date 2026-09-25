const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const initSqlJs = require("sql.js");
const { Repository } = require("./repository.cjs");
const MAGIC = Buffer.from("KONTORW1");
function validatePin(pin) {
  if (typeof pin !== "string" || !/^[0-9]{4}$/.test(pin))
    throw Error("Bitte genau vier Ziffern für die PIN eingeben.");
}
function derive(password, salt) {
  if (typeof password !== "string" || password.length > 1024)
    throw Error("Ungültige Passphrase.");
  return crypto.scryptSync(password, salt, 32);
}
function encrypt(bytes, key, salt) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), data]);
}
function decrypt(bytes, password) {
  if (bytes.length < 60 || !bytes.subarray(0, 8).equals(MAGIC))
    throw Error("Keine gültige Kontor-Windows-Sicherung.");
  const salt = bytes.subarray(8, 24),
    key = derive(password, salt);
  try {
    const c = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      bytes.subarray(24, 36),
    );
    c.setAAD(MAGIC);
    c.setAuthTag(bytes.subarray(36, 52));
    return {
      data: Buffer.concat([c.update(bytes.subarray(52)), c.final()]),
      key,
      salt,
    };
  } catch {
    key.fill(0);
    throw Error("Die Passphrase ist falsch oder die Datei ist beschädigt.");
  }
}
function atomicWrite(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + "." + crypto.randomUUID() + ".tmp";
  let fd;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temp, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
class Vault {
  constructor(file) {
    this.file = file;
    this.repo = null;
    this.key = null;
    this.salt = null;
  }
  get exists() {
    return fs.existsSync(this.file);
  }
  async unlock(password) {
    if (this.repo) return;
    const SQL = await initSqlJs({
      locateFile: (f) => require.resolve("sql.js/dist/" + f),
    });
    let data;
    if (this.exists) {
      const decoded = decrypt(fs.readFileSync(this.file), password);
      data = decoded.data;
      this.key = decoded.key;
      this.salt = decoded.salt;
    } else {
      validatePin(password);
      this.salt = crypto.randomBytes(16);
      this.key = derive(password, this.salt);
    }
    try {
      this.repo = new Repository(new SQL.Database(data));
      this.persist();
    } catch (e) {
      this.lock();
      throw e;
    }
  }
  changePin(current, pin) {
    if (!this.repo) throw Error("Kontor ist gesperrt.");
    validatePin(pin);
    const verified = decrypt(fs.readFileSync(this.file), current);
    verified.key.fill(0);
    verified.data.fill(0);
    const salt = crypto.randomBytes(16);
    const key = derive(pin, salt);
    try {
      atomicWrite(
        this.file,
        encrypt(Buffer.from(this.repo.db.export()), key, salt),
      );
    } catch (error) {
      key.fill(0);
      throw error;
    }
    this.key.fill(0);
    this.key = key;
    this.salt = salt;
  }
  persist() {
    if (!this.repo) throw Error("Kontor ist gesperrt.");
    atomicWrite(
      this.file,
      encrypt(Buffer.from(this.repo.db.export()), this.key, this.salt),
    );
  }
  command(c, a) {
    if (!this.repo) throw Error("Kontor ist gesperrt.");
    return this.repo.transaction(
      () => this.repo.command(c, a),
      () => this.persist(),
    );
  }
  backup(file) {
    this.persist();
    if (path.resolve(file) === path.resolve(this.file))
      throw Error("Bitte einen anderen Speicherort wählen.");
    atomicWrite(file, fs.readFileSync(this.file));
  }
  // One file per local calendar day; only files matching the automatic name are pruned.
  autoBackup(dir, { force = false, keep = 14, day = new Date() } = {}) {
    if (!this.repo) throw Error("Kontor ist gesperrt.");
    const stamp = day.toLocaleDateString("sv-SE");
    const file = path.join(dir, `Kontor-Auto-${stamp}.kontorbackup`);
    if (!force && fs.existsSync(file)) return null;
    this.backup(file);
    const pattern = /^Kontor-Auto-\d{4}-\d{2}-\d{2}\.kontorbackup$/;
    for (const name of fs
      .readdirSync(dir)
      .filter((n) => pattern.test(n))
      .sort()
      .reverse()
      .slice(keep))
      fs.unlinkSync(path.join(dir, name));
    return file;
  }
  async restore(file, password) {
    const bytes = fs.readFileSync(file);
    const decoded = decrypt(bytes, password);
    const SQL = await initSqlJs({
      locateFile: (f) => require.resolve("sql.js/dist/" + f),
    });
    let candidate;
    try {
      candidate = new Repository(new SQL.Database(decoded.data));
      candidate.snapshot();
    } catch (e) {
      candidate?.db.close();
      decoded.key.fill(0);
      throw Error("Die Sicherung enthält keine lesbare Kontor-Datenbank.");
    }
    try {
      if (this.exists)
        atomicWrite(
          this.file + ".vor-import.kontorbackup",
          fs.readFileSync(this.file),
        );
      atomicWrite(this.file, bytes);
    } catch (e) {
      candidate.db.close();
      decoded.key.fill(0);
      throw e;
    }
    this.lock();
    this.repo = candidate;
    this.key = decoded.key;
    this.salt = decoded.salt;
  }
  lock() {
    this.repo?.db.close();
    this.repo = null;
    this.key?.fill(0);
    this.key = null;
    this.salt = null;
  }
}
module.exports = { Vault, atomicWrite, decrypt, encrypt };
