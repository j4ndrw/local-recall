import { createLocalRecall } from "@j4ndrw/local-recall-core";
import {
  DEFAULT_CHROMA_DB,
  DEFAULT_CHROMA_HOST,
  DEFAULT_OLLAMA_HOST,
} from "@j4ndrw/local-recall-core/constants";

import { ChromaClient } from "chromadb";
import { Ollama } from "ollama";

import { exec } from "child_process";

import dotenv from "dotenv";

dotenv.config();

const localRecall = createLocalRecall(
  new Ollama({ host: process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST }),
  new ChromaClient({
    database: process.env.CHROMA_DB ?? DEFAULT_CHROMA_DB,
    path: process.env.CHROMA_HOST ?? DEFAULT_CHROMA_HOST,
  }),
  { query: { maxResultsPerQuery: 3 } },
);

async function main() {
  await localRecall.init({ reset: true });
  // await localRecall.record({ everyMs: 1000, maxScreenshotSets: 1 });
  const { stream, error } = await localRecall.query(
    "I was working on a recall agent earlier today, but I forgot the main idea of the implementation. Could you tell me what it is?",
  );

  if (error) {
    console.log(error);
    return;
  }

  let content = "";
  for await (const { response } of stream!) {
    process.stdout.write(response);
    content += response;
  }

  exec(
    `echo "${content.replaceAll('"', '\\"')}" | ~/Downloads/piper/piper --model ~/Downloads/piper/en_US-amy-medium.onnx --output-raw | aplay -r 22050 -f S16_LE -t raw - `,
    (err, output) => {
      // once the command has completed, the callback function is called
      if (err) {
        // log and return if we encounter an error
        console.error("could not execute command: ", err);
        return;
      }
      // log the output received from the command
      console.log("Output: \n", output);
    },
  );
}

main();
