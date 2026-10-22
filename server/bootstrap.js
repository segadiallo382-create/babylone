// Au démarrage sur un hébergeur : crée la base de démo seulement si elle n'existe pas encore.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = process.env.BABYLONE_DATA || join(dirname(fileURLToPath(import.meta.url)), "..", "data");
if (!existsSync(join(DATA_DIR, "babylone.db"))) await import("./seed.js");
else console.log("Base existante conservée.");
