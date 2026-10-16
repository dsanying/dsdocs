import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
export async function collectLicenses(application, output) {
  const groups = JSON.parse(
    execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
      cwd: path.join(root, application),
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
  );
  const packages = Object.values(groups)
    .flat()
    .sort((a, b) => a.name.localeCompare(b.name));
  const fallback = JSON.parse(await readFile(path.join(root, 'licenses/manifest.json'), 'utf8'));
  const sections = [
    'DSdocs project license:\n' + (await readFile(path.join(root, 'LICENSE'), 'utf8')),
    'Third-party notices. Each dependency retains its original license.',
  ];
  const missing = [];
  for (const dependency of packages) {
    const directory = dependency.paths[0],
      names = await readdir(directory);
    const notices = names.filter((name) => /^(?:licen[sc]e|copying|notice)(?:$|[._-])/i.test(name));
    sections.push(
      `\n${dependency.name} ${dependency.versions.join(', ')}\nLicense: ${dependency.license}`
    );
    if (!notices.length) {
      const known = fallback[dependency.name];
      if (known && dependency.versions.length === 1 && dependency.versions[0] === known.version) {
        sections.push(await readFile(path.join(root, 'licenses', known.file), 'utf8'));
        continue;
      }
      const readme = names.find((name) => /^readme(?:\.md)?$/i.test(name));
      if (readme) {
        const text = await readFile(path.join(directory, readme), 'utf8');
        const start = text.search(/^(?:#{1,3}\s+Licen[sc]e\s*$|Licen[sc]e\s*\n[-=]+\s*$)/im);
        if (start >= 0 && /Permission is hereby granted/.test(text.slice(start))) {
          sections.push(text.slice(start));
          continue;
        }
      }
      missing.push(dependency.name);
      continue;
    }
    for (const name of notices) {
      const file = path.join(directory, name);
      try {
        sections.push(await readFile(file, 'utf8'));
      } catch (error) {
        if (error.code !== 'EISDIR') throw error;
      }
    }
  }
  await mkdir(path.dirname(output instanceof URL ? fileURLToPath(output) : output), { recursive: true });
  await writeFile(output, sections.join('\n\n') + '\n');
  if (missing.length) throw new Error(`Missing license files: ${missing.join(', ')}`);
}
