import { createLocalRecall } from "@j4ndrw/local-recall-core";
import {
  DEFAULT_CHROMA_DB,
  DEFAULT_CHROMA_HOST,
  DEFAULT_OLLAMA_HOST,
} from "@j4ndrw/local-recall-core/constants";

import { ChromaClient } from "chromadb";
import { Ollama } from "ollama";

import dotenv from "dotenv";

dotenv.config();

const localRecall = createLocalRecall(
  new Ollama({ host: process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST }),
  new ChromaClient({
    database: process.env.CHROMA_DB ?? DEFAULT_CHROMA_DB,
    path: process.env.CHROMA_HOST ?? DEFAULT_CHROMA_HOST,
  }),
  { query: { maxResultsPerQuery: 15 } },
);

async function main() {
  await localRecall.init();

  console.log("Recording started...");
  await localRecall.record({ everyMs: 3000, maxScreenshots: 3 });
  console.log("Recording ended...");

  console.log("Querying...");
  const { results, error } = await localRecall.query(
    "Could you tell me what songs I was listening to a few moments ago?",
  );
  if (error) {
    console.log(error);
    return;
  }

  for (const { id, doc } of results) {
    console.log(`[DOC-${id}]: ${doc}`);
    console.log("\n--------------------\n");
  }
}

main();
