const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const indexPath = path.join(__dirname, "index.js");
const backupPath = path.join(__dirname, `index.backup-${Date.now()}.js`);

if (!fs.existsSync(indexPath)) {
    console.error("❌ No encuentro index.js en esta carpeta.");
    process.exit(1);
}

const original = fs.readFileSync(indexPath, "utf8").replace(/\r\n/g, "\n");

if (original.includes("// KEYS DE LA WEB")) {
    console.error("❌ Tu index.js ya parece tener instalado el sistema de KEYS. No lo vuelvo a insertar.");
    process.exit(1);
}

const payloadBase64 = `H4sIAD...`;