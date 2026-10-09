/**
 * Pre-deployment safety check. Run after `npm run build`:  npm run predeploy
 *
 * Fails if a file that git would publish, or the built site itself, contains an API-key-like string, a PDF,
 * an .env file, or a benchmark dry-run/raw-results file.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const problems: string[] = [];
const KEY_LIKE = /sk-ant-(?!test-)[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}/;
const FORBIDDEN_NAME = /(^|\/)\.env(\.(?!example$).+)?$|\.pdf$|dry-run-.*\.json$|(^|\/)docs\/benchmark\/results\/|\.pem$/i;

const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
for (const f of tracked) {
  if (FORBIDDEN_NAME.test(f)) problems.push(`tracked file should not be published: ${f}`);
  else if (KEY_LIKE.test(readFileSync(f, "utf8"))) problems.push(`key-like string in tracked file: ${f}`);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
let scanned = 0;
if (existsSync(".next")) {
  for (const f of walk(".next")) {
    if (/\.(js|css|html|json|rsc|txt|map|body|meta)$/.test(f) && !f.includes("/cache/") && !f.includes("\\cache\\")) {
      scanned++;
      if (KEY_LIKE.test(readFileSync(f, "utf8"))) problems.push(`key-like string in build output: ${f}`);
    }
  }
} else problems.push("no .next build found; run `npm run build` first");

for (const name of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]) {
  if (process.env[name]) problems.push(`${name} is set in this shell; unset it before building for deployment`);
}

if (problems.length > 0) {
  console.error("PRE-DEPLOY CHECK FAILED:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`Pre-deploy check passed: ${tracked.length} tracked files and ${scanned} build files scanned; no keys, PDFs, .env files or dry-run outputs would be published.`);
