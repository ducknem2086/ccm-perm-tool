import fs from 'fs';
import path from 'path';

const planFile = process.argv[2];
const taskNum = process.argv[3];
const outFile = process.argv[4];

if (!planFile || !taskNum || !outFile) {
  console.error("Usage: node extract-task.js PLAN_FILE TASK_NUM OUT_FILE");
  process.exit(1);
}

const content = fs.readFileSync(planFile, 'utf8');
const lines = content.split(/\r?\n/);
let inFence = false;
let inTask = false;
const taskLines = [];

for (const line of lines) {
  if (line.startsWith('```')) {
    inFence = !inFence;
  }
  if (!inFence) {
    const match = line.match(/^###\s+Task\s+(\d+)/i);
    if (match) {
      if (match[1] === taskNum) {
        inTask = true;
      } else {
        inTask = false;
      }
    }
  }
  if (inTask) {
    taskLines.push(line);
  }
}

if (taskLines.length === 0) {
  console.error(`Task ${taskNum} not found`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, taskLines.join('\n'), 'utf8');
console.log(`Wrote ${outFile}`);
