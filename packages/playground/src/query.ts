import { createLocalRecall } from "@j4ndrw/local-recall-core";
import { exec } from "child_process";

import { Kafka } from "kafkajs";
import { DEFAULT_KAFKA_BROKER, DEFAULT_KAFKA_CLIENT_ID } from "@j4ndrw/local-recall-core/src/modules/clients/kafka/constants";

import { ChromaClient } from "chromadb";
import { DEFAULT_CHROMA_DB, DEFAULT_CHROMA_HOST } from "@j4ndrw/local-recall-core/src/modules/clients/chroma/constants";

import { Ollama } from "ollama";
import { DEFAULT_OLLAMA_HOST } from "@j4ndrw/local-recall-core/src/modules/clients/ollama/constants";

import dotenv from "dotenv";

dotenv.config();

const localRecall = createLocalRecall({
  ollamaClient: new Ollama({
    host: process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST,
  }),
  chromaClient: new ChromaClient({
    database: process.env.CHROMA_DB ?? DEFAULT_CHROMA_DB,
    path: process.env.CHROMA_HOST ?? DEFAULT_CHROMA_HOST,
  }),
  kafkaClient: new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID ?? DEFAULT_KAFKA_CLIENT_ID,
    brokers: [process.env.KAFKA_BROKER ?? DEFAULT_KAFKA_BROKER],
  }),
});

async function main() {
  const { stream, error } = await localRecall.query("What music did I listen to today?");

  let content = "";
  if (error) {
    content = error;
  } else {
    for await (const { response } of stream!) {
      process.stdout.write(response);
      content += response;
    }
  }

  exec(
    `echo "${content.replaceAll('"', '\\"')}" | ../../../external/piper/piper --model ../../../external/piper/en_US-amy-medium.onnx --output-raw | aplay -r 22050 -f S16_LE -t raw - `,
    (err, output) => {
      if (err) {
        console.error("could not execute command: ", err);
        return;
      }
      console.log("Output: \n", output);
    },
  );
}

main();
