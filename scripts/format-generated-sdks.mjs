import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = process.cwd();
const generatedDirectories = [
  path.join(repositoryRoot, "sdk/typescript/src/generated"),
  path.join(repositoryRoot, "sdk/python/src/soulfire"),
];

for (const directory of generatedDirectories) {
  await formatGeneratedDirectory(directory);
}

async function formatGeneratedDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await formatGeneratedDirectory(filePath);
      continue;
    }
    if (!isGeneratedSource(entry.name)) {
      continue;
    }

    const source = await readFile(filePath, "utf8");
    const formatted = `${source
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .join("\n")
      .trimEnd()}\n`;
    if (formatted !== source) {
      await writeFile(filePath, formatted);
    }
  }
}

function isGeneratedSource(fileName) {
  return (
    fileName.endsWith("_connect.py") ||
    fileName.endsWith("_pb2.py") ||
    fileName.endsWith("_pb2.pyi") ||
    fileName.endsWith("_pb.ts")
  );
}
