import { ProgressResponse } from "ollama";
import { ollamaClientModule } from "..";

// https://github.com/ollama/ollama-js/blob/main/examples/pull-progress/pull.ts
const trackProgress = (model: string, progress: ProgressResponse) => {
  if (progress.digest) {
    let percent = 0;
    if (progress.completed && progress.total) {
      percent = Math.round((progress.completed / progress.total) * 100);
    }
    process.stdout.clearLine(0); // Clear the current line
    process.stdout.cursorTo(0); // Move cursor to the beginning of the line
    process.stdout.write(
      `Pulling model ${model} - ${progress.status} ${percent}%...`,
    ); // Write the new text
  }
};

export const pullModel = async (model: string) => {
  const ollamaClient = ollamaClientModule.getClient();

  const { models } = await ollamaClient.list();
  if (models.find(({ name }) => name === model)) return;

  const progress = await ollamaClient.pull({ model, stream: true });

  for await (const p of progress) trackProgress(model, p);

  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
};

export const pullModels = async (models: string[]) => {
  for await (const model of models) await pullModel(model);
};
